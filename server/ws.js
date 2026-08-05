import { WebSocketServer } from "ws";
import { getAdapter } from "../adapters/index.js";
import { createDispatcher } from "./jsonrpc.js";
import { allowedOriginList } from "./sse.js";

/**
 * @param {import("http").Server} httpServer
 * @param {{ cfg: any, log: (msg: string) => void, allowedOrigin?: string|null, mcpHost?: any, fsWatcher?: any, appHub?: any }} opts
 */
export const attachWebSockets = (httpServer, { cfg, log, allowedOrigin = null, mcpHost = null, fsWatcher = null, appHub = null }) => {
  const acpWss = new WebSocketServer({ noServer: true });
  const mcpWss = new WebSocketServer({ noServer: true });
  const fsWss = new WebSocketServer({ noServer: true });
  const appWss = new WebSocketServer({ noServer: true });
  const dispatcherFactory = createDispatcher({ cfg, log });

  const rejectAndDestroy = (socket, status, reason) => {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\n\r\n`);
    socket.destroy();
  };

  const originAllowed = (req) => {
    const list = allowedOriginList(allowedOrigin);
    if (!list.length) return true;
    const origin = req.headers.origin;
    if (!origin) return false;
    return list.includes(origin);
  };

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/acp") {
      if (!originAllowed(req)) {
        log(`ACP-WS upgrade rejected: origin ${req.headers.origin || "(none)"} not in allowlist`);
        return rejectAndDestroy(socket, 403, "Forbidden");
      }
      acpWss.handleUpgrade(req, socket, head, (ws) => {
        log("ACP-WS /acp [connected]");
        const transport = {
          send: (/** @type {any} */ msg) =>
            /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
              if (ws.readyState !== 1) return reject(new Error("ws closed"));
              ws.send(JSON.stringify(msg), (err) => (err ? reject(err) : resolve()));
            })),
        };
        const dispatcher = dispatcherFactory(transport);
        ws.on("message", (raw) => {
          let msg;
          try { msg = JSON.parse(raw.toString()); } catch { return; }
          dispatcher.handle(msg);
        });
        ws.on("close", () => {
          log("ACP-WS /acp [closed]");
          dispatcher.close();
        });
      });
      return;
    }

    if (url.pathname === "/mcp/notifications") {
      if (!originAllowed(req)) {
        log(`MCP-WS upgrade rejected: origin ${req.headers.origin || "(none)"} not in allowlist`);
        return rejectAndDestroy(socket, 403, "Forbidden");
      }
      if (!mcpHost) return rejectAndDestroy(socket, 503, "MCP host not initialized");

      mcpWss.handleUpgrade(req, socket, head, (ws) => {
        log("MCP-WS /mcp/notifications [connected]");
        const unsub = mcpHost.subscribe((event) => {
          if (ws.readyState !== 1) return;
          try { ws.send(JSON.stringify(event)); } catch {}
        });
        ws.on("close", () => {
          unsub();
          log("MCP-WS /mcp/notifications [closed]");
        });
      });
      return;
    }

    if (url.pathname === "/fs/events") {
      if (!originAllowed(req)) {
        log(`FS-WS upgrade rejected: origin ${req.headers.origin || "(none)"} not in allowlist`);
        return rejectAndDestroy(socket, 403, "Forbidden");
      }
      if (!fsWatcher) return rejectAndDestroy(socket, 503, "FS watcher not initialized");

      fsWss.handleUpgrade(req, socket, head, (ws) => {
        log("FS-WS  /fs/events [connected]");
        const unsub = fsWatcher.subscribe((change) => {
          if (ws.readyState !== 1) return;
          try { ws.send(JSON.stringify(change)); } catch {}
        });
        ws.on("close", () => {
          unsub();
          log("FS-WS  /fs/events [closed]");
        });
      });
      return;
    }

    if (url.pathname === "/app") {
      if (!originAllowed(req)) {
        log(`APP-WS upgrade rejected: origin ${req.headers.origin || "(none)"} not in allowlist`);
        return rejectAndDestroy(socket, 403, "Forbidden");
      }
      if (!appHub) return rejectAndDestroy(socket, 503, "App hub not initialized");

      appWss.handleUpgrade(req, socket, head, (ws) => {
        appHub.attach(ws);
        ws.on("message", (raw) => {
          let msg;
          try { msg = JSON.parse(raw.toString()); } catch { return; }
          appHub.handleMessage(msg);
        });
        ws.on("close", () => appHub.detach(ws));
      });
      return;
    }

    rejectAndDestroy(socket, 404, "Not Found");
  });

  return {
    close() {
      acpWss.close();
      mcpWss.close();
      fsWss.close();
      appWss.close();
    },
  };
};
