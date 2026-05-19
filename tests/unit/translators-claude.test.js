import { test } from "node:test";
import assert from "node:assert/strict";
import { translateStreamJson, translateSdkMessage } from "../../core/translators/claude.js";

test("streamJson: system init updates session id and yields nothing", () => {
  const s = {};
  const out = translateStreamJson({ type: "system", subtype: "init", session_id: "s1" }, s);
  assert.deepEqual(out, []);
  assert.equal(s.claudeSessionId, "s1");
});

test("streamJson: text_delta yields agent_message_chunk", () => {
  const out = translateStreamJson({
    type: "stream_event",
    event: { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } },
  }, {});
  assert.equal(out[0].sessionUpdate, "agent_message_chunk");
  assert.equal(out[0].content.text, "hi");
});

test("streamJson: assistant tool_use yields tool_call", () => {
  const out = translateStreamJson({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { path: "/a" } }] },
  }, {});
  assert.equal(out[0].sessionUpdate, "tool_call");
  assert.equal(out[0].toolCallId, "t1");
  assert.equal(out[0].title, "Read");
  assert.equal(out[0].kind, "read");
  assert.deepEqual(out[0].rawInput, { path: "/a" });
});

test("streamJson: user tool_result yields tool_call_update", () => {
  const out = translateStreamJson({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok", is_error: false }] },
  }, {});
  assert.equal(out[0].sessionUpdate, "tool_call_update");
  assert.equal(out[0].toolCallId, "t1");
  assert.equal(out[0].status, "completed");
});

test("streamJson: tool_result error status", () => {
  const out = translateStreamJson({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "bad", is_error: true }] },
  }, {});
  assert.equal(out[0].status, "failed");
  assert.equal(out[0].content[0].isError, true);
});

test("streamJson: array tool_result content joined", () => {
  const out = translateStreamJson({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ text: "a" }, { text: "b" }] }] },
  }, {});
  assert.equal(out[0].content[0].content.text, "a\nb");
});

test("sdkMessage: text block yields agent_message_chunk", () => {
  const out = translateSdkMessage({
    type: "assistant",
    message: { content: [{ type: "text", text: "hello" }] },
  });
  assert.equal(out[0].sessionUpdate, "agent_message_chunk");
  assert.equal(out[0].content.text, "hello");
});

test("sdkMessage: tool_use yields tool_call", () => {
  const out = translateSdkMessage({
    type: "assistant",
    message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { cmd: "ls" } }] },
  });
  assert.equal(out[0].sessionUpdate, "tool_call");
  assert.equal(out[0].kind, "execute");
});

test("sdkMessage: system updates sdkSessionId", () => {
  const s = {};
  translateSdkMessage({ type: "system", session_id: "abc" }, s);
  assert.equal(s.sdkSessionId, "abc");
});

test("sdkMessage: result updates sdkSessionId", () => {
  const s = {};
  translateSdkMessage({ type: "result", session_id: "xyz" }, s);
  assert.equal(s.sdkSessionId, "xyz");
});

test("sdkMessage: unknown type yields empty", () => {
  assert.deepEqual(translateSdkMessage({ type: "unknown" }), []);
});
