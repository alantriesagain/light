import { spawn } from "child_process";
import { STOP_REASONS, PROTOCOL_VERSION } from "../core/acp.js";

/**
 * @typedef AcpDeps
 * @property {string} command
 * @property {string[]} args
 * @property {Record<string, string>} env
 * @property {Array<{id: string, name: string}>} models
 */

const createJsonRpcStream = (stdout, stdin) => {
  let buffer = "";
  /** @type {any[]} */
  const inboundQueue = [];
  /** @type {((r: any) => void) | null} */
  let inboundResolver = null;
  let nextRequestId = 0;
  /** @type {Map<number, {resolve: (v: any) => void, reject: (e: any) => void}>} */
  const pendingResponses = new Map();

  const handle = (/** @type {any} */ msg) => {
    if (msg.id !== undefined && msg.method === undefined && pendingResponses.has(msg.id)) {
      const pending = pendingResponses.get(msg.id);
      pendingResponses.delete(msg.id);
      pending?.resolve(msg);
      return;
    }
    if (inboundResolver) {
      const r = inboundResolver;
      inboundResolver = null;
      r({ msg });
    } else
      inboundQueue.push(msg);
  };

  stdout.on("data", (/** @type {Buffer} */ chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines)
      if (line.trim())
        try { handle(JSON.parse(line)); } catch {}
  });

  stdout.on("end", () => {
    if (inboundResolver) {
      inboundResolver(null);
      inboundResolver = null;
    }
  });

  const write = (/** @type {any} */ obj) => /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    stdin.write(JSON.stringify(obj) + "\n", (err) => (err ? reject(err) : resolve()));
  }));

  return {
    /** @param {string} method @param {any} params */
    request(method, params) {
      const id = ++nextRequestId;
      return new Promise((resolve, reject) => {
        pendingResponses.set(id, { resolve, reject });
        write({ jsonrpc: "2.0", id, method, params }).catch((err) => {
          pendingResponses.delete(id);
          reject(err);
        });
      });
    },
    /** @param {string} method @param {any} params */
    notify(method, params) {
      return write({ jsonrpc: "2.0", method, params });
    },
    /** @param {number} id @param {any} result */
    reply(id, result) {
      return write({ jsonrpc: "2.0", id, result });
    },
    /** @param {number} id @param {number} code @param {string} message */
    replyError(id, code, message) {
      return write({ jsonrpc: "2.0", id, error: { code, message } });
    },
    nextInbound() {
      if (inboundQueue.length > 0) return Promise.resolve({ msg: inboundQueue.shift() });
      return /** @type {Promise<any>} */ (new Promise((resolve) => { inboundResolver = resolve; }));
    },
  };
};

/** @param {SessionUpdate} u @returns {SessionUpdate} */
const emit = (u) => u;

/**
 * @param {AcpDeps} deps
 * @param {CreateSessionOptions} [options]
 * @returns {Promise<AcpSession>}
 */
const createSession = async (deps, options = {}) => {
  if (!deps.command)
    throw new Error("ACP adapter requires `command` in config");

  const { model, customPrompt, mcpServers } = options;
  const sessionId = `acp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const proc = spawn(deps.command, deps.args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...deps.env },
  });

  proc.stderr?.on("data", (d) => process.stderr.write(`[acp ${sessionId.slice(0, 8)}] ${d}`));

  const stream = createJsonRpcStream(proc.stdout, proc.stdin);

  const initResp = /** @type {any} */ (await stream.request("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {},
  }));
  if (initResp.error) {
    proc.kill();
    throw new Error(`ACP initialize failed: ${initResp.error.message}`);
  }

  const newResp = /** @type {any} */ (await stream.request("session/new", {
    cwd: process.cwd(),
    mcpServers: mcpServers || [],
    ...(customPrompt ? { systemPrompt: customPrompt } : {}),
  }));
  if (newResp.error) {
    proc.kill();
    throw new Error(`ACP session/new failed: ${newResp.error.message}`);
  }

  return {
    id: sessionId,
    proc,
    stream,
    acpSessionId: newResp.result?.sessionId || sessionId,
    model: model || deps.models[0]?.id || "default",
    isStreaming: false,
  };
};

/**
 * @type {(session: AcpSession, prompt: ContentBlock[] | string, context: AdapterContext) => AsyncGenerator<SessionUpdate, StopReason, void>}
 */
const sendStream = async function* (session, prompt, context) {
  const promptBlocks = Array.isArray(prompt)
    ? prompt
    : [{ type: "text", text: typeof prompt === "string" ? prompt : String(prompt) }];

  session.isStreaming = true;

  const promptPromise = session.stream.request("session/prompt", {
    sessionId: session.acpSessionId,
    prompt: promptBlocks,
  });

  try {
    while (session.isStreaming) {
      const next = /** @type {any} */ (await Promise.race([
        session.stream.nextInbound(),
        promptPromise.then((r) => ({ __promptResult: r })),
      ]));

      if (next?.__promptResult !== undefined) {
        const r = next.__promptResult;
        if (r.error) throw new Error(r.error.message);
        return r.result?.stopReason || STOP_REASONS.END_TURN;
      }

      if (!next) continue;
      const { msg } = next;

      if (msg.method === "session/update") {
        if (msg.params?.sessionId === session.acpSessionId)
          yield emit(msg.params.update);
        continue;
      }

      if (msg.method === "session/request_permission" && msg.id !== undefined) {
        const outcome = await context.requestPermission?.(msg.params)
          ?? { outcome: { outcome: "selected", optionId: "reject_once" } };
        session.stream.reply(msg.id, outcome);
        continue;
      }

      if (msg.method && msg.id !== undefined)
        session.stream.replyError(msg.id, -32601, `Unknown method: ${msg.method}`);
    }

    return STOP_REASONS.END_TURN;
  } finally {
    session.isStreaming = false;
  }
};

/** @param {AcpSession} session */
const cancelSession = async (session) => {
  session.isStreaming = false;
  try {
    await session.stream.notify("session/cancel", { sessionId: session.acpSessionId });
  } catch {}
};

/** @param {AcpSession} session */
const closeSession = async (session) => {
  session.isStreaming = false;
  if (session.proc && !session.proc.killed)
    session.proc.kill("SIGTERM");
};

/**
 * @param {{ name?: string, displayName?: string, command?: string, args?: string[], env?: Record<string, string>, models?: any[] }} [config]
 * @returns {AdapterContract}
 */
export default (config = {}) => {
  /** @type {AcpDeps} */
  const deps = {
    command: config.command || "",
    args: config.args || [],
    env: config.env || {},
    models: config.models || [{ id: "default", name: "Default" }],
  };

  return {
    name: config.name || "acp",
    displayName: config.displayName || "ACP Agent",
    models: deps.models,
    createSession: (options) => createSession(deps, options),
    send: sendStream,
    cancel: cancelSession,
    close: closeSession,
  };
};
