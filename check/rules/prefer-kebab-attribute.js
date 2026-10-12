import { defineRule } from "../define.js";

const TAG_RE = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)((?:\s[^<>]*)?)>/g;
const ATTR_RE = /(?:^|\s)([.@?]?)([a-zA-Z][\w:-]*)(?==|[\s/]|$)/g;
const SKIP_PREFIX = /^(?:data-|aria-|client:)/;

/** @param {string} prop */
const kebabOf = (prop) => prop.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

export default defineRule({
  severity: "warn",
  description: "Multi-word component attributes should use the kebab-case form",
  why: "the view layer binds both spellings, but kebab-case (use-system-preference) is the canonical reflected form and the readable house style; the collapsed lowercase form is legacy",
  check(ctx) {
    const index = ctx.componentIndex();
    for (const file of ctx.componentFiles())
      for (const template of ctx.templates(file)) {
        TAG_RE.lastIndex = 0;
        let tagMatch;
        while ((tagMatch = TAG_RE.exec(template.content)) !== null) {
          const [, tag, attrs] = tagMatch;
          if (!attrs || !index.has(tag)) continue;
          const props = index.propsOf(tag);
          if (!props) continue;
          const lowered = new Map([...props].map((p) => [p.toLowerCase(), p]));
          ATTR_RE.lastIndex = 0;
          let attrMatch;
          while ((attrMatch = ATTR_RE.exec(attrs)) !== null) {
            const [, prefix, name] = attrMatch;
            if (prefix || name.includes("-") || SKIP_PREFIX.test(name)) continue;
            const prop = lowered.get(name);
            if (!prop) continue;
            const kebab = kebabOf(prop);
            if (kebab !== name)
              ctx.report({
                file,
                offset: template.start + tagMatch.index,
                message: `attribute "${name}" on <${tag}>: prefer the kebab form "${kebab}" (canonical reflected spelling of ${prop})`,
              });
          }
        }
      }
  },
});
