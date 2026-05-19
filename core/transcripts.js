import fs from "fs";
import path from "path";
import { sessionsDir } from "./config.js";

const cache = new Map();

const fileFor = (cfgDir, id) => path.join(sessionsDir(cfgDir), `${id}.json`);

export const ensureDir = (cfgDir) => {
  const dir = sessionsDir(cfgDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const open = (cfgDir, id, meta) => {
  ensureDir(cfgDir);
  const file = fileFor(cfgDir, id);
  const transcript = {
    id,
    adapter: meta.adapter,
    model: meta.model || null,
    customPrompt: meta.customPrompt || null,
    createdAt: new Date().toISOString(),
    transcript: [],
  };
  cache.set(id, { file, data: transcript });
  fs.writeFileSync(file, JSON.stringify(transcript, null, 2));
  return transcript;
};

export const append = (id, entry) => {
  const cached = cache.get(id);
  if (!cached) return;
  cached.data.transcript.push({ at: new Date().toISOString(), ...entry });
  fs.writeFileSync(cached.file, JSON.stringify(cached.data, null, 2));
};

export const close = (id) => {
  cache.delete(id);
};
