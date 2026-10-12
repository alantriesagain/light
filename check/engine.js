/**
 * @bootstrapp/light/check/engine.js: run a set of rules over a project
 * context. Each rule passes its gate, takes its effective severity from the
 * project's `bootstrapp.check.rules` overrides, and reports through a
 * closure that resolves offsets to lines; a crash in a rule is a warning,
 * never the run's. An override naming a rule of an owner this run loaded
 * nothing from is left alone: it is for another host's pass over the same
 * project, not a typo.
 */

import { ruleApplies } from "./applies.js";
import { resolveFinding } from "./report.js";

/** @import { CatalogEntry, CheckResult, Finding, ProjectContext, ProjectModel, ReportedFinding, RuleEntry } from "./types.ts" */

const LEVELS = new Set(["off", "warn", "error"]);

/**
 * @template {ProjectModel} M
 * @param {{ context: ProjectContext<M>, rules: RuleEntry<M>[], ruleFilter?: string, overrides?: Record<string, string> }} opts
 * @returns {Promise<CheckResult>}
 */
export async function runRules({ context: ctx, rules, ruleFilter, overrides = ctx.config.check?.rules ?? {} }) {
  const started = Date.now();
  /** @type {string[]} */
  const configWarnings = [];
  const knownIds = new Set(rules.map((r) => r.id));
  const owners = new Set(rules.map((r) => r.owner));
  for (const [id, level] of Object.entries(overrides))
    if (!knownIds.has(id)) {
      if (owners.has(id.split("/")[0])) configWarnings.push(`bootstrapp.check.rules: unknown rule id "${id}", typo?`);
    }
    else if (!LEVELS.has(level)) configWarnings.push(`bootstrapp.check.rules: invalid level "${level}" for "${id}" (off | warn | error)`);

  if (ruleFilter && !knownIds.has(ruleFilter)) configWarnings.push(`unknown rule id "${ruleFilter}"`);

  /** @type {CatalogEntry[]} */
  const catalog = [];
  /** @type {ReportedFinding[]} */
  const findings = [];
  for (const entry of rules) {
    const declaredSeverity = entry.rule.severity;
    const override = LEVELS.has(overrides[entry.id]) ? /** @type {string} */ (overrides[entry.id]) : null;
    const effectiveSeverity = override || declaredSeverity;
    const notApplicable = ruleApplies(entry.rule, ctx);
    if (notApplicable?.warning) configWarnings.push(`rule ${entry.id}: ${notApplicable.warning}`);
    const forced = ruleFilter === entry.id;
    /** @type {CatalogEntry["status"]} */
    let status = "active";
    /** @type {string | undefined} */
    let reason;
    if (notApplicable && !forced) {
      status = "n/a";
      reason = notApplicable.reason;
    } else if (effectiveSeverity === "off" && !forced) status = "off";
    if (ruleFilter && !forced) {
      status = status === "active" ? "off" : status;
      reason = reason || "filtered";
    }
    catalog.push({
      id: entry.id,
      owner: entry.owner,
      declaredSeverity,
      effectiveSeverity,
      status,
      ...(reason ? { reason } : {}),
      description: entry.rule.description,
      ...(entry.rule.why ? { why: entry.rule.why } : {}),
    });
    if (status !== "active" && !forced) continue;

    const severity = /** @type {"error" | "warn"} */ (effectiveSeverity === "off" ? declaredSeverity : effectiveSeverity);
    const report = (/** @type {Finding} */ finding) => findings.push({ ruleId: entry.id, severity, ...resolveFinding(finding, ctx.lineAt) });
    try {
      await entry.rule.check({ ...ctx, report });
    } catch (e) {
      configWarnings.push(`rule ${entry.id} crashed: ${e instanceof Error ? e.message : e}`);
    }
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
  const errors = findings.filter((f) => f.severity === "error").length;
  return {
    rules: catalog,
    findings,
    configWarnings,
    stats: {
      files: ctx.files().length,
      rules: catalog.filter((r) => r.status === "active").length,
      errors,
      warnings: findings.length - errors,
      durationMs: Date.now() - started,
    },
  };
}
