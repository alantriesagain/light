import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import store from "../../core/session.js";

beforeEach(() => {
  for (const s of store.list()) store.delete(s.sessionId);
});

test("create + get", () => {
  store.create("s1", "fake", { id: "s1", model: "m" });
  const d = store.get("s1");
  assert.equal(d.sessionId, "s1");
  assert.equal(d.adapterId, "fake");
  assert.equal(d.session.id, "s1");
});

test("update merges fields", () => {
  store.create("s1", "fake", { id: "s1" });
  store.update("s1", { pendingMessage: "hi" });
  assert.equal(store.get("s1").pendingMessage, "hi");
});

test("delete removes", () => {
  store.create("s1", "fake", { id: "s1" });
  store.delete("s1");
  assert.equal(store.get("s1"), undefined);
});

test("list reports flags", () => {
  store.create("s1", "fake", { id: "s1" });
  store.update("s1", { sseRes: {}, pendingMessage: "x" });
  const [entry] = store.list();
  assert.equal(entry.hasSSE, true);
  assert.equal(entry.hasPending, true);
});

test("count tracks", () => {
  assert.equal(store.count(), 0);
  store.create("a", "fake", {});
  store.create("b", "fake", {});
  assert.equal(store.count(), 2);
});
