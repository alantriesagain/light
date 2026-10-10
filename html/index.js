import { HTML_KIND, SVG_KIND, TPL, WRAP, nothing } from "./constants.js";

/** @import { ElementBindings, ElementSpec, KeySpec, TemplateResult, TemplateValue, UnsafeSpec } from "./types.ts" */

/**
 * HTML tagged template. Returns a cheap result object; the template is
 * prepared once (cached by strings identity) and diffed on re-render.
 *
 * @param {TemplateStringsArray} strings
 * @param {...TemplateValue} values
 * @returns {TemplateResult}
 */
export const html = (strings, ...values) => ({ [TPL]: strings, kind: HTML_KIND, values });

/**
 * SVG tagged template: same semantics as html`` but parsed in an SVG
 * namespace context. Use for fragments rendered inside an <svg> parent.
 *
 * @param {TemplateStringsArray} strings
 * @param {...TemplateValue} values
 * @returns {TemplateResult}
 */
export const svg = (strings, ...values) => ({ [TPL]: strings, kind: SVG_KIND, values });

/**
 * Key a child value for identity-based reconciliation. A keyed array gets
 * move-based list diffing (reorders move DOM, never recreate it); a single
 * keyed value forces a fresh render when the key changes.
 *
 * @param {unknown} k
 * @param {unknown} value
 * @returns {KeySpec}
 */
export const key = (k, value) => /** @type {KeySpec} */ ({ [WRAP]: "key", k, v: value });

/**
 * Render an element with a runtime tag name: the safe replacement for
 * lit's staticHTML/unsafeStatic. Binding keys mirror template syntax:
 * plain keys are attributes, `.prop` sets a property, `@click` an event,
 * `?disabled` a boolean attribute, and `ref` receives the element (and
 * later `null` on teardown).
 *
 * @param {string} tag
 * @param {ElementBindings} [bindings]
 * @param {unknown} [children]
 * @returns {ElementSpec}
 */
export const element = (tag, bindings, children) => /** @type {ElementSpec} */ ({ [WRAP]: "el", tag, bindings, children });

/**
 * Render a raw HTML string as parsed markup. The only way a string
 * reaches an HTML parser at runtime; everything else commits via
 * attributes and text nodes.
 *
 * @param {unknown} value
 * @returns {UnsafeSpec}
 */
export const unsafeHTML = (value) => /** @type {UnsafeSpec} */ ({
  [WRAP]: "unsafe",
  s: value == null || value === nothing ? "" : String(value),
});

export { nothing };
export { disposeTree, hasRootPart, render } from "./parts.js";
export { ASSIGNED_ATTR, SlotPart, UNSLOTTED_TAG, isMoving, projectSlots, unprojectUnits } from "./slots.js";
export { topLevelPair } from "./adopt.js";
export { configure } from "./reactive.js";
