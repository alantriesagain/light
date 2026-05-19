import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createBridgeServer } from "../../server/index.js";
import { registerAdapter } from "../../adapters/index.js";
import sessionStore from "../../core/session.js";
import fakeAdapter, { agentMessageChunk, toolCall, toolCallUpdate, STOP_REASONS } from "../fixtures/fake-adapter.js";

let bridge;
let wsUrl;

before(async () => {
  registerAdapter(fakeAdapter({
    name: "acp-fake",
    updates: [
      agentMessageChunk("Hello "),
      agentMessageChunk("there"),
      toolCall({ toolCallId: "t1", title: "search", kind: "search", rawInput: { q: "x" }, status: "in_progress" }),
      toolCallUpdate({ toolCallId: "t1", status: "completed", content: [{ type: "content", content: { type: "text", text: "[]" } }] }),
    ],
    stopReason: STOP_REASONS.END_TURN,
  }));

  bridge = await createBridgeServer({
    port: 0,
    host: "127.0.0.1",
    config: { adapters: [], mcpServers: [] },
  });
  const { port } = await bridge.start();
  wsUrl = `ws://127.0.0.1:${port}/acp`;
});

after(async () => {
  await bridge.stop();
});

beforeEach(() => {
  for (const s of sessionStore.list()) sessionStore.delete(s.sessionId);
});

const connect = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(wsUrl);
  ws.once("open", () => resolve(ws));
  ws.once("error", reject);
});

const rpcClient = (ws) => {
  let nextId = 0;
  const pending = new Map();
  const notifications = [];
  const requestHandlers = new Map();
  let nextNotifWaiter = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.id !== undefined && msg.method === undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
      return;
    }

    if (msg.method && msg.id !== undefined) {
      const handler = requestHandlers.get(msg.method);
      if (handler)
        handler(msg).then((result) => ws.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })));
      return;
    }

    if (msg.method) {
      notifications.push(msg);
      if (nextNotifWaiter) {
        const w = nextNotifWaiter;
        nextNotifWaiter = null;
        w(msg);
      }
    }
  });

  return {
    notifications,
    request(method, params) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
      });
    },
    onRequest(method, handler) {
      requestHandlers.set(method, handler);
    },
    waitForNotification(method) {
      const existing = notifications.find((n) => n.method === method);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve) => {
        const orig = nextNotifWaiter;
        nextNotifWaiter = (msg) => {
          if (msg.method === method) resolve(msg);
          else if (orig) orig(msg);
        };
      });
    },
    close() { ws.close(); },
  };
};

test("ACP initialize returns protocol version and capabilities", async () => {
  const ws = await connect();
  const c = rpcClient(ws);
  const resp = await c.request("initialize", { protocolVersion: 1, clientCapabilities: {} });
  assert.equal(resp.result.protocolVersion, 1);
  assert.ok(resp.result.agentCapabilities);
  c.close();
});

test("ACP session/new returns sessionId", async () => {
  const ws = await connect();
  const c = rpcClient(ws);
  await c.request("initialize", {});
  const resp = await c.request("session/new", { agent: "acp-fake" });
  assert.ok(resp.result.sessionId.startsWith("acp-fake_"));
  assert.equal(resp.result.agentId, "acp-fake");
  c.close();
});

test("ACP session/prompt streams session/update notifications and resolves with stopReason", async () => {
  const ws = await connect();
  const c = rpcClient(ws);
  await c.request("initialize", {});
  const newResp = await c.request("session/new", { agent: "acp-fake" });
  const sessionId = newResp.result.sessionId;

  const updates = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method === "session/update") updates.push(msg.params.update);
  });

  const promptResp = await c.request("session/prompt", {
    sessionId,
    prompt: [{ type: "text", text: "go" }],
  });

  assert.equal(promptResp.result.stopReason, "end_turn");
  assert.ok(updates.length >= 4);

  const textUpdates = updates.filter((u) => u.sessionUpdate === "agent_message_chunk");
  assert.deepEqual(textUpdates.map((u) => u.content.text), ["Hello ", "there"]);

  const toolUpdates = updates.filter((u) => u.sessionUpdate === "tool_call");
  assert.equal(toolUpdates[0].toolCallId, "t1");
  assert.equal(toolUpdates[0].kind, "search");

  const toolEnds = updates.filter((u) => u.sessionUpdate === "tool_call_update");
  assert.equal(toolEnds[0].status, "completed");

  c.close();
});

test("ACP session/cancel returns null", async () => {
  const ws = await connect();
  const c = rpcClient(ws);
  await c.request("initialize", {});
  const newResp = await c.request("session/new", { agent: "acp-fake" });
  const resp = await c.request("session/cancel", { sessionId: newResp.result.sessionId });
  assert.equal(resp.result, null);
  c.close();
});

test("ACP unknown method returns JSON-RPC error", async () => {
  const ws = await connect();
  const c = rpcClient(ws);
  const resp = await c.request("nope/method", {});
  assert.ok(resp.error);
  assert.equal(resp.error.code, -32601);
  c.close();
});
