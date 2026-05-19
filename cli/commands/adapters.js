import { parseArgs } from "../args.js";
import { loadConfig, saveConfig } from "../../core/config.js";
import { listAdapterIds } from "../../adapters/index.js";

const SPEC = { config: { type: "string" } };

export default async (argv) => {
  const opts = parseArgs(argv, SPEC);
  const [sub, name] = opts._;

  if (!sub || sub === "list") {
    const cfg = loadConfig(opts.config);
    const available = listAdapterIds();
    process.stdout.write("Available:\n");
    for (const id of available)
      process.stdout.write(`  ${id}${cfg.adapters.includes(id) ? "  [enabled]" : ""}\n`);

    return;
  }

  if (sub === "add" || sub === "remove") {
    if (!name) throw new Error(`adapters ${sub} requires a name`);
    const cfg = loadConfig(opts.config);
    const set = new Set(cfg.adapters);
    if (sub === "add") set.add(name); else set.delete(name);
    cfg.adapters = [...set];
    saveConfig(cfg);
    process.stdout.write(`${sub === "add" ? "Enabled" : "Disabled"} adapter: ${name}\n`);
    return;
  }

  throw new Error(`Unknown adapters subcommand: ${sub}`);
};
