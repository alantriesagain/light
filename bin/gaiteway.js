#!/usr/bin/env node
import { run } from "../cli/index.js";

run(process.argv.slice(2)).catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
