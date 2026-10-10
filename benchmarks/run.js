import fs from "node:fs";
import { chromium } from "playwright";
import { serve } from "./serve.js";

const PAGES = ["rows-view", "rows-components", "rows-html", "rows-thunks", "rows-lit", "cascade", "reflect"];
const METRICS = ["TaskDuration", "RecalcStyleDuration", "LayoutDuration"];

const args = process.argv.slice(2);
/** @param {string} name @param {string} fallback */
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};
const runs = Number(option("runs", "7"));
const pages = option("pages", PAGES.join(",")).split(",");
const jsonOut = option("json", "");
const baseline = option("compare", "");

/** @param {number[]} values */
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** @param {import("playwright").CDPSession} cdp */
const sample = async (cdp) => {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(metrics.filter((m) => METRICS.includes(m.name)).map((m) => [m.name, m.value * 1000]));
};

/** @typedef {{ wall: number, cpu: number, layout: number }} Sample */
/** @typedef {Window & { bench: { ready: boolean, steps: { name: string, measure: boolean }[], run: (index: number) => Promise<number> } }} BenchWindow */

const server = await serve();
const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
const browser = await chromium.launch({ headless: true });
/** @type {Record<string, Record<string, Sample>>} */
const results = {};

try {
  for (const name of pages) {
    /** @type {Record<string, Sample[]>} */
    const samples = {};
    for (let run = 0; run < runs; run++) {
      const page = await browser.newPage();
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      /** @type {string[]} */
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}/bench/${name}.html`);
      await page.waitForFunction(() => /** @type {Partial<BenchWindow>} */ (window).bench?.ready, null, { timeout: 30000 });
      /** @type {{ name: string, measure: boolean }[]} */
      const steps = await page.evaluate(() => /** @type {BenchWindow} */ (window).bench.steps);
      for (let index = 0; index < steps.length; index++) {
        const before = await sample(cdp);
        const wall = await page.evaluate((at) => /** @type {BenchWindow} */ (window).bench.run(at), index);
        const after = await sample(cdp);
        if (!steps[index].measure) continue;
        (samples[steps[index].name] ??= []).push({
          wall,
          cpu: after.TaskDuration - before.TaskDuration,
          layout: after.RecalcStyleDuration - before.RecalcStyleDuration + after.LayoutDuration - before.LayoutDuration,
        });
      }
      await page.close();
      if (errors.length) throw new Error(`${name}: ${errors.join("; ")}`);
    }
    results[name] = Object.fromEntries(
      Object.entries(samples).map(([step, list]) => [step, {
        wall: median(list.map((s) => s.wall)),
        cpu: median(list.map((s) => s.cpu)),
        layout: median(list.map((s) => s.layout)),
      }]),
    );
  }
} finally {
  await browser.close();
  server.close();
}

/** @type {Record<string, Record<string, Sample>>} */
const previous = baseline ? JSON.parse(fs.readFileSync(baseline, "utf8")).results : {};
/** @param {number} value */
const ms = (value) => value.toFixed(1).padStart(8);
/** @param {number} now @param {number | undefined} then */
const delta = (now, then) => (then ? `${(((now - then) / then) * 100).toFixed(0).padStart(5)}%` : "");

for (const [name, steps] of Object.entries(results)) {
  console.log(`\n${name} (median of ${runs}; ms)`);
  console.log(`${"step".padEnd(24)}${"wall".padStart(8)}${"cpu".padStart(8)}${"layout".padStart(8)}${"other".padStart(8)}${baseline ? "    wall vs base    cpu vs base" : ""}`);
  for (const [step, s] of Object.entries(steps)) {
    const then = previous[name]?.[step];
    console.log(`${step.padEnd(24)}${ms(s.wall)}${ms(s.cpu)}${ms(s.layout)}${ms(s.cpu - s.layout)}${baseline ? `    ${delta(s.wall, then?.wall).padStart(12)}   ${delta(s.cpu, then?.cpu).padStart(12)}` : ""}`);
  }
}

if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ runs, date: new Date().toISOString(), results }, null, 2));
