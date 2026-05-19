import { parseArgs } from "../args.js";
import { loadConfig, saveConfig, initConfig } from "../../core/config.js";

const SPEC = { config: { type: "string" } };

export default async (argv) => {
  const opts = parseArgs(argv, SPEC);
  const [sub, key, value] = opts._;

  if (!sub || sub === "path") {
    const cfg = loadConfig(opts.config);
    process.stdout.write(cfg._file + "\n");
    return;
  }

  if (sub === "init") {
    const cfg = initConfig(opts.config);
    process.stdout.write(`Initialized ${cfg._file}\n`);
    return;
  }

  if (sub === "get") {
    const cfg = loadConfig(opts.config);
    const out = key ? cfg[key] : strip(cfg);
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }

  if (sub === "set") {
    if (!key) throw new Error("config set requires a key");
    const cfg = loadConfig(opts.config);
    cfg[key] = coerce(value);
    const saved = saveConfig(cfg);
    process.stdout.write(`Set ${key} in ${saved._file}\n`);
    return;
  }

  throw new Error(`Unknown config subcommand: ${sub}`);
};

const strip = (cfg) => {
  const { _dir, _file, _exists, ...rest } = cfg;
  return rest;
};

const coerce = (v) => {
  if (v === undefined) return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  try { return JSON.parse(v); } catch { return v; }
};
