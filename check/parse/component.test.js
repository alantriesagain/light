import assert from "node:assert/strict";
import test from "node:test";
import { parseComponentSource } from "./component.js";

test("parseComponentSource reads tag, flags, keys and property defaults", () => {
  const src = `export default {
  tag: "fx-card",
  style: true,
  props: {
    rows: /** @type {any} */ (T.array({ defaultValue: [] })),
    bare: T.number(0),
    none: T.string(),
    nul: T.object({ defaultValue: null }),
  },
  render() {},
};
`;
  const parsed = parseComponentSource(src, "views/card.js");
  assert.equal(parsed.tag, "fx-card");
  assert.equal(parsed.styleTrue, true);
  assert.deepEqual(parsed.topLevelKeys, ["tag", "style", "props", "render"]);
  assert.deepEqual(Object.fromEntries(parsed.propertyNames.map((p) => [p.name, p.hasNonNullDefault])), { rows: true, bare: true, none: false, nul: false });
  assert.equal(parsed.keyOffsets.render, src.indexOf("render()"));
  assert.equal(parsed.propsOffset, src.indexOf("{\n    rows"));
});

test("parseComponentSource unwraps wrappers and answers null without a literal", () => {
  const wrapped = `export default defineComponent({ mixins: [withThing], tag: "fx-w", props: { v: T.string() } });`;
  assert.equal(parseComponentSource(wrapped, "w.js").tag, "fx-w");
  const fn = `export default () => { const x = 1; return { tag: "fx-fn" }; };`;
  assert.equal(parseComponentSource(fn, "fn.js").tag, "fx-fn");
  assert.equal(parseComponentSource("export const a = 1;", "a.js"), null);
  assert.equal(parseComponentSource("export default 42;", "n.js"), null);
});

test("parseComponentSource follows a definition assigned to a name and exported below", () => {
  const named = `const Def = defineComponent({ tag: "fx-named", style: true, render() {} });

View.define("fx-named", Def);

export default Def;
`;
  const parsed = parseComponentSource(named, "docs/named.js");
  assert.equal(parsed.tag, "fx-named");
  assert.equal(parsed.styleTrue, true);
  assert.deepEqual(parsed.topLevelKeys, ["tag", "style", "render"]);
});

test("parseComponentSource follows a bare literal held by a name", () => {
  const named = `const Def = { tag: "fx-bare" };
export default Def;
`;
  assert.equal(parseComponentSource(named, "docs/bare.js").tag, "fx-bare");
});

test("parseComponentSource gives up on a name that holds no literal", () => {
  assert.equal(parseComponentSource("const Def = 42;\nexport default Def;\n", "n.js"), null);
  assert.equal(parseComponentSource("export default Missing;\n", "m.js"), null);
});

test("parseComponentSource terminates on a name that refers to itself", () => {
  assert.equal(parseComponentSource("const Def = Def;\nexport default Def;\n", "loop.js"), null);
});
