import * as router from "./router.js";
import { PROTOCOL_VERSION, AGENT_CAPABILITIES, STOP_REASONS } from "../core/acp.js";

/** @param {{ cfg?: any, log?: (msg: string) => void }} [opts] */
export const createDispatcher = ({ cfg, log = () => {} } = {}) => {
  return (transport) => {
    let nextOutboundId = 0;
    const pendingOutbound = new Map();
    const sessionSubscribers = new Map();

    const send = (msg) => transport.send(msg);

    const notify = (method, params) => send({ jsonrpc: "2.0", method, params });

    const reply = (id, result) => send({ jsonrpc: "2.0", id, result });

    const replyError = (id, code, message) =>
      send({ jsonrpc: "2.0", id, error: { code, message } });

    const requestOutbound = (method, params) => {
      const id = `s${++nextOutboundId}`;
      return new Promise((resolve, reject) => {
        pendingOutbound.set(id, { resolve, reject });
        send({ jsonrpc: "2.0", id, method, params }).catch((err) => {
          pendingOutbound.delete(id);
          reject(err);
        });
      });
    };

    const handle = async (msg) => {
      log(`<- ${msg.method || `response#${msg.id}`}`);

      if (msg.id !== undefined && msg.method === undefined && pendingOutbound.has(msg.id)) {
        const { resolve } = pendingOutbound.get(msg.id);
        pendingOutbound.delete(msg.id);
        resolve(msg.result !== undefined ? msg.result : { error: msg.error });
        return;
      }

      const id = msg.id;
      try {
        if (msg.method === "initialize") {
          reply(id, {
            protocolVersion: PROTOCOL_VERSION,
            agentCapabilities: AGENT_CAPABILITIES,
            authMethods: [],
          });
          return;
        }

        if (msg.method === "session/new") {
          const { agent, model, customPrompt, mcpServers } = msg.params || {};
          const result = await router.createSession(
            agent || null,
            { model, customPrompt, mcpServers },
            { cfgDir: cfg?._dir },
          );
          reply(id, { sessionId: result.sessionId, agentId: result.agentId, model: result.model });
          return;
        }

        if (msg.method === "session/prompt") {
          const { sessionId, prompt } = msg.params || {};
          if (!sessionId) {
            replyError(id, -32602, "sessionId required");
            return;
          }

          const cancelToken = { cancelled: false };
          sessionSubscribers.set(sessionId, cancelToken);

          const ctx = {
            requestPermission: (params) =>
              requestOutbound("session/request_permission", { sessionId, ...params }),
          };

          let stopReason;
          try {
            const iter = router.send(sessionId, prompt, ctx);
            while (true) {
              if (cancelToken.cancelled) {
                stopReason = STOP_REASONS.CANCELLED;
                break;
              }
              const r = await iter.next();
              if (r.done) {
                stopReason = r.value || STOP_REASONS.END_TURN;
                break;
              }
              notify("session/update", { sessionId, update: r.value });
            }
          } catch (e) {
            replyError(id, -32000, e.message);
            sessionSubscribers.delete(sessionId);
            return;
          }

          sessionSubscribers.delete(sessionId);
          reply(id, { stopReason });
          return;
        }

        if (msg.method === "session/cancel") {
          const { sessionId } = msg.params || {};
          const token = sessionSubscribers.get(sessionId);
          if (token) token.cancelled = true;
          await router.cancelSession(sessionId);
          reply(id, null);
          return;
        }

        if (msg.method === "session/close") {
          const { sessionId } = msg.params || {};
          await router.closeSession(sessionId);
          sessionSubscribers.delete(sessionId);
          reply(id, null);
          return;
        }

        if (id !== undefined)
          replyError(id, -32601, `Unknown method: ${msg.method}`);
      } catch (e) {
        log(`Dispatcher error: ${e.message}`);
        if (id !== undefined)
          replyError(id, -32000, e.message);
      }
    };

    return {
      handle,
      close() {
        for (const [id, p] of pendingOutbound) {
          p.reject(new Error("connection closed"));
          pendingOutbound.delete(id);
        }
        for (const [sid, token] of sessionSubscribers) {
          token.cancelled = true;
          sessionSubscribers.delete(sid);
        }
      },
    };
  };
};
