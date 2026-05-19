import {
  agentMessageChunk,
  toolCall,
  toolCallUpdate,
  toolCallContentBlock,
  inferToolKind,
} from "../acp.js";

/**
 * @typedef {{
 *   type: "system",
 *   subtype?: string,
 *   session_id?: string
 * } | {
 *   type: "stream_event",
 *   event?: { type?: string, delta?: { type?: string, text?: string } }
 * } | {
 *   type: "assistant",
 *   message?: { content?: Array<{ type: string, [k: string]: any }> }
 * } | {
 *   type: "user",
 *   message?: { content?: Array<{ type: string, [k: string]: any }> }
 * } | {
 *   type: "result",
 *   session_id?: string
 * } | {
 *   type: "error",
 *   message?: string,
 *   error?: string
 * } | {
 *   type: "control_request",
 *   request_id: string,
 *   request: { subtype: string, tool_name?: string, name?: string, input?: any }
 * }} ClaudeStreamJsonMessage
 *
 * @typedef {{ claudeSessionId?: string | null, sdkSessionId?: string | null }} ClaudeSessionRef
 */

/** @param {string | any[] | any} content @returns {string} */
const toolResultText = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content.map((b) => b.text || JSON.stringify(b)).join("\n");
  return JSON.stringify(content);
};

/**
 * @param {ClaudeStreamJsonMessage} msg
 * @param {ClaudeSessionRef} session
 * @returns {SessionUpdate[]}
 */
export const translateStreamJson = (msg, session) => {
  if (msg.type === "system" && msg.subtype === "init") {
    if (msg.session_id) session.claudeSessionId = msg.session_id;
    return [];
  }

  if (msg.type === "stream_event") {
    const ev = msg.event;
    if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta")
      return [agentMessageChunk(ev.delta.text || "")];
    return [];
  }

  if (msg.type === "assistant" && msg.message?.content) {
    const out = [];
    for (const block of msg.message.content)
      if (block.type === "tool_use")
        out.push(toolCall({
          toolCallId: block.id,
          title: block.name,
          kind: inferToolKind(block.name),
          rawInput: block.input,
          status: "in_progress",
        }));
    return out;
  }

  if (msg.type === "user" && msg.message?.content) {
    const blocks = Array.isArray(msg.message.content) ? msg.message.content : [];
    const out = [];
    for (const block of blocks)
      if (block.type === "tool_result")
        out.push(toolCallUpdate({
          toolCallId: block.tool_use_id,
          status: block.is_error ? "failed" : "completed",
          content: [toolCallContentBlock(toolResultText(block.content), { isError: !!block.is_error })],
        }));
    return out;
  }

  return [];
};

/**
 * @param {{ type: string, session_id?: string, message?: { content?: any[] } }} msg
 * @param {ClaudeSessionRef} [session]
 * @returns {SessionUpdate[]}
 */
export const translateSdkMessage = (msg, session) => {
  /** @type {SessionUpdate[]} */
  const out = [];
  switch (msg.type) {
    case "system":
      if (session) session.sdkSessionId = msg.session_id;
      break;
    case "assistant":
      if (msg.message?.content)
        for (const block of msg.message.content)
          if (block.type === "text" && block.text)
            out.push(agentMessageChunk(block.text));
          else if (block.type === "tool_use")
            out.push(toolCall({
              toolCallId: block.id,
              title: block.name,
              kind: inferToolKind(block.name),
              rawInput: block.input,
              status: "in_progress",
            }));

      break;
    case "user":
      if (msg.message?.content)
        for (const block of msg.message.content)
          if (block.type === "tool_result")
            out.push(toolCallUpdate({
              toolCallId: block.tool_use_id,
              status: block.is_error ? "failed" : "completed",
              content: [toolCallContentBlock(toolResultText(block.content), { isError: !!block.is_error })],
            }));
      break;
    case "result":
      if (session) session.sdkSessionId = msg.session_id;
      break;
  }
  return out;
};
