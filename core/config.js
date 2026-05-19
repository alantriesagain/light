import fs from "fs";
import path from "path";
import os from "os";

export const DEFAULT_PORT = 8765;
export const DEFAULT_HOST = "localhost";

/** @type {Omit<Config, "_dir" | "_file" | "_exists">} */
const DEFAULT_CONFIG = {
  port: DEFAULT_PORT,
  host: DEFAULT_HOST,
  adapters: ["claude-cli", "codex", "acp"],
  defaultModel: null,
  mcpServers: [],
};

/** @param {string} [explicit] @returns {string} */
export const resolveConfigDir = (explicit) => {
  if (explicit) return path.resolve(explicit);
  if (process.env.GAITEWAY_HOME) return path.resolve(process.env.GAITEWAY_HOME);

  const local = path.join(process.cwd(), ".gaiteway");
  if (fs.existsSync(local)) return local;

  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdg, "gaiteway");
};

/** @param {string} dir @returns {string} */
export const configPath = (dir) => path.join(dir, "config.json");

/** @param {string} dir @returns {string} */
export const sessionsDir = (dir) => path.join(dir, "sessions");

/** @param {string} [explicit] @returns {Config} */
export const loadConfig = (explicit) => {
  const dir = resolveConfigDir(explicit);
  const file = configPath(dir);

  if (!fs.existsSync(file))
    return { ...DEFAULT_CONFIG, _dir: dir, _file: file, _exists: false };

  const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  return { ...DEFAULT_CONFIG, ...raw, _dir: dir, _file: file, _exists: true };
};

/** @param {Config} config @returns {Config} */
export const saveConfig = (config) => {
  const dir = config._dir || resolveConfigDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "sessions"), { recursive: true });

  const { _dir, _file, _exists, ...persisted } = config;
  fs.writeFileSync(configPath(dir), JSON.stringify(persisted, null, 2));
  return { ...config, _dir: dir, _file: configPath(dir), _exists: true };
};

/** @param {string} [explicit] @returns {Config} */
export const initConfig = (explicit) => {
  const dir = explicit || path.join(process.cwd(), ".gaiteway");
  return saveConfig({ ...DEFAULT_CONFIG, _dir: dir });
};
