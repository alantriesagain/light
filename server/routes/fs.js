import fs from "fs";
import path from "path";
import os from "os";
import { sendJson, parseBody, CORS_HEADERS } from "../sse.js";

const fsp = fs.promises;
const ROOT = process.cwd();

const safeResolve = (rel) => {
  if (typeof rel !== "string") throw new Error("path required");
  if (rel.includes("\0")) throw new Error("invalid path");
  const cleaned = rel.replace(/^\/+/, "");
  if (cleaned.split(/[/\\]/).includes("..")) throw new Error("path traversal not allowed");
  const abs = path.resolve(ROOT, cleaned);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep))
    throw new Error("path escapes root");
  return abs;
};

const relFromAbs = (abs) => {
  if (abs === ROOT) return "";
  return abs.startsWith(ROOT + path.sep) ? abs.slice(ROOT.length + 1) : abs;
};

const IGNORED_PREFIXES = [".git", "node_modules"];
const isIgnored = (name) => name.startsWith(".") || IGNORED_PREFIXES.includes(name);

async function listRecursive(abs, relPrefix, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    const childAbs = path.join(abs, entry.name);
    const childRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push({ name: entry.name, path: childRel, type: "directory" });
      await listRecursive(childAbs, childRel, out);
    } else if (entry.isFile()) {
      let size = 0;
      let mtime = 0;
      try {
        const s = await fsp.stat(childAbs);
        size = s.size;
        mtime = s.mtimeMs;
      } catch {}
      out.push({ name: entry.name, path: childRel, type: "file", size, mtime });
    }
  }
  return out;
}

const friendlyRoot = (abs) => {
  const home = os.homedir();
  if (abs === home) return "~";
  if (abs.startsWith(home + path.sep)) return "~" + abs.slice(home.length);
  return abs;
};

/**
 * @param {RequestContext} ctx
 * @returns {Promise<boolean | void>}
 */
export const handleFs = async (ctx) => {
  const { res, req, method, pathname, url, cors = CORS_HEADERS } = ctx;

  if (method === "GET" && pathname === "/fs/info")
    return sendJson(res, 200, {
      root: ROOT,
      friendlyRoot: friendlyRoot(ROOT),
      platform: process.platform,
      version: 1,
    }, cors);

  if (pathname === "/fs/file") {
    const rel = url.searchParams.get("path") || "";
    try {
      const abs = safeResolve(rel);

      if (method === "GET") {
        const text = await fsp.readFile(abs, "utf8");
        res.writeHead(200, {
          ...cors,
          "Content-Type": "text/plain; charset=utf-8",
        });
        res.end(text);
        return;
      }

      if (method === "PUT") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks).toString("utf8");
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        await fsp.writeFile(abs, body);
        return sendJson(res, 200, { ok: true, path: rel }, cors);
      }

      if (method === "DELETE") {
        await fsp.rm(abs, { recursive: true, force: true });
        return sendJson(res, 200, { ok: true, path: rel }, cors);
      }
    } catch (e) {
      const status = /not allowed|escapes root|path required|invalid path/.test(e.message) ? 400 : 404;
      return sendJson(res, status, { error: e.message }, cors);
    }
    return false;
  }

  if (method === "POST" && pathname === "/fs/dir")
    try {
      const rel = url.searchParams.get("path") || "";
      const abs = safeResolve(rel);
      await fsp.mkdir(abs, { recursive: true });
      return sendJson(res, 200, { ok: true, path: rel }, cors);
    } catch (e) {
      return sendJson(res, 400, { error: e.message }, cors);
    }

  if (method === "POST" && pathname === "/fs/rename")
    try {
      const body = await parseBody(req);
      const fromAbs = safeResolve(body.from);
      const toAbs = safeResolve(body.to);
      await fsp.mkdir(path.dirname(toAbs), { recursive: true });
      await fsp.rename(fromAbs, toAbs);
      return sendJson(res, 200, { ok: true }, cors);
    } catch (e) {
      return sendJson(res, 400, { error: e.message }, cors);
    }

  if (method === "GET" && pathname === "/fs/tree")
    try {
      const rel = url.searchParams.get("path") || "";
      const abs = safeResolve(rel);
      const entries = await listRecursive(abs, rel || "");
      return sendJson(res, 200, { root: relFromAbs(abs), entries }, cors);
    } catch (e) {
      return sendJson(res, 400, { error: e.message }, cors);
    }

  if (method === "GET" && pathname === "/fs/exists")
    try {
      const rel = url.searchParams.get("path") || "";
      const abs = safeResolve(rel);
      try {
        const stat = await fsp.stat(abs);
        return sendJson(res, 200, {
          exists: true,
          type: stat.isDirectory() ? "directory" : "file",
        }, cors);
      } catch {
        return sendJson(res, 200, { exists: false }, cors);
      }
    } catch (e) {
      return sendJson(res, 400, { error: e.message }, cors);
    }

  return false;
};

export const getFsRoot = () => ROOT;
