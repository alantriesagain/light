import { parseArgs } from "../args.js";
import { loadConfig, DEFAULT_PORT, DEFAULT_HOST } from "../../core/config.js";

const SPEC = {
  url: { type: "string" },
  config: { type: "string" },
};

export default async (argv) => {
  const opts = parseArgs(argv, SPEC);
  const cfg = loadConfig(opts.config);
  const url = opts.url || `http://${cfg.host || DEFAULT_HOST}:${cfg.port || DEFAULT_PORT}/health`;

  try {
    const res = await fetch(url);
    const body = await res.json();
    process.stdout.write(JSON.stringify(body, null, 2) + "\n");
    process.exit(res.ok ? 0 : 1);
  } catch (e) {
    process.stderr.write(`Bridge unreachable at ${url}: ${e.message}\n`);
    process.exit(1);
  }
};
