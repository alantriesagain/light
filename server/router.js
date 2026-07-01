import sessionStore from "../core/session.js";
import * as transcripts from "../core/transcripts.js";
import { getAdapter, getDefaultAdapter, listAdapters } from "../adapters/index.js";
import { STOP_REASONS } from "../core/acp.js";

/**
 * @param {string|null} agentId
 * @param {any} [options]
 * @param {{ cfgDir?: string }} [opts]
 */
/** @param {object} _agentId @param {object} _options @param {{cfgDir?: unknown}} [args] */
export const createSession = async (agentId, options = {}, { cfgDir } = {}) => {
  const adapter = agentId ? getAdapter(agentId) : getDefaultAdapter();
  if (!adapter)
    throw new Error(`Unknown agent: ${agentId || "default"}`);

  const session = await adapter.createSession(options);
  const sessionId = session.id;

  sessionStore.create(sessionId, adapter.name, session);

  if (cfgDir)
    transcripts.open(cfgDir, sessionId, {
      adapter: adapter.name,
      model: options.model || session.model,
      customPrompt: options.customPrompt,
      workspaceContext: options.workspaceContext,
    });

  return {
    sessionId,
    agentId: adapter.name,
    agentName: adapter.displayName || adapter.name,
    model: options.model || session.model,
  };
};

export const getSessionData = (sessionId) => {
  const data = sessionStore.get(sessionId);
  if (!data) return null;
  const adapter = getAdapter(data.adapterId);
  return { ...data, adapter };
};

export async function* send(sessionId, prompt, context = {}) {
  const data = getSessionData(sessionId);
  if (!data) throw new Error("Session not found");

  transcripts.append(sessionId, { direction: "in", method: "session/prompt", prompt });

  const { adapter, session } = data;
  const iter = adapter.send(session, prompt, context);

  try {
    while (true) {
      const r = await iter.next();
      if (r.done)
        return r.value || STOP_REASONS.END_TURN;

      const update = r.value;
      transcripts.append(sessionId, { direction: "out", update });
      yield update;
    }
  } catch (e) {
    transcripts.append(sessionId, { direction: "out", error: e.message });
    throw e;
  }
}

export const cancelSession = async (sessionId) => {
  const data = getSessionData(sessionId);
  if (!data) return;
  await data.adapter.cancel(data.session);
};

export const closeSession = async (sessionId) => {
  const data = getSessionData(sessionId);
  if (!data) return;
  await data.adapter.close(data.session);
  sessionStore.delete(sessionId);
  transcripts.close(sessionId);
};

export const getAgents = () => listAdapters();

export const getModels = (agentId) => {
  const adapter = agentId ? getAdapter(agentId) : getDefaultAdapter();
  return adapter?.models || [];
};
