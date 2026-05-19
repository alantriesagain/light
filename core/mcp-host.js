import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildFullToolName, parseFullToolName } from "./acp.js";

let StreamableHttpTransport = null;
try {
  ({ StreamableHTTPClientTransport: StreamableHttpTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js"));
} catch {}

/** @param {McpServerConfig} config */
const buildTransport = (config) => {
  const env = /** @type {Record<string, string>} */ ({ ...process.env, ...(config.env || {}) });

  if (config.command)
    return new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env,
    });

  if (config.serverPath || config.path) {
    const p = config.serverPath || config.path || "";
    return new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve(p)],
      env,
    });
  }

  if (config.url) {
    if (!StreamableHttpTransport)
      throw new Error("HTTP transport not available in this SDK version");
    return new StreamableHttpTransport(new URL(config.url));
  }

  throw new Error("MCP server config must have command, path/serverPath, or url");
};

/**
 * @param {{ log?: (msg: string) => void }} [opts]
 * @returns {McpHost}
 */
export const createMcpHost = ({ log = () => {} } = {}) => {
  /** @type {Map<string, McpServerEntry & { client: any }>} */
  const servers = new Map();
  /** @type {Set<(event: any) => void>} */
  const subscribers = new Set();

  /** @param {any} event */
  const notify = (event) => {
    for (const cb of subscribers)
      try { cb(event); } catch {}
  };

  /** @param {string} name */
  const refreshFromServer = async (name) => {
    const entry = servers.get(name);
    if (!entry?.client) return;
    const caps = entry.capabilities || {};

    if (caps.tools)
      try {
        const r = await entry.client.listTools();
        entry.tools = r.tools || [];
      } catch (e) {
        log(`[mcp] listTools ${name} failed: ${e.message}`);
      }

    if (caps.resources)
      try {
        const r = await entry.client.listResources();
        entry.resources = r.resources || [];
      } catch (e) {
        log(`[mcp] listResources ${name} failed: ${e.message}`);
      }

    if (caps.prompts)
      try {
        const r = await entry.client.listPrompts();
        entry.prompts = r.prompts || [];
      } catch (e) {
        log(`[mcp] listPrompts ${name} failed: ${e.message}`);
      }

    notify({ type: "server:refreshed", name });
  };

  /**
   * @param {string} name
   * @param {McpServerConfig} config
   */
  const connect = async (name, config) => {
    if (servers.has(name) && servers.get(name)?.client)
      throw new Error(`Server '${name}' already connected`);

    /** @type {McpServerEntry & { client: any }} */
    const entry = servers.get(name) || {
      name,
      config,
      client: null,
      status: "connecting",
      lastError: null,
      capabilities: null,
      tools: [],
      resources: [],
      prompts: [],
    };
    entry.config = config;
    entry.status = "connecting";
    entry.lastError = null;
    servers.set(name, entry);

    try {
      const transport = buildTransport(config);
      const client = new Client(
        { name: `gaiteway-${name}`, version: "0.1.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      entry.client = client;
      entry.status = "connected";
      entry.capabilities = client.getServerCapabilities() || {};

      client.fallbackNotificationHandler = async (n) => {
        notify({ type: "server:notification", name, notification: n });
      };

      await refreshFromServer(name);
      notify({ type: "server:connected", name });
      return entry;
    } catch (e) {
      entry.status = "error";
      entry.lastError = e.message;
      log(`[mcp] connect ${name} failed: ${e.message}`);
      notify({ type: "server:error", name, error: e.message });
      throw e;
    }
  };

  /** @param {string} name */
  const disconnect = async (name) => {
    const entry = servers.get(name);
    if (!entry) return;
    if (entry.client)
      try { await entry.client.close(); } catch {}
    entry.client = null;
    entry.status = "disconnected";
    entry.tools = [];
    entry.resources = [];
    entry.prompts = [];
    notify({ type: "server:disconnected", name });
  };

  /** @param {string} name */
  const remove = async (name) => {
    await disconnect(name);
    servers.delete(name);
    notify({ type: "server:removed", name });
  };

  /** @param {string} full @param {any} args */
  const invokeTool = async (full, args) => {
    const parts = parseFullToolName(full);
    if (!parts) throw new Error(`Invalid tool name: ${full}`);
    const entry = servers.get(parts.server);
    if (!entry?.client) throw new Error(`Server '${parts.server}' not connected`);
    return entry.client.callTool({ name: parts.name, arguments: args || {} });
  };

  /** @param {string} uri */
  const readResource = async (uri) => {
    for (const entry of servers.values()) {
      if (!entry.client) continue;
      const has = entry.resources.some((r) => r.uri === uri);
      if (has) return entry.client.readResource({ uri });
    }
    for (const entry of servers.values()) {
      if (!entry.client) continue;
      try { return await entry.client.readResource({ uri }); } catch {}
    }
    throw new Error(`Resource not found: ${uri}`);
  };

  /** @param {string} full @param {any} args */
  const renderPrompt = async (full, args) => {
    const parts = parseFullToolName(full);
    if (!parts) throw new Error(`Invalid prompt name: ${full}`);
    const entry = servers.get(parts.server);
    if (!entry?.client) throw new Error(`Server '${parts.server}' not connected`);
    return entry.client.getPrompt({ name: parts.name, arguments: args || {} });
  };

  return {
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    list() {
      return Array.from(servers.values()).map((e) => ({
        name: e.name,
        status: e.status,
        lastError: e.lastError,
        capabilities: e.capabilities,
        config: { command: e.config.command, args: e.config.args, url: e.config.url, path: e.config.serverPath || e.config.path },
      }));
    },
    get: (name) => {
      const e = servers.get(name);
      if (!e) return null;
      return { name: e.name, status: e.status, lastError: e.lastError, capabilities: e.capabilities, config: e.config };
    },
    listAllTools() {
      const out = [];
      for (const e of servers.values())
        for (const t of e.tools)
          out.push({
            server: e.name,
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            fullName: buildFullToolName(e.name, t.name),
          });
      return out;
    },
    listAllResources() {
      const out = [];
      for (const e of servers.values())
        for (const r of e.resources)
          out.push({
            server: e.name,
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          });
      return out;
    },
    listAllPrompts() {
      const out = [];
      for (const e of servers.values())
        for (const p of e.prompts)
          out.push({
            server: e.name,
            name: p.name,
            description: p.description,
            arguments: p.arguments,
            fullName: buildFullToolName(e.name, p.name),
          });
      return out;
    },
    connect,
    disconnect,
    remove,
    refresh: refreshFromServer,
    invokeTool,
    readResource,
    renderPrompt,
  };
};
