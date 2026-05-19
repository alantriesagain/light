import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createBridgeServer } from "../../server/index.js";
import { registerAdapter } from "../../adapters/index.js";
import fakeAdapter from "../fixtures/fake-adapter.js";

let bridge;
let base;
let wsUrl;
const ALLOWED = "https://app.bootstrapp.ai";

before(async () => {
  registerAdapter(fakeAdapter({ name: "origin-fake" }));
  bridge = await createBridgeServer({
    port: 0,
    host: "127.0.0.1",
    config: { adapters: [], mcpServers: [] },
    allowedOrigin: ALLOWED,
  });
  const { port } = await bridge.start();
  base = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}/acp`;
});

after(async () => {
  await bridge.stop();
});

test("HTTP request from allowed origin gets ACAO header", async () => {
  const r = await fetch(`${base}/health`, { headers: { origin: ALLOWED } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), ALLOWED);
  assert.equal(r.headers.get("vary"), "Origin");
});

test("HTTP request from disallowed origin is 403", async () => {
  const r = await fetch(`${base}/health`, { headers: { origin: "https://evil.example.com" } });
  assert.equal(r.status, 403);
});

test("HTTP request with no origin header passes (CLI/scripts)", async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
});

test("OPTIONS preflight from allowed origin returns ACAO", async () => {
  const r = await fetch(`${base}/health`, {
    method: "OPTIONS",
    headers: { origin: ALLOWED },
  });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), ALLOWED);
});

test("WS upgrade from allowed origin succeeds", async () => {
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { origin: ALLOWED } });
    ws.once("open", () => { ws.close(); resolve(); });
    ws.once("error", reject);
  });
});

test("WS upgrade from disallowed origin is rejected", async () => {
  await assert.rejects(
    new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { headers: { origin: "https://evil.example.com" } });
      ws.once("open", () => { ws.close(); resolve(); });
      ws.once("error", reject);
    }),
  );
});
