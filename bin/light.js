#!/usr/bin/env node
import { test } from "../test/cli.js";

const [command, ...args] = process.argv.slice(2);
if (command === "test") process.exitCode = (await test(args)) ? 0 : 1;
else {
  console.error("Usage: light test <files...>");
  process.exitCode = 1;
}
