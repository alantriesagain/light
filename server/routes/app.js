import { sendJson, parseBody } from "../sse.js";

/**
 * App-control relay: forwards a named command to the connected browser app and
 * returns its reply. `GET /app/status` reports whether an app is connected.
 *
 * @param {RequestContext & { appHub?: any }} ctx
 * @returns {Promise<boolean | void>}
 */
export const handleApp = async (ctx) => {
  const { req, res, method, pathname, appHub, cors } = ctx;
  if (!pathname.startsWith("/app")) return false;

  if (method === "GET" && pathname === "/app/status")
    return sendJson(res, 200, { connected: !!appHub?.connected?.() }, cors);

  if (method === "POST" && pathname === "/app/command") {
    if (!appHub?.connected?.())
      return sendJson(res, 409, { error: "no app connected" }, cors);
    const body = await parseBody(req).catch(() => ({}));
    if (!body?.name)
      return sendJson(res, 400, { error: "name is required" }, cors);
    try {
      const result = await appHub.command(body.name, body.args || {}, body.timeout);
      return sendJson(res, 200, { result }, cors);
    } catch (e) {
      return sendJson(res, 500, { error: e.message }, cors);
    }
  }

  return false;
};
