import http from "http";
import { handleManagement } from "./routes/management.js";
import { handleOpenAi } from "./routes/openai.js";
import { handleMcp } from "./routes/mcp.js";
import { attachWebSockets } from "./ws.js";
import { buildCorsHeaders, sendJson } from "./sse.js";
import { loadAdapters, listAdapters } from "../adapters/index.js";
import { createMcpRegistry } from "../core/mcp-config.js";
import { createMcpHost } from "../core/mcp-host.js";

const ROUTES = [
  ["WS    /acp", "ACP over WebSocket (primary)"],
  ["WS    /mcp/notifications", "MCP notifications stream"],
  ["GET   /health", "Health"],
  ["GET   /agents", "List agents"],
  ["GET   /models/:agent", "List models"],
  ["GET   /sessions", "List live sessions"],
  ["DELETE /session/:id", "Close session"],
  ["GET   /mcp/servers", "MCP servers (CRUD)"],
  ["GET   /mcp/tools", "MCP tools + invoke"],
  ["GET   /mcp/resources", "MCP resources + read"],
  ["GET   /mcp/prompts", "MCP prompts + render"],
  ["POST  /v1/chat/completions", "OpenAI chat"],
  ["GET   /v1/models", "OpenAI models"],
];

/**
 * @param {{ port: number, host: string, config: any, allowedOrigin?: string | null }} opts
 */
export const createBridgeServer = async ({ port, host, config, allowedOrigin = null }) => {
  const log = (msg) => process.stdout.write(`[Bridge] ${msg}\n`);
  const error = (msg) => process.stderr.write(`[Bridge] ${msg}\n`);

  const mcp = createMcpRegistry();
  await mcp.discover(config.mcpServers || []);

  const mcpHost = createMcpHost({ log: (m) => log(`[mcp] ${m}`) });
  for (const [name, server] of mcp.getServers())
    try {
      await mcpHost.connect(name, server);
    } catch (e) {
      error(`MCP connect '${name}' failed: ${e.message}`);
    }

  await loadAdapters({
    enabled: config.adapters || [],
    options: {
      bridgeHost: host,
      bridgePort: port,
      defaultModel: config.defaultModel,
      mcpServersConfig: mcp.stdioConfig(),
      allTools: mcpHost.listAllTools(),
    },
    log,
  });

  const httpServer = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    const method = req.method || "GET";
    const reqOrigin = req.headers.origin || null;
    const cors = buildCorsHeaders(reqOrigin, allowedOrigin);

    const originalEnd = res.end.bind(res);
    /** @type {any} */ (res).end = (/** @type {any[]} */ ...args) => {
      originalEnd(...args);
      const p = pathname.length > 30 ? pathname.slice(0, 27) + "..." : pathname.padEnd(30);
      log(`${method.padEnd(7)} ${p} ${res.statusCode} (${Date.now() - startedAt}ms)`);
    };

    if (allowedOrigin && reqOrigin && reqOrigin !== allowedOrigin) {
      sendJson(res, 403, { error: "Origin not allowed" }, cors);
      return;
    }

    if (method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    try {
      const ctx = { req, res, url, method, pathname, mcp, mcpHost, cfg: config, log, defaultModel: config.defaultModel, cors };

      if (pathname.startsWith("/v1/")) {
        const handled = await handleOpenAi(ctx);
        if (handled !== false) return;
      }

      if (pathname.startsWith("/mcp/")) {
        const handled = await handleMcp(ctx);
        if (handled !== false) return;
      }

      const handled = await handleManagement(ctx);
      if (handled !== false) return;

      sendJson(res, 404, { error: "Not found" }, cors);
    } catch (e) {
      error(`Error: ${e.message}`);
      sendJson(res, 500, { error: e.message }, cors);
    }
  });

  const ws = attachWebSockets(httpServer, { cfg: config, log, allowedOrigin, mcpHost });

  return {
    server: httpServer,
    mcpHost,
    start: () =>
      /** @type {Promise<{port: number, host: string}>} */ (new Promise((resolve) => {
        httpServer.listen(port, host, () => {
          const addr = httpServer.address();
          const actualPort = typeof addr === "object" && addr ? addr.port : port;
          log(`Server running on http://${host}:${actualPort}`);
          if (allowedOrigin) log(`Origin lock: ${allowedOrigin}`);
          log("Routes:");
          for (const [r, d] of ROUTES) log(`  ${r.padEnd(28)} ${d}`);
          const agents = listAdapters();
          log(`Agents: ${agents.map((a) => a.id).join(", ") || "none"}`);
          log(`MCP tools: ${mcpHost.listAllTools().map((t) => t.name).join(", ") || "none"}`);
          resolve({ port: actualPort, host });
        });
      })),
    stop: () =>
      /** @type {Promise<void>} */ (new Promise(async (resolve) => {
        for (const s of mcpHost.list())
          await mcpHost.disconnect(s.name).catch(() => {});
        ws.close();
        httpServer.close(() => resolve());
      })),
  };
};

export default createBridgeServer;
