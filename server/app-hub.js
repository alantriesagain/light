/**
 * App control hub: tracks the single connected browser app (over the /app
 * WebSocket) and relays named commands to it, awaiting the reply. Uses the
 * `@bootstrapp/rpc` envelope contract the app already speaks:
 *   out (server → app):  { type, payload, eventId }
 *   in  (app → server):  { eventId, payload } | { eventId, error }
 */

/** @param {{ log?: (msg: string) => void }} [opts] */
export const createAppHub = ({ log = () => {} } = {}) => {
  /** @type {any} */
  let current = null;
  const pending = new Map();
  let seq = 0;

  const rejectAll = (reason) => {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    pending.clear();
  };

  return {
    attach(ws) {
      if (current && current !== ws) try { current.close(); } catch {}
      current = ws;
      log("APP-WS /app [connected]");
    },
    detach(ws) {
      if (current !== ws) return;
      current = null;
      rejectAll("app disconnected");
      log("APP-WS /app [closed]");
    },
    connected: () => !!current && current.readyState === 1,
    handleMessage(msg) {
      if (!msg || msg.eventId == null || !pending.has(msg.eventId)) return;
      const p = pending.get(msg.eventId);
      pending.delete(msg.eventId);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(String(msg.error)));
      else p.resolve(msg.payload);
    },
    /**
     * @param {string} name @param {any} args @param {number} [timeout]
     * @returns {Promise<any>}
     */
    command(name, args, timeout = 300000) {
      if (!current || current.readyState !== 1) return Promise.reject(new Error("no app connected"));
      const eventId = `app-${++seq}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(eventId);
          reject(new Error(`app command "${name}" timed out`));
        }, timeout);
        pending.set(eventId, { resolve, reject, timer });
        try {
          current.send(JSON.stringify({ type: name, payload: args, eventId }));
        } catch (e) {
          pending.delete(eventId);
          clearTimeout(timer);
          reject(e);
        }
      });
    },
  };
};
