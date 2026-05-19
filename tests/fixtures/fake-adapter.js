import { agentMessageChunk, toolCall, toolCallUpdate, STOP_REASONS } from "../../core/acp.js";

export default (opts = {}) => {
  const { name = "fake", updates = null, stopReason = STOP_REASONS.END_TURN } = opts;
  return {
    name,
    displayName: name,
    models: [{ id: "default", name: "Default" }, { id: "fast", name: "Fast" }],

    async createSession(options = {}) {
      return {
        id: `${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        model: options.model || "default",
        customPrompt: options.customPrompt,
        mcpConfig: options.mcpConfig,
        sent: [],
        cancelled: false,
        closed: false,
      };
    },

    async *send(session, prompt) {
      session.sent.push(prompt);
      const stream = updates || [
        agentMessageChunk("hello "),
        agentMessageChunk("world"),
      ];
      for (const u of stream) yield u;
      return stopReason;
    },

    async cancel(session) { session.cancelled = true; },
    async close(session) { session.closed = true; },
  };
};

export { agentMessageChunk, toolCall, toolCallUpdate, STOP_REASONS };
