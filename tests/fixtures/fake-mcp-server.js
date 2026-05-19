#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer(
  { name: "fake", version: "0.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } },
);

server.registerTool(
  "echo",
  {
    description: "Echo the input back",
    inputSchema: { message: z.string() },
  },
  async ({ message }) => ({ content: [{ type: "text", text: message }] }),
);

server.registerTool(
  "add",
  {
    description: "Add two numbers",
    inputSchema: { a: z.number(), b: z.number() },
  },
  async ({ a, b }) => ({ content: [{ type: "text", text: String(a + b) }] }),
);

server.registerResource(
  "greeting",
  "fake://greeting",
  { description: "A static greeting", mimeType: "text/plain" },
  async () => ({ contents: [{ uri: "fake://greeting", mimeType: "text/plain", text: "hello world" }] }),
);

server.registerPrompt(
  "summarize",
  {
    description: "Ask the model to summarize a topic",
    argsSchema: { topic: z.string() },
  },
  ({ topic }) => ({
    messages: [
      { role: "user", content: { type: "text", text: `Summarize: ${topic}` } },
    ],
  }),
);

await server.connect(new StdioServerTransport());
