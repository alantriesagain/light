import assert from "node:assert/strict";
import test from "node:test";
import { runRuleOn } from "../test-utils.js";
import rule from "./no-dom-member-shadowing.js";

const view = (body) => `import T from "@bootstrapp/light/types";
export default { tag: "fx-card", ${body} render() { return null; } };
`;

test("fires on a property named after a DOM method", async () => {
  const findings = await runRuleOn(rule, { "views/card.js": view("props: { click: T.function() },") });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /property "click" shadows the DOM's click\(\)/);
});

test("fires on a method named after a DOM method", async () => {
  const findings = await runRuleOn(rule, { "views/card.js": view("scroll() {},") });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /method "scroll" shadows the DOM's scroll\(\)/);
});

test("leaves accessors, near-misses and ordinary names alone", async () => {
  const findings = await runRuleOn(rule, {
    "views/card.js": view("props: { title: T.string(), role: T.string(), scrollable: T.boolean(), animation: T.string() }, removeItem() {},"),
  });
  assert.deepEqual(findings, []);
});
