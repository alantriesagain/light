import { spawn } from "child_process";
import { randomUUID } from "crypto";
import {
  inferToolKind,
  defaultPermissionOptions,
  STOP_REASONS,
} from "../core/acp.js";
import { translateStreamJson } from "../core/translators/claude.js";
import { composeSystemPrompt } from "../core/session-context.js";

const DEFAULT_MODELS = [
  { id: "default", name: "Default (claude default)" },
  { id: "claude-opus-4-7", name: "Claude Opus 4.7" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
];

const stripClaudeEnv = (env) => {
  const out = { ...env };
  delete out.CLAUDECODE;
  delete out.CLAUDE_CODE_ENTRYPOINT;
  delete out.CLAUDE_CODE_EXECPATH;
  return out;
};

/** @param {ContentBlock[] | string | any} prompt @returns {string} */
const promptToText = (prompt) => {
  if (typeof prompt === "string") return prompt;
  if (Array.isArray(prompt)) return prompt.map((b) => b?.text || "").join("");
  return String(prompt || "");
};

/** @param {ClaudeCliSession} session @param {any} obj */
const wsSend = (session, obj) => {
  const line = JSON.stringify(obj);
  if (session.ws && session.ws.readyState === 1)
    session.ws.send(line + "\n");
  else
    session.outboundQueue.push(line);
};

/** @param {ClaudeCliSession} session @returns {Promise<any>} */
const wsReceive = (session) => {
  if (session.inboundQueue.length > 0)
    return Promise.resolve(session.inboundQueue.shift());
  return new Promise((resolve) => { session.inboundWaiter = resolve; });
};

/** @param {ClaudeCliSession} session @param {any} ws */
const attachWebSocket = (session, ws) => {
  session.ws = ws;

  ws.on("message", (raw) => {
    const text = raw.toString();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (session.inboundWaiter) {
        const w = session.inboundWaiter;
        session.inboundWaiter = null;
        w(msg);
      } else
        session.inboundQueue.push(msg);
    }
  });

  ws.on("close", () => {
    session.ws = null;
    if (session.inboundWaiter) {
      const w = session.inboundWaiter;
      session.inboundWaiter = null;
      w(null);
    }
  });

  ws.on("error", (e) => process.stderr.write(`[claude ${session.id.slice(0, 8)}] ws error: ${e.message}\n`));

  while (session.outboundQueue.length > 0)
    ws.send(session.outboundQueue.shift() + "\n");
};

/**
 * @param {ClaudeCliSession} session
 * @param {any} msg
 * @param {AdapterContext} context
 */
const handlePermissionRequest = async (session, msg, context) => {
  const requestId = msg.request_id;
  const toolName = msg.request.tool_name || msg.request.name;
  const toolInput = msg.request.input || {};

  const reply = await context.requestPermission?.({
    toolCall: {
      toolCallId: requestId,
      title: toolName,
      kind: inferToolKind(toolName),
      rawInput: toolInput,
    },
    options: defaultPermissionOptions(),
  });

  const outcome = reply?.outcome;
  const selected = outcome && outcome.outcome === "selected" ? outcome.optionId : null;
  const approved = !!selected && selected.startsWith("allow");

  wsSend(session, {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response: approved
        ? { behavior: "allow", updatedInput: toolInput }
        : { behavior: "deny", message: "User denied" },
    },
  });
};

/**
 * @typedef ClaudeCliConfig
 * @property {string} command
 * @property {string} bridgeHost
 * @property {number} bridgePort
 * @property {Record<string, any>} mcpServersConfig
 */

/**
 * @param {ClaudeCliConfig} config
 * @param {CreateSessionOptions} [options]
 * @returns {Promise<ClaudeCliSession>}
 */
const createSession = async (config, options = {}) => {
  const { model, customPrompt, mcpConfig, claudeSessionId, workspaceContext } = options;
  const sessionId = randomUUID();

  const url = `ws://${config.bridgeHost}:${config.bridgePort}/ws/cli/${sessionId}`;
  const args = [
    "--sdk-url", url,
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];
  if (model && model !== "default") args.push("--model", model);
  if (claudeSessionId) args.push("--resume", claudeSessionId);

  const mergedMcp = { ...config.mcpServersConfig, ...(mcpConfig?.servers || {}) };
  if (Object.keys(mergedMcp).length > 0)
    args.push("--mcp-config", JSON.stringify({ mcpServers: mergedMcp }));

  const appendPrompt = composeSystemPrompt(customPrompt, workspaceContext);
  if (appendPrompt) args.push("--append-system-prompt", appendPrompt);
  args.push("-p", "");

  const env = stripClaudeEnv(process.env);
  const proc = spawn(config.command, args, { env, stdio: ["ignore", "pipe", "pipe"] });

  proc.stderr?.on("data", (d) => process.stderr.write(`[claude ${sessionId.slice(0, 8)}] ${d}`));
  proc.on("error", (e) => process.stderr.write(`[claude ${sessionId}] spawn error: ${e.message}\n`));

  return {
    id: sessionId,
    proc,
    ws: null,
    outboundQueue: [],
    inboundQueue: [],
    inboundWaiter: null,
    claudeSessionId: claudeSessionId || null,
    isStreaming: false,
    mcpConfig,
    customPrompt,
    workspaceContext,
    model,
  };
};

/**
 * Type-constrained yield emitter. Every yield in `sendStream` flows through this,
 * so an off-shape value becomes a tsc error at the yield site.
 *
 * @param {SessionUpdate} u
 * @returns {SessionUpdate}
 */
const emit = (u) => u;

/**
 * Stream agent output as ACP SessionUpdates until the turn ends.
 *
 * @type {(session: ClaudeCliSession, prompt: ContentBlock[]|string, context: AdapterContext) => AsyncGenerator<SessionUpdate, StopReason, void>}
 */
const sendStream = async function* (session, prompt, context) {
  session.isStreaming = true;
  try {
    wsSend(session, {
      type: "user",
      message: { role: "user", content: promptToText(prompt) },
      parent_tool_use_id: null,
      session_id: session.claudeSessionId || session.id,
    });

    while (true) {
      const msg = await wsReceive(session);
      if (!msg) throw new Error("Claude WebSocket closed unexpectedly");

      if (msg.type === "control_request" && msg.request?.subtype === "can_use_tool") {
        await handlePermissionRequest(session, msg, context);
        continue;
      }

      if (msg.type === "result") {
        if (msg.session_id) session.claudeSessionId = msg.session_id;
        return "end_turn";
      }

      if (msg.type === "error")
        throw new Error(msg.message || msg.error || "claude error");

      for (const update of translateStreamJson(msg, session))
        yield emit(update);
    }
  } finally {
    session.isStreaming = false;
  }
};

/** @param {ClaudeCliSession} session */
const cancelSession = async (session) => {
  if (!session.ws) return;
  wsSend(session, {
    type: "control_request",
    request_id: `int_${Date.now()}`,
    request: { subtype: "interrupt" },
  });
};

/** @param {ClaudeCliSession} session */
const closeSession = async (session) => {
  if (session.ws) {
    try { session.ws.close(); } catch {}
    session.ws = null;
  }
  if (session.proc && !session.proc.killed)
    session.proc.kill("SIGTERM");
};

/**
 * @param {AdapterFactoryOptions & { command?: string, models?: any[] }} [config]
 * @returns {AdapterContract}
 */
export default (config = {}) => {
  /** @type {ClaudeCliConfig} */
  const cfg = {
    command: config.command || "claude",
    bridgeHost: config.bridgeHost || "localhost",
    bridgePort: config.bridgePort || 8765,
    mcpServersConfig: config.mcpServersConfig || {},
  };
  const models = config.models || DEFAULT_MODELS;

  return {
    name: "claude",
    displayName: "Claude (CLI)",
    models,
    attachWebSocket,
    createSession: (options) => createSession(cfg, options),
    send: sendStream,
    cancel: cancelSession,
    close: closeSession,
  };
};
