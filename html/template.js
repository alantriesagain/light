import { MARKER_START, SVG_KIND } from "./constants.js";
import { parseTemplate } from "./parser.js";
import { createPart } from "./parts.js";

/** @import { PartSpec } from "./types.ts" */

const SHOW_ELEMENT_AND_COMMENT = 129;
const ELEMENT_MARKER = "data-$$";

/** @type {WeakMap<ReadonlyArray<string>, Template>} */
const templateCache = new WeakMap();

export class Template {
  /**
   * @param {ReadonlyArray<string>} strings
   * @param {number} kind
   */
  constructor(strings, kind) {
    const { markup, parts } = parseTemplate(strings, kind);
    const el = document.createElement("template");
    el.innerHTML = kind === SVG_KIND ? `<svg>${markup}</svg>` : markup;
    if (kind === SVG_KIND) {
      const wrapper = /** @type {Element} */ (el.content.firstChild);
      wrapper.replaceWith(.../** @type {Iterable<ChildNode>} */ (/** @type {unknown} */ (wrapper.childNodes)));
    }
    const walker = document.createTreeWalker(
      el.content,
      SHOW_ELEMENT_AND_COMMENT,
    );
    /** @type {number[]} */
    const elIndex = [];
    /** @type {number[]} */
    const childIndex = [];
    let nodeIndex = -1;
    let node;
    while ((node = walker.nextNode())) {
      nodeIndex++;
      if (
        node.nodeType === 1 &&
        /** @type {Element} */ (node).hasAttribute(ELEMENT_MARKER)
      ) {
        /** @type {Element} */ (node).removeAttribute(ELEMENT_MARKER);
        elIndex.push(nodeIndex);
      } else if (
        node.nodeType === 8 &&
        /** @type {Comment} */ (node).data === MARKER_START
      )
        childIndex.push(nodeIndex);
    }
    /** @type {PartSpec[]} */
    this.parts = parts
      .map((p) => ({
        ...p,
        nodeIndex:
          p.kind === "child"
            ? childIndex[/** @type {number} */ (p.childOrd)]
            : elIndex[/** @type {number} */ (p.elOrd)],
      }))
      .sort((a, b) => a.nodeIndex - b.nodeIndex || a.valueIndex - b.valueIndex);
    this.el = el;
    this.kind = kind;
  }
}

/**
 * Prepared-template cache, keyed on the TemplateStringsArray identity,
 * so template literals written once in a
 * render() are prepared once and diffed thereafter.
 *
 * @param {ReadonlyArray<string>} strings
 * @param {number} kind
 */
export const getTemplate = (strings, kind) => {
  let template = templateCache.get(strings);
  if (!template) {
    template = new Template(strings, kind);
    templateCache.set(strings, template);
  }
  return template;
};

export class TemplateInstance {
  /**
   * @param {Template} template
   * @param {object | undefined} host
   */
  constructor(template, host) {
    this.template = template;
    this.host = host;
    /** @type {ReturnType<typeof createPart>[]} */
    this.parts = [];
  }

  clone() {
    const fragment = document.importNode(this.template.el.content, true);
    const specs = this.template.parts;
    if (specs.length > 0) {
      const walker = document.createTreeWalker(
        fragment,
        SHOW_ELEMENT_AND_COMMENT,
      );
      let nodeIndex = -1;
      let partIdx = 0;
      let node;
      while (partIdx < specs.length && (node = walker.nextNode())) {
        nodeIndex++;
        while (
          partIdx < specs.length &&
          specs[partIdx].nodeIndex === nodeIndex
        ) {
          this.parts.push(createPart(specs[partIdx], node, this.host));
          partIdx++;
        }
      }
    }
    return fragment;
  }

  /** @param {unknown[]} values */
  commit(values) {
    for (const part of this.parts) part.setFromValues(values);
  }

  dispose() {
    for (const part of this.parts) part.dispose();
  }
}
