import { defineRule } from "../define.js";

export default defineRule({
  severity: "warn",
  description: "style: true needs a sibling .css file, and a component's .css needs style: true",
  why: "a missing sibling silently loads nothing; a .css beside a component without style: true is never loaded",
  check(ctx) {
    const files = new Set(ctx.files());
    for (const view of ctx.views()) {
      if (!view.isComponent) continue;
      const cssFile = view.file.replace(/\.(js|ts)$/, ".css");
      if (view.styleTrue && !files.has(cssFile))
        ctx.report({
          file: view.file,
          offset: view.keyOffsets.style,
          message: `style: true but ${cssFile} does not exist; the component loads no styles`,
        });
      if (!view.styleTrue && view.styleKnown && files.has(cssFile))
        ctx.report({
          file: cssFile,
          line: 1,
          col: 1,
          message: `${cssFile} is never loaded; add style: true to <${view.tag}> (${view.file})`,
        });
    }
  },
});
