import { agentMessageChunk, STOP_REASONS } from "../core/acp.js";
import { buildWorkspacePrompt } from "../core/session-context.js";
import { AdapterUnavailableError } from "./index.js";

const DEFAULT_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", modelId: "gpt-4o" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", modelId: "gpt-4o-mini" },
  { id: "o1", name: "o1", modelId: "o1" },
  { id: "o1-mini", name: "o1 Mini", modelId: "o1-mini" },
];

/** @param {string} projectPath @returns {string} */
const defaultSystemPrompt = (projectPath) =>
  `You are a helpful coding assistant. Be concise and practical. Current working directory: ${projectPath}`;

/** @param {ContentBlock[] | string | any} prompt @returns {string} */
const promptToText = (prompt) => {
  if (typeof prompt === "string") return prompt;
  if (Array.isArray(prompt)) return prompt.map((b) => b?.text || "").join("");
  return String(prompt || "");
};

/** @param {SessionUpdate} u @returns {SessionUpdate} */
const emit = (u) => u;

/**
 * @typedef CodexDeps
 * @property {any} getClient
 * @property {string} projectPath
 * @property {(alias: string | undefined) => string} resolveModelId
 *
 * @param {CodexDeps} deps
 * @param {CreateSessionOptions} [options]
 * @returns {Promise<CodexSession>}
 */
const createSession = async (deps, options = {}) => {
  const { model, customPrompt, mcpConfig, workspaceContext } = options;
  const sessionId = `codex_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return {
    id: sessionId,
    model: deps.resolveModelId(model),
    customPrompt,
    workspaceContext,
    mcpConfig,
    messages: [],
    isStreaming: false,
    abortController: null,
  };
};

/**
 * @param {CodexDeps} deps
 * @returns {(session: CodexSession, prompt: ContentBlock[] | string, context: AdapterContext) => AsyncGenerator<SessionUpdate, StopReason, void>}
 */
const makeSendStream = (deps) => async function* (session, prompt) {
  const client = deps.getClient();
  if (!client)
    throw new Error("OpenAI client not initialized. Set OPENAI_API_KEY or install openai package.");

  const text = promptToText(prompt);
  session.messages.push({ role: "user", content: text });
  session.isStreaming = true;
  session.abortController = new AbortController();

  const cwd = session.workspaceContext?.root || deps.projectPath;
  const basePrompt = session.customPrompt || defaultSystemPrompt(cwd);
  const workspaceBlock = buildWorkspacePrompt(session.workspaceContext);
  const systemPrompt = workspaceBlock ? `${basePrompt}\n\n${workspaceBlock}` : basePrompt;

  let full = "";
  try {
    const stream = await client.chat.completions.create(
      {
        model: session.model,
        messages: [{ role: "system", content: systemPrompt }, ...session.messages],
        stream: true,
      },
      { signal: session.abortController.signal },
    );

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        full += content;
        yield emit(agentMessageChunk(content));
      }
    }

    session.messages.push({ role: "assistant", content: full });
    return STOP_REASONS.END_TURN;
  } catch (e) {
    if (e.name === "AbortError") return STOP_REASONS.CANCELLED;
    throw e;
  } finally {
    session.isStreaming = false;
    session.abortController = null;
  }
};

/** @param {CodexSession} session */
const cancelSession = async (session) => {
  if (session.abortController) session.abortController.abort();
};

/** @param {CodexSession} session */
const closeSession = async (session) => {
  session.messages = [];
};

/**
 * @param {AdapterFactoryOptions & { projectPath?: string, apiKey?: string }} [deps]
 * @returns {AdapterContract}
 */
export default (deps = {}) => {
  const projectPath = deps.projectPath || process.cwd();
  const defaultModel = deps.defaultModel || "gpt-4o";
  const apiKey = deps.apiKey || process.env.OPENAI_API_KEY;

  /** @type {any} */
  let client = null;

  /** @param {string | undefined} alias @returns {string} */
  const resolveModelId = (alias) => {
    const m = DEFAULT_MODELS.find((x) => x.id === alias);
    return m?.modelId || alias || defaultModel;
  };

  /** @type {CodexDeps} */
  const adapterDeps = {
    getClient: () => client,
    projectPath,
    resolveModelId,
  };

  const sendStream = makeSendStream(adapterDeps);

  return {
    name: "codex",
    displayName: "OpenAI Codex",
    models: DEFAULT_MODELS,
    async initialize() {
      try {
        const { default: OpenAI } = await import("openai");
        client = new OpenAI({ apiKey });
      } catch {
        throw new AdapterUnavailableError("install `openai` to enable");
      }
    },
    createSession: (options) => createSession(adapterDeps, options),
    send: sendStream,
    cancel: cancelSession,
    close: closeSession,
  };
};
