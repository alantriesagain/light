import { sendJson, parseBody } from "../sse.js";

/**
 * @param {import("http").ServerResponse} res
 * @param {number} status
 * @param {any} data
 * @param {Record<string, string>} cors
 */
const send = (res, status, data, cors) => sendJson(res, status, data, cors);

/**
 * @param {RequestContext} ctx
 * @returns {Promise<boolean | void>}
 */
export const handleMcp = async (ctx) => {
  const { req, res, url, method, pathname, mcpHost, cors } = ctx;

  if (!pathname.startsWith("/mcp/")) return false;

  if (!mcpHost) {
    send(res, 503, { error: "MCP host not initialized" }, cors);
    return;
  }

  if (method === "GET" && pathname === "/mcp/servers")
    return send(res, 200, { servers: mcpHost.list() }, cors);

  if (method === "POST" && pathname === "/mcp/servers") {
    const body = await parseBody(req);
    const { name, command, args, env, url: serverUrl, path: serverPath } = body;
    if (!name)
      return send(res, 400, { error: "name is required" }, cors);
    if (!command && !serverUrl && !serverPath)
      return send(res, 400, { error: "command, url, or path is required" }, cors);

    try {
      await mcpHost.connect(name, { command, args, env, url: serverUrl, serverPath });
      return send(res, 201, mcpHost.get(name), cors);
    } catch (e) {
      return send(res, 500, { error: e.message }, cors);
    }
  }

  const matchServer = pathname.match(/^\/mcp\/servers\/([^/]+)(\/.*)?$/);
  if (matchServer) {
    const name = decodeURIComponent(matchServer[1]);
    const sub = matchServer[2] || "";

    if (method === "GET" && sub === "")
      return send(res, 200, mcpHost.get(name) || { error: "not found" }, cors);

    if (method === "GET" && sub === "/status") {
      const s = mcpHost.get(name);
      return send(res, s ? 200 : 404, s || { error: "not found" }, cors);
    }

    if (method === "DELETE" && sub === "") {
      await mcpHost.remove(name);
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (method === "POST" && sub === "/connect") {
      const body = await parseBody(req).catch(() => ({}));
      const existing = mcpHost.get(name);
      try {
        await mcpHost.connect(name, body || existing?.config || {});
        return send(res, 200, mcpHost.get(name), cors);
      } catch (e) {
        return send(res, 500, { error: e.message }, cors);
      }
    }
  }

  if (method === "GET" && pathname === "/mcp/tools")
    return send(res, 200, { tools: mcpHost.listAllTools() }, cors);

  const invokeMatch = pathname.match(/^\/mcp\/tools\/([^/]+)\/invoke$/);
  if (invokeMatch && method === "POST") {
    const fullName = decodeURIComponent(invokeMatch[1]);
    const body = await parseBody(req);
    try {
      const result = await mcpHost.invokeTool(fullName, body.arguments || body);
      return send(res, 200, result, cors);
    } catch (e) {
      return send(res, 500, { error: e.message }, cors);
    }
  }

  if (method === "GET" && pathname === "/mcp/resources")
    return send(res, 200, { resources: mcpHost.listAllResources() }, cors);

  if (method === "GET" && pathname === "/mcp/resources/read") {
    const uri = url.searchParams.get("uri");
    if (!uri) return send(res, 400, { error: "uri is required" }, cors);
    try {
      const result = await mcpHost.readResource(uri);
      return send(res, 200, result, cors);
    } catch (e) {
      return send(res, 404, { error: e.message }, cors);
    }
  }

  if (method === "GET" && pathname === "/mcp/prompts")
    return send(res, 200, { prompts: mcpHost.listAllPrompts() }, cors);

  const promptMatch = pathname.match(/^\/mcp\/prompts\/([^/]+)\/render$/);
  if (promptMatch && method === "POST") {
    const fullName = decodeURIComponent(promptMatch[1]);
    const body = await parseBody(req);
    try {
      const result = await mcpHost.renderPrompt(fullName, body.arguments || body);
      return send(res, 200, result, cors);
    } catch (e) {
      return send(res, 500, { error: e.message }, cors);
    }
  }

  return false;
};
