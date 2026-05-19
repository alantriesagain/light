const sessions = new Map();

export const create = (sessionId, adapterId, session) => {
  const data = {
    sessionId,
    adapterId,
    session,
    sseRes: null,
    pendingMessage: null,
    createdAt: new Date().toISOString(),
  };
  sessions.set(sessionId, data);
  return data;
};

export const get = (sessionId) => sessions.get(sessionId);

export const update = (sessionId, updates) => {
  const data = sessions.get(sessionId);
  if (data) Object.assign(data, updates);
  return data;
};

export const remove = (sessionId) => sessions.delete(sessionId);

export const list = () =>
  Array.from(sessions.entries()).map(([id, data]) => ({
    sessionId: id,
    adapterId: data.adapterId,
    createdAt: data.createdAt,
    hasSSE: !!data.sseRes,
    hasPending: !!data.pendingMessage,
  }));

export const count = () => sessions.size;

export default { create, get, update, delete: remove, list, count };
