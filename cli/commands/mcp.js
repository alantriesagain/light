import { parseArgs } from "../args.js";
import { loadConfig, saveConfig } from "../../core/config.js";

const SPEC = { config: { type: "string" } };

export default async (argv) => {
  const opts = parseArgs(argv, SPEC);
  const [sub, name, ...rest] = opts._;

  if (!sub || sub === "list") {
    const cfg = loadConfig(opts.config);
    if (cfg.mcpServers.length === 0)
      process.stdout.write("(no MCP servers configured)\n");
    else
      for (const s of cfg.mcpServers)
        process.stdout.write(`  ${s.name}  ${s.path || s.command}\n`);

    return;
  }

  if (sub === "add") {
    if (!name || rest.length === 0)
      throw new Error("mcp add <name> <path>");

    const cfg = loadConfig(opts.config);
    cfg.mcpServers = cfg.mcpServers.filter((s) => s.name !== name);
    cfg.mcpServers.push({ name, path: rest[0] });
    saveConfig(cfg);
    process.stdout.write(`Added MCP server: ${name}\n`);
    return;
  }

  if (sub === "remove") {
    if (!name) throw new Error("mcp remove <name>");
    const cfg = loadConfig(opts.config);
    cfg.mcpServers = cfg.mcpServers.filter((s) => s.name !== name);
    saveConfig(cfg);
    process.stdout.write(`Removed MCP server: ${name}\n`);
    return;
  }

  if (sub === "inspect") {
    if (!name) throw new Error("mcp inspect <name>");
    const cfg = loadConfig(opts.config);
    const server = cfg.mcpServers.find((s) => s.name === name);
    if (!server) {
      process.stderr.write(`No such server: ${name}\n`);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify(server, null, 2) + "\n");
    return;
  }

  throw new Error(`Unknown mcp subcommand: ${sub}`);
};
