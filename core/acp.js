export const PROTOCOL_VERSION = 1;

export const AGENT_CAPABILITIES = {
  loadSession: false,
  promptCapabilities: { image: false, audio: false, embeddedContext: false },
};

/** @param {string} text @returns {TextBlock} */
export const textBlock = (text) => ({ type: "text", text });

/** @param {string} text @returns {SessionUpdate} */
export const userMessageChunk = (text) => ({
  sessionUpdate: "user_message_chunk",
  content: textBlock(text),
});

/** @param {string} text @returns {SessionUpdate} */
export const agentMessageChunk = (text) => ({
  sessionUpdate: "agent_message_chunk",
  content: textBlock(text),
});

/** @param {string} text @returns {SessionUpdate} */
export const agentThoughtChunk = (text) => ({
  sessionUpdate: "agent_thought_chunk",
  content: textBlock(text),
});

/**
 * @param {{ toolCallId: string, title: string, kind?: string, status?: string, rawInput?: any, content?: any[] }} opts
 * @returns {SessionUpdate}
 */
export const toolCall = ({ toolCallId, title, kind = "other", status = "pending", rawInput, content = [] }) => ({
  sessionUpdate: "tool_call",
  toolCallId,
  title,
  kind,
  status,
  rawInput,
  content,
});

/**
 * @param {{ toolCallId: string, status?: string, content?: any[], rawOutput?: any }} opts
 * @returns {SessionUpdate}
 */
export const toolCallUpdate = ({ toolCallId, status, content, rawOutput }) => {
  /** @type {SessionUpdate} */
  const out = { sessionUpdate: "tool_call_update", toolCallId };
  if (status !== undefined) out.status = status;
  if (content !== undefined) out.content = content;
  if (rawOutput !== undefined) out.rawOutput = rawOutput;
  return out;
};

export const toolCallContentBlock = (text, { isError = false } = {}) =>
  ({ type: "content", content: textBlock(text), ...(isError ? { isError: true } : {}) });

/** @type {{ END_TURN: "end_turn", MAX_TOKENS: "max_tokens", REFUSAL: "refusal", CANCELLED: "cancelled" }} */
export const STOP_REASONS = {
  END_TURN: "end_turn",
  MAX_TOKENS: "max_tokens",
  REFUSAL: "refusal",
  CANCELLED: "cancelled",
};

export const PERMISSION_OPTION_KINDS = {
  ALLOW_ONCE: "allow_once",
  ALLOW_ALWAYS: "allow_always",
  REJECT_ONCE: "reject_once",
  REJECT_ALWAYS: "reject_always",
};

export const defaultPermissionOptions = () => [
  { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
  { optionId: "allow_always", name: "Allow always", kind: "allow_always" },
  { optionId: "reject_once", name: "Reject once", kind: "reject_once" },
];

export const TOOL_KINDS = ["read", "edit", "delete", "move", "search", "execute", "think", "fetch", "other"];

export const buildFullToolName = (server, name) => `mcp__${server}__${name}`;

export const parseFullToolName = (full) => {
  const m = full?.match?.(/^mcp__([^_].*?)__(.+)$/);
  if (!m) return null;
  return { server: m[1], name: m[2] };
};

export const inferToolKind = (name) => {
  if (!name) return "other";
  const n = name.toLowerCase();
  if (/^(read|cat|view|ls|glob|grep|find)/.test(n)) return "read";
  if (/^(write|edit|update|patch|create)/.test(n)) return "edit";
  if (/^(delete|remove|rm)/.test(n)) return "delete";
  if (/^(move|rename|mv)/.test(n)) return "move";
  if (/^(search|query)/.test(n)) return "search";
  if (/^(bash|exec|run|spawn|shell)/.test(n)) return "execute";
  if (/^(fetch|http|web|curl)/.test(n)) return "fetch";
  if (/^(think|todo|plan)/.test(n)) return "think";
  return "other";
};
