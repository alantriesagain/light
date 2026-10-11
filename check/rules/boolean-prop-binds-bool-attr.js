import { defineRule } from "../define.js";

const BINDING = /(^|[\s"'}])\.([a-zA-Z][\w$]*)=\$\{/g;

/** @param {string} prop */
const kebabOf = (prop) => prop.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/**
 * @param {string} source
 * @param {number} index
 */
const nearestOpenTag = (source, index) => {
  let last = null;
  const re = /<([a-z][\w-]*)/g;
  let m;
  while ((m = re.exec(source)) && m.index < index) last = m;
  return last;
};

/**
 * @param {string} source
 * @param {number} from
 */
const scanTagEnd = (source, from) => {
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (ch === "$" && source[i + 1] === "{") {
      depth++;
      i++;
    } else if (depth > 0 && ch === "{") depth++;
    else if (depth > 0 && ch === "}") depth--;
    else if (depth === 0 && ch === ">") return i;
    else if (depth === 0 && ch === "<" && i > from) return -1;
  }
  return -1;
};

/**
 * @param {string} source
 * @param {string} prop
 */
const booleanPropOptions = (source, prop) => {
  const decl = new RegExp(String.raw`(?:^|[{,\s])${prop}\s*:\s*(?:T\.boolean\s*\(|(true|false)\b)`).exec(source);
  if (!decl) return null;
  if (decl[1]) return decl[1];
  const open = decl.index + decl[0].length - 1;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
};

export default defineRule({
  severity: "error",
  description: "A T.boolean component property binds with the ?kebab-attribute form, not .prop",
  why: "boolean state belongs on the element as a toggled attribute: visible in the inspector, targetable from CSS ([is-streaming]), and the canonical reflected kebab spelling the component observes; exempt are attribute: false props (not bindable via attributes at all), sync props (not observed), and defaultValue: true booleans (?attr=${false} on a never-set attribute is a no-op, so the .prop form is the only way to express an initial false)",
  check(ctx) {
    const index = ctx.componentIndex();
    for (const file of ctx.files()) {
      if (!/\.(js|ts)$/.test(file) || /\.test\.(js|ts)$/.test(file)) continue;
      const source = ctx.read(file);
      if (!source?.includes("html`")) continue;
      for (const template of ctx.templates(file)) {
        BINDING.lastIndex = 0;
        let match;
        while ((match = BINDING.exec(template.content)) !== null) {
          const prop = match[2];
          const open = nearestOpenTag(template.content, match.index);
          if (!open) continue;
          const tag = open[1];
          if (!tag.includes("-") || !index.has(tag)) continue;
          const end = scanTagEnd(template.content, open.index);
          if (end === -1 || end < match.index) continue;
          const props = index.propsOf(tag);
          if (!props?.has(prop)) continue;
          const target = index.sourceOf(tag);
          if (!target) continue;
          const options = booleanPropOptions(target, prop);
          if (options === null) continue;
          if (/attribute\s*:\s*false/.test(options)) continue;
          if (/defaultValue\s*:\s*true/.test(options) || options.trim() === "true") continue;
          if (/\bsync\s*:/.test(options)) continue;
          const bindingOffset = match.index + match[1].length;
          ctx.report({
            file,
            offset: template.start + bindingOffset,
            message: `.${prop} on <${tag}>: ${prop} is a T.boolean property; bind it as ?${kebabOf(prop)}=\${...}`,
          });
        }
      }
    }
  },
});
