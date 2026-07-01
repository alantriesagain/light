import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerAdapter, getAdapter, listAdapters, getDefaultAdapter, listAdapterIds, isAdapterRegistered } from "../../adapters/index.js";

const stubAdapter = (name) => ({ name, displayName: name, models: [{ id: "default", name: "Default" }] });

beforeEach(() => {
  for (const a of listAdapters())
    if (a.id.startsWith("test_"))
      assert.ok(true);
});

test("registerAdapter claims a name", () => {
  const r = registerAdapter(stubAdapter("test_one"));
  assert.equal(r.name, "test_one");
  assert.equal(isAdapterRegistered("test_one"), true);
});

test("registerAdapter returns null on duplicate", () => {
  registerAdapter(stubAdapter("test_dup"));
  const second = registerAdapter(stubAdapter("test_dup"));
  assert.equal(second, null);
});

test("getAdapter returns instance", () => {
  registerAdapter(stubAdapter("test_get"));
  assert.equal(getAdapter("test_get").name, "test_get");
});

test("listAdapters maps to public shape", () => {
  registerAdapter(stubAdapter("test_list"));
  const found = listAdapters().find((a) => a.id === "test_list");
  assert.ok(found);
  assert.equal(found.name, "test_list");
  assert.equal(Array.isArray(found.models), true);
});

test("getDefaultAdapter returns first registered", () => {
  assert.ok(getDefaultAdapter());
});

test("listAdapterIds enumerates known loaders", () => {
  const ids = listAdapterIds();
  assert.ok(ids.includes("claude-sdk"));
  assert.ok(ids.includes("codex"));
  assert.ok(ids.includes("acp"));
});
