import fs from "fs";
import path from "path";
import { parseArgs } from "../args.js";
import { loadConfig, sessionsDir } from "../../core/config.js";

const SPEC = { config: { type: "string" } };

export default async (argv) => {
  const opts = parseArgs(argv, SPEC);
  const [sub, id] = opts._;
  const cfg = loadConfig(opts.config);
  const dir = sessionsDir(cfg._dir || process.cwd());

  if (!sub || sub === "list") {
    if (!fs.existsSync(dir)) {
      process.stdout.write("(no sessions)\n");
      return;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      process.stdout.write("(no sessions)\n");
      return;
    }
    for (const f of files) {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      const msgs = data.transcript?.length || 0;
      process.stdout.write(`  ${data.id}  ${data.adapter}  ${msgs} msg  ${data.createdAt}\n`);
    }
    return;
  }

  if (sub === "show") {
    if (!id) throw new Error("sessions show <id>");
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) {
      process.stderr.write(`No such session: ${id}\n`);
      process.exit(1);
    }
    process.stdout.write(fs.readFileSync(file, "utf-8"));
    return;
  }

  if (sub === "kill") {
    if (!id) throw new Error("sessions kill <id>");
    const host = `http://${cfg.host}:${cfg.port}`;
    const res = await fetch(`${host}/session/${id}`, { method: "DELETE" });
    process.stdout.write(`${res.status} ${res.statusText}\n`);
    return;
  }

  if (sub === "replay") {
    process.stderr.write("sessions replay: not yet implemented\n");
    process.exit(2);
  }

  throw new Error(`Unknown sessions subcommand: ${sub}`);
};
