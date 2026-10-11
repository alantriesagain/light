/** `html\`...\`` template extents and `class` attribute values in a source text. */

/** @import { ClassAttr, Template } from "../types.ts" */

/**
 * Index of the backtick closing the template literal whose body starts at
 * `pos`, stepping over `${}` expressions and nested templates; -1 when
 * unterminated.
 * @param {string} src
 * @param {number} pos
 * @returns {number}
 */
export const scanTemplateEnd = (src, pos) => {
  let depth = 0;
  for (; pos < src.length; pos++) {
    const ch = src[pos];
    if (ch === "\\") {
      pos++;
      continue;
    }
    if (depth === 0) {
      if (ch === "`") return pos;
      if (ch === "$" && src[pos + 1] === "{") {
        depth = 1;
        pos++;
      }
    } else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "`") {
      const end = scanTemplateEnd(src, pos + 1);
      if (end === -1) return -1;
      pos = end;
    }
  }
  return -1;
};

/**
 * Every `html\`` template in the source, outermost extents only.
 * @param {string} source
 * @returns {Template[]}
 */
export const htmlTemplates = (source) => {
  const out = [];
  let i = 0;
  while ((i = source.indexOf("html`", i)) !== -1) {
    if (i > 0 && /[\w$.]/.test(source[i - 1])) {
      i += 5;
      continue;
    }
    const start = i + 5;
    const end = scanTemplateEnd(source, start);
    if (end === -1) break;
    out.push({ content: source.slice(start, end), start });
    i = end + 1;
  }
  return out;
};

/**
 * Literal `class="..."` / `class: "..."` values and the expression of every
 * `class=${...}` binding.
 * @param {string} source
 * @returns {ClassAttr[]}
 */
export const classAttrs = (source) => {
  /** @type {ClassAttr[]} */
  const out = [];
  for (const re of [/class="([^"]*)"/g, /class:\s*"([^"]*)"/g]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) out.push({ value: m[1], offset: m.index, template: false });
  }
  const exprRe = /class=\$\{/g;
  let m;
  while ((m = exprRe.exec(source)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let pos = start;
    for (; pos < source.length && depth > 0; pos++) {
      const ch = source[pos];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === "`") {
        const end = scanTemplateEnd(source, pos + 1);
        if (end === -1) break;
        pos = end;
      }
    }
    out.push({ value: source.slice(start, pos - 1), offset: m.index, template: true });
  }
  return out;
};
