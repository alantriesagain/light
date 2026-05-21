import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createBridgeServer } from "../../server/index.js";
import { registerAdapter } from "../../adapters/index.js";
import sessionStore from "../../core/session.js";
import fakeAdapter from "../fixtures/fake-adapter.js";

let bridge;
let base;

before(async () => {
  registerAdapter(fakeAdapter({ name: "fake" }));
  bridge = await createBridgeServer({
    port: 0,
    host: "127.0.0.1",
    config: { adapters: [], mcpServers: [], _dir: undefined },
  });
  const { port } = await bridge.start();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await bridge.stop();
});

beforeEach(() => {
  for (const s of sessionStore.list()) sessionStore.delete(s.sessionId);
});

test("GET /health returns ok with versioned api string", async () => {
  const r = await fetch(`${base}/health`);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.api, "gaiteway/1");
  assert.ok(body.agents.includes("fake"));
});

test("GET /agents lists registered adapters", async () => {
  const r = await fetch(`${base}/agents`);
  const body = await r.json();
  const fake = body.agents.find((a) => a.id === "fake");
  assert.ok(fake);
  assert.equal(fake.models.length, 2);
});

test("GET /models/:agent returns adapter models", async () => {
  const r = await fetch(`${base}/models/fake`);
  const body = await r.json();
  assert.equal(body.models.length, 2);
});

test("GET /v1/models flattens models", async () => {
  const r = await fetch(`${base}/v1/models`);
  const body = await r.json();
  const ids = body.data.map((m) => m.id);
  assert.ok(ids.includes("fake/default"));
  assert.ok(ids.includes("fake/fast"));
});

test("GET /sessions returns empty list initially", async () => {
  const r = await fetch(`${base}/sessions`);
  const body = await r.json();
  assert.deepEqual(body.sessions, []);
});

test("GET /mcp/servers, /mcp/tools, /mcp/resources return empty arrays", async () => {
  for (const path of ["/mcp/servers", "/mcp/tools", "/mcp/resources"]) {
    const r = await fetch(`${base}${path}`);
    const body = await r.json();
    const key = Object.keys(body)[0];
    assert.deepEqual(body[key], []);
  }
});

test("GET unknown route 404s", async () => {
  const r = await fetch(`${base}/nope`);
  assert.equal(r.status, 404);
});

test("OPTIONS gets CORS headers", async () => {
  const r = await fetch(`${base}/health`, { method: "OPTIONS" });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal(r.headers.get("access-control-allow-private-network"), "true");
});

test("POST /v1/chat/completions non-streaming returns assembled content", async () => {
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "fake/default",
      stream: false,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.choices[0].message.content, "hello world");
  assert.equal(body.choices[0].finish_reason, "stop");
});

test("POST /v1/chat/completions streaming emits delta chunks", async () => {
  const r = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "fake/default",
      stream: true,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  const text = await r.text();
  const lines = text.split("\n").filter((l) => l.startsWith("data: "));
  const chunks = lines
    .map((l) => l.slice(6))
    .filter((s) => s !== "[DONE]")
    .map((s) => JSON.parse(s));

  const contents = chunks
    .map((c) => c.choices[0].delta.content)
    .filter((c) => c !== undefined && c !== "");

  assert.deepEqual(contents, ["hello ", "world"]);
  const last = chunks[chunks.length - 1];
  assert.equal(last.choices[0].finish_reason, "stop");
});
