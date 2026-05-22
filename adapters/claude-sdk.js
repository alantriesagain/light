import {
  inferToolKind,
  defaultPermissionOptions,
  STOP_REASONS,
} from "../core/acp.js";
import { translateSdkMessage } from "../core/translators/claude.js";
import { composeSystemPrompt } from "../core/session-context.js";
import { AdapterUnavailableError } from "./index.js";

/**
 * @typedef ClaudeSdkSession
 * @property {string} id
 * @property {string} model
 * @property {string} [customPrompt]
 * @property {WorkspaceContext} [workspaceContext]
 * @property {any} [mcpConfig]
 * @property {string | null} sdkSessionId
 * @property {any} queryInstance
 * @property {boolean} isStreaming
 *
 * @typedef ClaudeSdkDeps
 * @property {() => any} getSdk
 * @property {string} projectPath
 * @property {Record<string, any>} mcpServersConfig
 * @property {any[]} allTools
 * @property {(alias: string | undefined) => string} resolveModelId
 */

const READ_ONLY_TOOLS = ["Read", "Glob", "Grep", "LS", "WebFetch", "WebSearch", "Task", "TodoRead"];

const DEFAULT_MODELS = [
  { id: "sonnet", name: "Claude Sonnet", modelId: "claude-sonnet-4-5-20250929" },
  { id: "opus", name: "Claude Opus", modelId: "claude-opus-4-5-20250514" },
  { id: "haiku", name: "Claude Haiku", modelId: "claude-haiku-3-5-20241022" },
];

/** @param {ContentBlock[] | string | any} prompt @returns {string} */
const promptToText = (prompt) => {
  if (typeof prompt === "string") return prompt;
  if (Array.isArray(prompt)) return prompt.map((b) => b?.text || "").join("");
  return String(prompt || "");
};

/** @param {string} fullToolName @returns {string} */
const extractToolName = (fullToolName) => {
  if (fullToolName.startsWith("mcp__")) {
    const parts = fullToolName.split("__");
    return parts[parts.length - 1];
  }
  return fullToolName;
};

/** @param {SessionUpdate} u @returns {SessionUpdate} */
const emit = (u) => u;

/**
 * @param {ClaudeSdkDeps} deps
 * @param {CreateSessionOptions} [options]
 * @returns {Promise<ClaudeSdkSession>}
 */
const createSession = async (deps, options = {}) => {
  const { model, customPrompt, mcpConfig, workspaceContext } = options;
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return {
    id: sessionId,
    model: deps.resolveModelId(model),
    customPrompt,
    workspaceContext,
    mcpConfig,
    sdkSessionId: null,
    queryInstance: null,
    isStreaming: false,
  };
};

/**
 * @param {ClaudeSdkDeps} deps
 * @returns {(session: ClaudeSdkSession, prompt: ContentBlock[] | string, context: AdapterContext) => AsyncGenerator<SessionUpdate, StopReason, void>}
 */
const makeSendStream = (deps) => async function* (session, prompt, context) {
  const sdk = deps.getSdk();
  if (!sdk)
    throw new Error("Claude SDK not initialized. Install @anthropic-ai/claude-agent-sdk.");

  const { query } = sdk;

  const disallowedTools = [];
  for (const tool of deps.allTools)
    if (session.mcpConfig?.tools?.[tool.name] === false)
      disallowedTools.push(tool.fullName);

  const canUseTool = async (/** @type {string} */ toolName, /** @type {any} */ input) => {
    const shortName = extractToolName(toolName);
    if (session.mcpConfig?.tools && session.mcpConfig.tools[shortName] === false)
      return { behavior: "deny", message: `Tool ${shortName} is not enabled` };

    if (READ_ONLY_TOOLS.includes(toolName))
      return { behavior: "allow", updatedInput: input };

    if (!context.requestPermission)
      return { behavior: "deny", message: "No client connected to approve permission" };

    const toolCallId = `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const reply = await context.requestPermission({
      toolCall: { toolCallId, title: toolName, kind: inferToolKind(toolName), rawInput: input },
      options: defaultPermissionOptions(),
    });

    const outcome = reply?.outcome;
    const selected = outcome && outcome.outcome === "selected" ? outcome.optionId : null;
    if (selected && selected.startsWith("allow"))
      return {
        behavior: "allow",
        updatedInput: input,
        updatedPermissions: selected === "allow_always"
          ? [{ type: "addRules", rules: [{ toolName }], behavior: "allow", destination: "session" }]
          : undefined,
      };
    return { behavior: "deny", message: "User denied permission" };
  };

  const appendPrompt = composeSystemPrompt(session.customPrompt, session.workspaceContext);

  /** @type {any} */
  const queryOptions = {
    model: session.model,
    systemPrompt: appendPrompt
      ? { type: "preset", preset: "claude_code", append: appendPrompt }
      : { type: "preset", preset: "claude_code" },
    settingSources: ["project"],
    permissionMode: "default",
    cwd: session.workspaceContext?.root || deps.projectPath,
    canUseTool,
    mcpServers: deps.mcpServersConfig,
    disallowedTools: disallowedTools.length > 0 ? disallowedTools : undefined,
  };

  if (session.sdkSessionId) queryOptions.resume = session.sdkSessionId;

  session.isStreaming = true;

  try {
    const queryResult = query({ prompt: promptToText(prompt), options: queryOptions });
    session.queryInstance = queryResult;

    for await (const msg of queryResult)
      for (const update of translateSdkMessage(msg, session))
        yield emit(update);

    return STOP_REASONS.END_TURN;
  } finally {
    session.isStreaming = false;
  }
};

/** @param {ClaudeSdkSession} session */
const cancelSession = async (session) => {
  if (session.queryInstance?.abort)
    session.queryInstance.abort();
};

const closeSession = async () => {};

/** @param {ClaudeSdkSession} session */
const getMcpStatus = async (session) => {
  if (!session.queryInstance) return { servers: [] };
  try {
    const status = await session.queryInstance.mcpServerStatus();
    return { servers: status };
  } catch (e) {
    return { servers: [], error: e.message };
  }
};

/**
 * @param {AdapterFactoryOptions & { projectPath?: string }} [deps]
 * @returns {AdapterContract}
 */
export default (deps = {}) => {
  const projectPath = deps.projectPath || process.cwd();
  const defaultModel = deps.defaultModel || "claude-sonnet-4-5-20250929";
  const mcpServersConfig = deps.mcpServersConfig || {};
  const allTools = deps.allTools || [];

  /** @type {any} */
  let sdk = null;

  /** @param {string | undefined} alias @returns {string} */
  const resolveModelId = (alias) => {
    const m = DEFAULT_MODELS.find((x) => x.id === alias);
    return m?.modelId || alias || defaultModel;
  };

  /** @type {ClaudeSdkDeps} */
  const adapterDeps = {
    getSdk: () => sdk,
    projectPath,
    mcpServersConfig,
    allTools,
    resolveModelId,
  };

  const sendStream = makeSendStream(adapterDeps);

  return {
    name: "claude-sdk",
    displayName: "Claude (SDK)",
    models: DEFAULT_MODELS,
    async initialize() {
      try {
        sdk = await import("@anthropic-ai/claude-agent-sdk");
      } catch {
        throw new AdapterUnavailableError("install `@anthropic-ai/claude-agent-sdk` to enable");
      }
    },
    createSession: (options) => createSession(adapterDeps, options),
    send: sendStream,
    cancel: cancelSession,
    close: closeSession,
    getMcpStatus,
  };
};
