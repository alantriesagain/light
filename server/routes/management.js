import * as router from "../router.js";
import sessionStore from "../../core/session.js";
import { sendJson } from "../sse.js";

/**
 * @param {RequestContext} ctx
 * @returns {Promise<boolean | void>}
 */
export const handleManagement = async ({ res, method, pathname, defaultModel, cors }) => {
  if (method === "GET" && pathname === "/agents")
    return sendJson(res, 200, { agents: router.getAgents() }, cors);

  if (method === "GET" && pathname.startsWith("/models/")) {
    const agentId = pathname.slice("/models/".length);
    return sendJson(res, 200, { models: router.getModels(agentId) }, cors);
  }

  if (method === "GET" && pathname === "/health")
    return sendJson(res, 200, {
      status: "ok",
      sessions: sessionStore.count(),
      agents: router.getAgents().map((a) => a.id),
      defaultModel,
      api: "gaiteway/1",
    }, cors);

  if (method === "DELETE" && pathname.startsWith("/session/")) {
    const sessionId = pathname.slice("/session/".length);
    await router.closeSession(sessionId);
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (method === "GET" && pathname === "/sessions")
    return sendJson(res, 200, { sessions: sessionStore.list() }, cors);

  return false;
};
