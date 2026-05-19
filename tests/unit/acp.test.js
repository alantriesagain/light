import { test } from "node:test";
import assert from "node:assert/strict";
import {
  textBlock, userMessageChunk, agentMessageChunk, agentThoughtChunk,
  toolCall, toolCallUpdate, toolCallContentBlock,
  defaultPermissionOptions, inferToolKind,
} from "../../core/acp.js";

test("textBlock", () => {
  assert.deepEqual(textBlock("hi"), { type: "text", text: "hi" });
});

test("agentMessageChunk wraps a text block", () => {
  assert.deepEqual(agentMessageChunk("hello"), {
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "hello" },
  });
});

test("userMessageChunk wraps a text block", () => {
  assert.equal(userMessageChunk("x").sessionUpdate, "user_message_chunk");
});

test("agentThoughtChunk wraps a text block", () => {
  assert.equal(agentThoughtChunk("ponder").sessionUpdate, "agent_thought_chunk");
});

test("toolCall has required fields with defaults", () => {
  const tc = toolCall({ toolCallId: "t1", title: "Read foo", rawInput: { path: "/foo" } });
  assert.equal(tc.sessionUpdate, "tool_call");
  assert.equal(tc.toolCallId, "t1");
  assert.equal(tc.title, "Read foo");
  assert.equal(tc.kind, "other");
  assert.equal(tc.status, "pending");
  assert.deepEqual(tc.rawInput, { path: "/foo" });
});

test("toolCallUpdate only emits provided fields", () => {
  const u = toolCallUpdate({ toolCallId: "t1", status: "completed" });
  assert.deepEqual(u, { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" });
});

test("toolCallContentBlock marks error correctly", () => {
  assert.equal(toolCallContentBlock("oops", { isError: true }).isError, true);
  assert.equal(toolCallContentBlock("ok").isError, undefined);
});

test("defaultPermissionOptions returns spec-shaped options", () => {
  const opts = defaultPermissionOptions();
  assert.ok(opts.find((o) => o.optionId === "allow_once" && o.kind === "allow_once"));
  assert.ok(opts.find((o) => o.kind === "reject_once"));
});

test("inferToolKind classifies common names", () => {
  assert.equal(inferToolKind("Read"), "read");
  assert.equal(inferToolKind("Write"), "edit");
  assert.equal(inferToolKind("Bash"), "execute");
  assert.equal(inferToolKind("WebFetch"), "fetch");
  assert.equal(inferToolKind("Search"), "search");
  assert.equal(inferToolKind("Todo"), "think");
  assert.equal(inferToolKind("CustomThing"), "other");
});
