import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { createBridgeServer } from "../../server/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.resolve(__dirname, "..", "fixtures", "fake-mcp-server.js");

let bridge;
let base;
let port;

before(async () => {
  bridge = await createBridgeServer({
    port: 0,
    host: "127.0.0.1",
    config: { adapters: [], mcpServers: [] },
  });
  const r = await bridge.start();
  port = r.port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await bridge.stop();
});

test("GET /mcp/servers starts with only the built-in app server", async () => {
  const r = await fetch(`${base}/mcp/servers`);
  const body = await r.json();
  assert.deepEqual(body.servers.map((s) => s.name), ["app"]);
});

test("POST /mcp/servers connects a server", async () => {
  const r = await fetch(`${base}/mcp/servers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "fake", command: process.execPath, args: [FAKE] }),
  });
  assert.equal(r.status, 201);
  const body = await r.json();
  assert.equal(body.name, "fake");
  assert.equal(body.status, "connected");
});

test("GET /mcp/servers shows the connected server", async () => {
  const r = await fetch(`${base}/mcp/servers`);
  const body = await r.json();
  assert.ok(body.servers.some((s) => s.name === "fake"));
});

test("GET /mcp/servers/:name/status returns status", async () => {
  const r = await fetch(`${base}/mcp/servers/fake/status`);
  const body = await r.json();
  assert.equal(body.status, "connected");
});

test("GET /mcp/tools lists tools with fullName + schema", async () => {
  const r = await fetch(`${base}/mcp/tools`);
  const body = await r.json();
  const echo = body.tools.find((t) => t.name === "echo");
  assert.ok(echo);
  assert.equal(echo.fullName, "mcp__fake__echo");
  assert.ok(echo.inputSchema);
});

test("POST /mcp/tools/:fullName/invoke runs a tool", async () => {
  const r = await fetch(`${base}/mcp/tools/${encodeURIComponent("mcp__fake__echo")}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ arguments: { message: "ping" } }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.content[0].text, "ping");
});

test("GET /mcp/resources lists resources", async () => {
  const r = await fetch(`${base}/mcp/resources`);
  const body = await r.json();
  assert.equal(body.resources.length, 1);
  assert.equal(body.resources[0].uri, "fake://greeting");
});

test("GET /mcp/resources/read returns content", async () => {
  const r = await fetch(`${base}/mcp/resources/read?uri=${encodeURIComponent("fake://greeting")}`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.contents[0].text, "hello world");
});

test("GET /mcp/prompts lists prompts", async () => {
  const r = await fetch(`${base}/mcp/prompts`);
  const body = await r.json();
  assert.ok(body.prompts.some((p) => p.name === "summarize"));
});

test("POST /mcp/prompts/:fullName/render returns messages", async () => {
  const r = await fetch(`${base}/mcp/prompts/${encodeURIComponent("mcp__fake__summarize")}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ arguments: { topic: "dogs" } }),
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.match(body.messages[0].content.text, /dogs/);
});

test("WS /mcp/notifications delivers events on connect/disconnect", async () => {
  const ws = await new Promise((resolve, reject) => {
    const w = new WebSocket(`ws://127.0.0.1:${port}/mcp/notifications`);
    w.once("open", () => resolve(w));
    w.once("error", reject);
  });

  const events = [];
  ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));

  await fetch(`${base}/mcp/servers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "fake2", command: process.execPath, args: [FAKE] }),
  });

  await new Promise((r) => setTimeout(r, 250));

  await fetch(`${base}/mcp/servers/fake2`, { method: "DELETE" });
  await new Promise((r) => setTimeout(r, 100));

  ws.close();

  assert.ok(events.some((e) => e.type === "server:connected" && e.name === "fake2"));
  assert.ok(events.some((e) => e.type === "server:disconnected" && e.name === "fake2"));
});

test("DELETE /mcp/servers/:name removes server", async () => {
  await fetch(`${base}/mcp/servers/fake`, { method: "DELETE" });
  const r = await fetch(`${base}/mcp/servers`);
  const body = await r.json();
  assert.ok(!body.servers.some((s) => s.name === "fake"));
});
