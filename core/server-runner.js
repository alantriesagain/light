#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "path";
import { pathToFileURL } from "url";

const serverPath = process.argv[2];
if (!serverPath) {
  process.stderr.write("Usage: server-runner.js <path-to-mcp-server.js>\n");
  process.exit(1);
}

const serverUrl = pathToFileURL(path.resolve(serverPath)).href;
const serverModule = await import(serverUrl);
const server = serverModule.default;

if (!server || !server.connect) {
  process.stderr.write("Server must export an McpServer instance as default\n");
  process.exit(1);
}

const transport = new StdioServerTransport();
await server.connect(transport);
