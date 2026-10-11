/**
 * @bootstrapp/light/check/discover.js: where rules come from. A rule is one
 * file under a `check/rules/` directory, its id `<owner>/<basename>`; light's
 * own rules are owned by `light`, a project's by its name. A host adds the
 * directories of the project's dependencies.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateRuleShape } from "./define.js";
import { walkFiles } from "./walk.js";

/** @import { PackageJson, RuleEntry } from "./types.ts" */

/** @typedef {{ owner: string, file: string }} RuleSource */

const LIGHT_ROOT = fileURLToPath(new URL("../", import.meta.url));

/** @param {string} dir */
export const listRuleFiles = (dir) => walkFiles(dir, { recursive: false });

/**
 * The rule files of `<dir>/check/rules`, each owned by `owner`.
 * @param {string} owner
 * @param {string} dir
 * @returns {RuleSource[]}
 */
export const ruleSources = (owner, dir) => listRuleFiles(path.join(dir, "check", "rules")).map((file) => ({ owner, file }));

/** Light's own rules. */
export const ownRuleSources = () => ruleSources("light", LIGHT_ROOT);

/**
 * The project's own rules, owned by the name after the slash.
 * @param {string} projectDir
 * @param {PackageJson | null} pkg
 */
export const projectRuleSources = (projectDir, pkg) => ruleSources(/** @type {string} */ ((pkg?.name || "project").split("/").pop()), projectDir);

/**
 * Import and validate one rule file. A broken or invalid rule is a warning,
 * never a crash.
 * @param {string} owner
 * @param {string} file
 * @returns {Promise<{ entry: RuleEntry } | { warning: string }>}
 */
export const loadRuleFile = async (owner, file) => {
  const id = `${owner}/${path.basename(file, ".js")}`;
  try {
    const mod = await import(pathToFileURL(file).href);
    const problem = validateRuleShape(mod.default);
    if (problem) return { warning: `rule ${id} skipped: ${problem} (${file})` };
    return { entry: { id, owner, file, rule: mod.default } };
  } catch (e) {
    return { warning: `rule ${id} failed to load: ${e instanceof Error ? e.message : e}` };
  }
};

/**
 * Load every source once (the first owner of a file wins).
 * @param {RuleSource[]} sources
 * @returns {Promise<{ rules: RuleEntry[], warnings: string[] }>}
 */
export const loadRules = async (sources) => {
  const seen = new Set();
  const rules = [];
  const warnings = [];
  for (const { owner, file } of sources) {
    if (seen.has(file)) continue;
    seen.add(file);
    const loaded = await loadRuleFile(owner, file);
    if ("warning" in loaded) warnings.push(loaded.warning);
    else rules.push(loaded.entry);
  }
  return { rules, warnings };
};
