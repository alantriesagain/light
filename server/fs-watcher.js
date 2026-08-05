import path from "path";
import fs, { promises as fsp } from "fs";
import { getFsRoot } from "./routes/fs.js";

const IGNORE_RE = /(^|[/\\])(\.|node_modules([/\\]|$))/;
const DEBOUNCE_MS = 50;

/**
 * Filesystem watcher for the gaiteway-served root. Uses Node's native
 * fs.promises.watch (recursive: true requires Node >= 20.6 on Linux,
 * always available on macOS / Windows). Falls back to no-op events if
 * the platform / Node version doesn't support recursive.
 *
 * @param {{ log?: (msg: string) => void }} [opts]
 */
export const createFsWatcher = async ({ log = (_msg) => {} } = {}) => {
  const root = getFsRoot();
  const subscribers = new Set();
  const pending = new Map();

  let watcher;
  try {
    watcher = fs.watch(root, { recursive: true });
  } catch (e) {
    log(`[fs-watch] fs.watch unavailable (${e.message}) — change events disabled`);
    return { subscribe: () => () => {}, close: () => {} };
  }

  const broadcast = (change) => {
    for (const cb of subscribers)
      try { cb(change); } catch (e) { log(`[fs-watch] sub error: ${e.message}`); }
  };

  const flush = async (rel, eventType) => {
    pending.delete(rel);
    const abs = path.join(root, rel);
    let stat = null;
    try { stat = await fsp.stat(abs); } catch {}
    if (eventType === "rename")
      if (stat) broadcast({ type: "created", path: rel, isDir: stat.isDirectory() });
      else broadcast({ type: "deleted", path: rel, isDir: false });
     else if (stat)
      broadcast({ type: "modified", path: rel, isDir: stat.isDirectory() });
  };

  const handle = (eventType, filename) => {
    if (!filename) return;
    if (IGNORE_RE.test(filename)) return;
    const rel = filename.replace(/\\/g, "/");
    const existing = pending.get(rel);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => flush(rel, pending.get(rel)?.eventType || eventType), DEBOUNCE_MS);
    pending.set(rel, { timer, eventType });
  };

  watcher.on("change", (eventType, filename) => handle(eventType, filename));
  watcher.on("error", (/** @type {NodeJS.ErrnoException} */ e) => {
    if (e?.code === "ENOENT") return;
    log(`[fs-watch] watcher error: ${e.message}`);
  });

  return {
    subscribe(cb) {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    async close() {
      subscribers.clear();
      try { watcher.close(); } catch {}
      for (const { timer } of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  };
};

export default createFsWatcher;
