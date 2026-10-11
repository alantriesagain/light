import assert from "node:assert/strict";
import test from "node:test";
import { runRuleOn } from "../test-utils.js";
import rule from "./style-css-pairing.js";

const component = (style) => `export default {
  tag: "fx-card",${style ? "\n  style: true," : ""}
  render() { return null; },
};
`;

test("fires when style: true has no css sibling", async () => {
  const findings = await runRuleOn(rule, { "views/card.js": component(true) });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /loads no styles/);
});

test("fires when a css sibling exists without style: true", async () => {
  const findings = await runRuleOn(rule, { "views/card.js": component(false), "views/card.css": ".x{}" });
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /never loaded/);
});

test("silent on a correct pair, on unpaired css, and on helper modules", async () => {
  const findings = await runRuleOn(rule, {
    "views/card.js": component(true),
    "views/card.css": ".x{}",
    "views/tokens.css": ":root{}",
    "views/util.js": "export const cap = (s) => s;",
  });
  assert.equal(findings.length, 0);
});

test("a component factory whose style is a parameter is left alone", async () => {
  const findings = await runRuleOn(rule, {
    "views/editor.js": `import { defineComponent } from "@bootstrapp/light";
export const editorFor = ({ tag, style = true }) => defineComponent({
  tag,
  style,
  render() { return null; },
});
export default editorFor({ tag: "x-editor" });
`,
    "views/editor.css": ":where(.x-editor, x-editor) { display: block; }",
  });
  assert.equal(findings.length, 0);
});
