import http from "http";
import readline from "readline";
import { createDispatcher } from "./jsonrpc.js";
import { attachWebSockets } from "./ws.js";
import { loadAdapters } from "../adapters/index.js";
import { createMcpRegistry } from "../core/mcp-config.js";

export const startStdioServer = async ({ config }) => {
  const log = (msg) => process.stderr.write(`[stdio] ${msg}\n`);

  const mcp = createMcpRegistry();
  await mcp.discover(config.mcpServers || []);

  const internalServer = http.createServer((req, res) => {
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => internalServer.listen(0, "127.0.0.1", () => resolve(undefined)));
  const addr = internalServer.address();
  const internalPort = typeof addr === "object" && addr ? addr.port : 0;
  attachWebSockets(internalServer, { cfg: config, log });
  log(`internal WS bound on 127.0.0.1:${internalPort} (for adapter back-channels)`);

  await loadAdapters({
    enabled: config.adapters || [],
    options: {
      bridgeHost: "127.0.0.1",
      bridgePort: internalPort,
      defaultModel: config.defaultModel,
      mcpServersConfig: mcp.stdioConfig(),
      allTools: mcp.getTools(),
    },
    log,
  });

  const transport = {
    send: (/** @type {any} */ msg) =>
      /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
        process.stdout.write(JSON.stringify(msg) + "\n", (err) => (err ? reject(err) : resolve()));
      })),
  };

  const dispatcherFactory = createDispatcher({ cfg: config, log });
  const dispatcher = dispatcherFactory(transport);

  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    dispatcher.handle(msg);
  });

  process.stdin.on("end", () => {
    dispatcher.close();
    internalServer.close();
    process.exit(0);
  });

  log("ACP server ready on stdio");
};
