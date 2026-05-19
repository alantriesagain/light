import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMcpHost } from "../../core/mcp-host.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.resolve(__dirname, "..", "fixtures", "fake-mcp-server.js");

let host;

before(async () => {
  host = createMcpHost();
  await host.connect("fake", { command: process.execPath, args: [FAKE] });
});

after(async () => {
  await host.disconnect("fake");
});

test("connected server appears in list with status", () => {
  const list = host.list();
  const fake = list.find((s) => s.name === "fake");
  assert.ok(fake);
  assert.equal(fake.status, "connected");
  assert.equal(fake.lastError, null);
});

test("listAllTools surfaces tools with fullName + schema", () => {
  const tools = host.listAllTools();
  const echo = tools.find((t) => t.name === "echo");
  assert.ok(echo);
  assert.equal(echo.fullName, "mcp__fake__echo");
  assert.equal(echo.server, "fake");
  assert.ok(echo.inputSchema);
});

test("listAllResources surfaces resources", () => {
  const res = host.listAllResources();
  const greeting = res.find((r) => r.uri === "fake://greeting");
  assert.ok(greeting);
  assert.equal(greeting.server, "fake");
});

test("listAllPrompts surfaces prompts", () => {
  const prompts = host.listAllPrompts();
  const summarize = prompts.find((p) => p.name === "summarize");
  assert.ok(summarize);
  assert.equal(summarize.fullName, "mcp__fake__summarize");
});

test("invokeTool returns content blocks", async () => {
  const r = await host.invokeTool("mcp__fake__echo", { message: "hi" });
  assert.equal(r.content[0].text, "hi");
});

test("invokeTool with multiple args", async () => {
  const r = await host.invokeTool("mcp__fake__add", { a: 2, b: 3 });
  assert.equal(r.content[0].text, "5");
});

test("invokeTool on unknown server throws", async () => {
  await assert.rejects(() => host.invokeTool("mcp__missing__x", {}));
});

test("readResource returns content", async () => {
  const r = await host.readResource("fake://greeting");
  assert.equal(r.contents[0].text, "hello world");
});

test("readResource unknown URI throws", async () => {
  await assert.rejects(() => host.readResource("fake://nope"));
});

test("renderPrompt returns messages", async () => {
  const r = await host.renderPrompt("mcp__fake__summarize", { topic: "cats" });
  assert.ok(Array.isArray(r.messages));
  assert.match(r.messages[0].content.text, /cats/);
});

test("subscriber receives connection events", async () => {
  const events = [];
  const unsub = host.subscribe((e) => events.push(e));
  await host.connect("fake2", { command: process.execPath, args: [FAKE] });
  await host.disconnect("fake2");
  unsub();
  const connected = events.find((e) => e.type === "server:connected" && e.name === "fake2");
  const disconnected = events.find((e) => e.type === "server:disconnected" && e.name === "fake2");
  assert.ok(connected);
  assert.ok(disconnected);
});
