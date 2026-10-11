import assert from "node:assert/strict";
import test from "node:test";
import { classAttrs, htmlTemplates, scanTemplateEnd } from "./templates.js";

test("htmlTemplates returns outermost extents, stepping over nested templates and expressions", () => {
  const src = "const a = html`<div>${items.map((i) => html`<span>${i}</span>`)}</div>`; const b = other.html`x`; const c = html`<p>";
  const out = htmlTemplates(src);
  assert.equal(out.length, 1);
  assert.equal(out[0].content, "<div>${items.map((i) => html`<span>${i}</span>`)}</div>");
  assert.equal(out[0].start, src.indexOf("<div>"));
  assert.equal(scanTemplateEnd("abc", 0), -1);
});

test("classAttrs captures literal, object-key and template class values", () => {
  const src = 'html`<div class="a b"><span class=${done ? "x" : `y ${z}`}></span></div>`; export default { class: "host" };';
  const attrs = classAttrs(src);
  assert.deepEqual(attrs.map((a) => [a.value, a.template]), [["a b", false], ["host", false], ['done ? "x" : `y ${z}`', true]]);
});
