import { parseArgs } from "../args.js";
import { loadConfig, DEFAULT_PORT, DEFAULT_HOST } from "../../core/config.js";

const ADAPTER_FLAGS = {
  claude: "claude-cli",
  "claude-sdk": "claude-sdk",
  codex: "codex",
  acp: "acp",
};

const SPEC = {
  port: { type: "number" },
  host: { type: "string" },
  config: { type: "string" },
  stdio: { type: "boolean" },
  url: { type: "string" },
  claude: { type: "boolean" },
  "claude-sdk": { type: "boolean" },
  codex: { type: "boolean" },
  acp: { type: "boolean" },
};

const normalizeOrigin = (raw) => {
  if (!raw) return null;
  let u = raw.trim();
  if (!u.includes("://")) u = "https://" + u;
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
};

const adaptersFromFlags = (opts) => {
  const selected = [];
  for (const [flag, id] of Object.entries(ADAPTER_FLAGS))
    if (opts[flag]) selected.push(id);
  return selected;
};

export default async (argv) => {
  const opts = parseArgs(argv, SPEC);
  const cfg = loadConfig(opts.config);

  const adapterOverrides = adaptersFromFlags(opts);
  if (adapterOverrides.length > 0) cfg.adapters = adapterOverrides;

  const allowedOrigin = normalizeOrigin(opts.url);

  if (opts.stdio) {
    const { startStdioServer } = await import("../../server/stdio.js");
    await startStdioServer({ config: cfg });
    return;
  }

  const port = opts.port || cfg.port || DEFAULT_PORT;
  const host = opts.host || cfg.host || DEFAULT_HOST;

  const { createBridgeServer } = await import("../../server/index.js");
  const bridge = await createBridgeServer({ port, host, config: cfg, allowedOrigin });
  await bridge.start();

  const shutdown = async () => {
    await bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};
