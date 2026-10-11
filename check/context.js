/**
 * @bootstrapp/light/check/context.js: the project model a rule reads. Files
 * and their parsed shapes, the manifest, its dependencies and the component
 * index, cached per file and invalidated per save by a live runner. `fileMap`
 * (relative path to content) makes the context fully in-memory for tests.
 * `host` is what a host of the engine adds: the component maps of the
 * project's dependencies, extra component directories, what the walk leaves
 * out, the hooks and events its plugins give every component, its own notion
 * of a dependency and of the styling engine.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { toRel, walkFiles } from "./walk.js";
import { stripComments } from "./strip-comments.js";
import { parseImports } from "./parse/imports.js";
import { parseComponentSource } from "./parse/component.js";
import { classAttrs as classAttrsIn, htmlTemplates } from "./parse/templates.js";
import { createComponentIndex } from "./component-index.js";

/** @import { HostOptions, PackageJson, ProjectContext, View } from "./types.ts" */

export const DEFAULT_IGNORED_DIRS = ["node_modules", ".git", "dist", "build", "coverage"];
export const TEXT_EXTENSIONS = [".js", ".mjs", ".ts", ".css", ".json", ".html", ".md"];
const COMPONENT_DEPTH = 4;

/**
 * @param {{ projectDir: string, fileMap?: Record<string, string> | null, pkg?: PackageJson | null, host?: HostOptions }} opts
 * @returns {ProjectContext}
 */
export function createContext({ projectDir, fileMap = null, pkg: givenPkg = null, host = {} }) {
  /** @type {Map<string, string | null>} */
  const readCache = new Map();
  /** @type {Map<string, string | null>} */
  const codeCache = new Map();
  /** @type {Map<string, number[]>} */
  const lineIndexCache = new Map();
  /** @type {Map<string, View>} */
  const viewCache = new Map();
  /** @type {string[] | null} */
  let filesCache = null;
  /** @type {string[] | null} */
  let componentDirsCache = null;

  const read = (/** @type {string} */ rel) => {
    if (readCache.has(rel)) return /** @type {string | null} */ (readCache.get(rel));
    let content = null;
    if (fileMap) content = fileMap[rel] ?? null;
    else
      try {
        content = readFileSync(path.join(projectDir, rel), "utf-8");
      } catch {
        content = null;
      }
    readCache.set(rel, content);
    return content;
  };

  const code = (/** @type {string} */ rel) => {
    if (codeCache.has(rel)) return /** @type {string | null} */ (codeCache.get(rel));
    const source = read(rel);
    const stripped = source == null ? null : stripComments(source);
    codeCache.set(rel, stripped);
    return stripped;
  };

  /** @type {PackageJson} */
  const pkg = givenPkg ?? (() => {
    const raw = read("package.json");
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();
  const config = /** @type {Record<string, any>} */ (pkg.bootstrapp || {});
  const check = /** @type {{ ignore?: string[], from?: string[] }} */ (config.check ?? {});
  const ignoredDirs = new Set([...DEFAULT_IGNORED_DIRS, ...(host.ignore?.dirs ?? [])]);
  const ignoredPrefixes = [...(host.ignore?.prefixes ?? []), ...(check.ignore ?? [])];
  const extensions = host.extensions ?? TEXT_EXTENSIONS;
  const scope = host.scope;
  const inScope = (/** @type {string} */ rel) => !scope || rel.startsWith(scope);

  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies, ...Object.fromEntries((check.from ?? []).map((name) => [name, "workspace:*"])) };
  const styling = host.styling ?? "css";
  const pluginHooks = new Set(host.pluginHooks ?? []);
  const pluginEvents = new Set(host.pluginEvents ?? []);

  const ownComponentDirs = () => {
    /** @type {string[]} */
    const dirs = [];
    for (const entry of Object.values(config.components || {}))
      if (typeof entry === "string") dirs.push(entry);
      else if (entry && typeof entry === "object")
        for (const file of Object.values(entry)) {
          if (typeof file !== "string") continue;
          const dir = file.replace(/^\.?\//, "").split("/").slice(0, -1).join("/");
          if (dir) dirs.push(dir);
        }
    const normalized = [...new Set(dirs.map((d) => (d.endsWith("/") ? d : `${d}/`)))];
    return normalized.length ? normalized : ["views/"];
  };
  const componentDirs = () => (componentDirsCache ??= [...ownComponentDirs(), ...(host.componentDirs?.(model) ?? [])]);

  const files = () => {
    if (filesCache) return filesCache;
    if (fileMap) filesCache = Object.keys(fileMap).filter((f) => !ignoredDirs.has(f.split("/")[0]) && !ignoredPrefixes.some((p) => f.startsWith(p)) && inScope(f)).sort();
    else
      filesCache = walkFiles(projectDir, {
        extensions,
        skipTests: false,
        prune: (name, rel) =>
          name.startsWith(".") || ignoredDirs.has(name) || host.ignore?.prune?.(name, rel) === true
          || ignoredPrefixes.some((p) => `${rel}/`.startsWith(p))
          || (!!scope && !`${rel}/`.startsWith(scope) && !scope.startsWith(`${rel}/`)),
        keep: (name, rel) => !name.startsWith(".") && !ignoredPrefixes.some((p) => rel.startsWith(p)) && inScope(rel),
      }).map((abs) => toRel(projectDir, abs)).sort();
    return filesCache;
  };

  const lineAt = (/** @type {string} */ rel, /** @type {number} */ offset) => {
    if (!lineIndexCache.has(rel)) {
      const content = read(rel) || "";
      const starts = [0];
      for (let i = 0; i < content.length; i++) if (content[i] === "\n") starts.push(i + 1);
      lineIndexCache.set(rel, starts);
    }
    const starts = /** @type {number[]} */ (lineIndexCache.get(rel));
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - starts[lo] + 1 };
  };

  /** @returns {View} */
  const parseView = (/** @type {string} */ rel) => {
    if (viewCache.has(rel)) return /** @type {View} */ (viewCache.get(rel));
    const source = read(rel);
    let parsed = null;
    if (source)
      try {
        parsed = parseComponentSource(source, rel);
      } catch {
        parsed = null;
      }
    const view = {
      file: rel,
      source: source || "",
      isComponent: !!parsed?.tag,
      tag: parsed?.tag || null,
      extends: parsed?.extends || null,
      styleTrue: parsed?.styleTrue || false,
      styleKnown: parsed?.styleKnown ?? true,
      mixins: parsed?.mixins || [],
      topLevelKeys: parsed?.topLevelKeys || [],
      keyOffsets: parsed?.keyOffsets || {},
      propertyNames: parsed?.propertyNames || [],
      propsOffset: parsed?.propsOffset ?? null,
      literal: parsed?.literal ?? null,
      sf: parsed?.sf ?? null,
    };
    viewCache.set(rel, view);
    return view;
  };

  const views = () =>
    files()
      .filter((f) => /\.(js|ts)$/.test(f) && !f.endsWith(".test.js") && componentDirs().some((d) => f.startsWith(d)))
      .map(parseView);

  const templates = (/** @type {string} */ rel) => htmlTemplates(code(rel) || "");
  const imports = (/** @type {string} */ rel) => parseImports(read(rel) || "");
  const classAttrs = (/** @type {string} */ rel) => classAttrsIn(read(rel) || "");

  const relOf = (/** @type {string} */ abs) => {
    const rel = toRel(projectDir, abs);
    return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel;
  };
  const readFile = (/** @type {string} */ abs) => {
    const rel = fileMap ? relOf(abs) : null;
    if (fileMap && rel !== null) return fileMap[rel] ?? null;
    try {
      return readFileSync(abs, "utf-8");
    } catch {
      return null;
    }
  };
  const exists = (/** @type {string} */ abs) => {
    const rel = fileMap ? relOf(abs) : null;
    if (fileMap && rel !== null) return rel in fileMap;
    try {
      return statSync(abs).isFile();
    } catch {
      return false;
    }
  };
  const listFiles = (/** @type {string} */ absDir) => {
    const rel = fileMap ? relOf(absDir) : null;
    if (fileMap && rel !== null) {
      const prefix = rel ? `${rel}/` : "";
      return Object.keys(fileMap).filter((f) => f.startsWith(prefix) && /\.(js|ts)$/.test(f)).sort().map((f) => path.join(projectDir, f));
    }
    return walkFiles(absDir, {
      extensions: [".js", ".ts"],
      prune: (name, dirRel) => name.startsWith(".") || name === "node_modules" || dirRel.split("/").length > COMPONENT_DEPTH,
      keep: (name) => !name.startsWith("."),
    });
  };
  const index = createComponentIndex({
    projectDir,
    maps: () => [{ owner: null, dir: projectDir, components: config.components || {} }, ...(host.componentMaps?.(model) ?? [])],
    views,
    listFiles,
    readFile,
    exists,
  });
  const componentIndex = () => index;

  const assetFiles = (/** @type {string} */ dir) => {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    if (fileMap) return Object.keys(fileMap).filter((f) => f.startsWith(prefix)).sort();
    return walkFiles(path.join(projectDir, prefix), { extensions: [""], skipTests: false }).map((abs) => toRel(projectDir, abs)).sort();
  };

  const invalidate = (/** @type {string} */ rel) => {
    readCache.delete(rel);
    codeCache.delete(rel);
    lineIndexCache.delete(rel);
    viewCache.delete(rel);
    if (componentDirs().some((d) => rel.startsWith(d))) index.clear();
    const known = filesCache?.includes(rel) ?? false;
    const present = fileMap ? rel in fileMap : existsSync(path.join(projectDir, rel));
    if (rel === "package.json" || known !== present) {
      filesCache = null;
      componentDirsCache = null;
      index.clear();
    }
  };

  /** @type {ProjectContext} */
  const model = {
    projectDir,
    pkg,
    config,
    deps,
    get componentDirs() {
      return componentDirs();
    },
    styling,
    pluginHooks,
    pluginEvents,
    hasDep: (dep) => (host.hasDep ? host.hasDep(dep, model) : !!deps[`@bootstrapp/${dep}`]),
    files,
    read,
    code,
    lineAt,
    views,
    view: parseView,
    componentIndex,
    templates,
    imports,
    classAttrs,
    assetFiles,
    invalidate,
  };
  return model;
}
