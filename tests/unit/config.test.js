import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, saveConfig, initConfig, resolveConfigDir, sessionsDir, DEFAULT_PORT } from "../../core/config.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gaiteway-cfg-"));

beforeEach(() => {
  delete process.env.GAITEWAY_HOME;
});

test("loadConfig returns defaults when file missing", () => {
  const dir = tmp();
  const cfg = loadConfig(dir);
  assert.equal(cfg._exists, false);
  assert.equal(cfg.port, DEFAULT_PORT);
  assert.equal(cfg.host, "localhost");
  assert.deepEqual(cfg.adapters, ["claude-cli", "codex", "acp"]);
});

test("initConfig creates file and dirs", () => {
  const dir = path.join(tmp(), ".gaiteway");
  const cfg = initConfig(dir);
  assert.equal(cfg._exists, true);
  assert.equal(fs.existsSync(cfg._file), true);
  assert.equal(fs.existsSync(sessionsDir(dir)), true);
});

test("saveConfig persists overrides", () => {
  const dir = tmp();
  const cfg = loadConfig(dir);
  cfg.port = 1234;
  cfg.adapters = ["only-this"];
  saveConfig(cfg);
  const reloaded = loadConfig(dir);
  assert.equal(reloaded.port, 1234);
  assert.deepEqual(reloaded.adapters, ["only-this"]);
});

test("GAITEWAY_HOME wins over cwd", () => {
  const dir = tmp();
  process.env.GAITEWAY_HOME = dir;
  assert.equal(resolveConfigDir(), path.resolve(dir));
});

test("explicit arg wins over env", () => {
  process.env.GAITEWAY_HOME = "/nope";
  const dir = tmp();
  assert.equal(resolveConfigDir(dir), path.resolve(dir));
});

test("saved file does not leak internal fields", () => {
  const dir = tmp();
  const cfg = initConfig(dir);
  const raw = JSON.parse(fs.readFileSync(cfg._file, "utf-8"));
  assert.equal(raw._dir, undefined);
  assert.equal(raw._file, undefined);
  assert.equal(raw._exists, undefined);
});
