import fs from "fs";
import path from "path";
import { buildFullToolName } from "./acp.js";

/**
 * @typedef {{name: string} & McpServerConfig & {tools?: any[], resources?: any[]}} ServerEntry
 */

export const createMcpRegistry = () => {
  /** @type {Map<string, ServerEntry>} */
  const servers = new Map();

  return {
    getServers: () => servers,

    /** @param {string} name @param {ServerEntry} server */
    register(name, server) {
      servers.set(name, server);
    },

    /** @param {Array<{name: string} & McpServerConfig & {tools?: any[], resources?: any[]}>} mcpServerConfigs */
    async discover(mcpServerConfigs) {
      for (const server of mcpServerConfigs) {
        if (server.command) {
          servers.set(server.name, {
            name: server.name,
            command: server.command,
            args: server.args || [],
            env: server.env || {},
            tools: server.tools || [],
            resources: server.resources || [],
          });
          continue;
        }

        if (server.path) {
          const serverPath = path.isAbsolute(server.path)
            ? server.path
            : path.resolve(process.cwd(), server.path);

          if (!fs.existsSync(serverPath)) {
            process.stderr.write(`[MCP] Server not found: ${serverPath}\n`);
            continue;
          }

          servers.set(server.name, {
            name: server.name,
            serverPath,
            env: server.env || {},
            tools: server.tools || [],
            resources: server.resources || [],
          });
        }
      }
    },

    getTools() {
      const tools = [];
      for (const [serverName, config] of servers)
        for (const tool of config.tools || []) {
          const name = typeof tool === "string" ? tool : tool.name;
          const description = typeof tool === "string" ? "" : (tool.description || "");
          tools.push({
            name,
            description,
            server: serverName,
            fullName: buildFullToolName(serverName, name),
          });
        }
      return tools;
    },

    getResources() {
      const resources = [];
      for (const [serverName, config] of servers)
        for (const r of config.resources || []) {
          const uri = typeof r === "string" ? r : r.uri;
          const description = typeof r === "string" ? "" : (r.description || "");
          resources.push({ uri, description, server: serverName });
        }
      return resources;
    },

    stdioConfig() {
      /** @type {Record<string, {command: string, args: string[], env: Record<string, any>}>} */
      const config = {};
      for (const [name, server] of servers)
        if (server.serverPath)
          config[name] = {
            command: "node",
            args: [server.serverPath],
            env: { ...process.env },
          };
        else if (server.command)
          config[name] = {
            command: server.command,
            args: server.args || [],
            env: { ...process.env, ...server.env },
          };

      return config;
    },
  };
};
