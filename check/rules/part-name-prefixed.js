import { defineRule } from "../define.js";

const STATIC_PART = /\bpart="([^"$]*)"/g;

export default defineRule({
  severity: "error",
  description: "Every part a template declares is named by the component's tag: part=\"<tag>-name\"",
  why: "parts live in light DOM, where a stylesheet selects them as [part~=name] through the document. Twenty names (container, header, body, title, footer, ...) are shared by several components, so an unprefixed name lets one component's rules reach another's part nested inside it. The tag prefix keeps every part name unique, and the same name works from the component's own stylesheet, a consumer's, and a test",
  check(ctx) {
    for (const file of ctx.componentFiles()) {
      const prefixes = ctx.viewsIn(file).flatMap((view) => (view.isComponent && view.tag ? [`${view.tag}-`] : []));
      if (!prefixes.length) continue;
      for (const template of ctx.templates(file)) {
        STATIC_PART.lastIndex = 0;
        let m;
        while ((m = STATIC_PART.exec(template.content)) !== null) {
          const bad = m[1].trim().split(/\s+/).filter((token) => token && !prefixes.some((prefix) => token.startsWith(prefix)));
          if (!bad.length) continue;
          const prefix = prefixes[0];
          ctx.report({
            file,
            offset: template.start + m.index,
            message: `part="${bad[0]}" in <${prefix.slice(0, -1)}> is not named by its tag; write part="${prefix}${bad[0]}" and select it as [part~=${prefix}${bad[0]}]`,
          });
        }
      }
    }
  },
});
