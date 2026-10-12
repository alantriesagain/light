/**
 * `light/no-explicit-any-jsdoc`: no `any` in a JSDoc type. Light is typed
 * through JSDoc; an `any` there switches the checker off for whatever flows
 * through it, so a boundary that truly needs one says why in a disable line.
 */

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      forbidden:
        "Explicit `any` in JSDoc is banned. Use a specific type or `unknown` (and narrow). If this boundary genuinely needs `any`, prefix with `// eslint-disable-next-line light/no-explicit-any-jsdoc -- <reason>`.",
    },
  },
  create(context) {
    const { sourceCode } = context;
    const ANY_PATTERN = /@(?:type|param|returns?|property|prop|arg|argument|template|typedef)\b[^*\n]*\{[^}]*\bany\b/;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (comment.type !== "Block") continue;
          if (!comment.value.startsWith("*")) continue;
          if (!ANY_PATTERN.test(comment.value)) continue;
          if (comment.loc) context.report({ loc: comment.loc, messageId: "forbidden" });
        }
      },
    };
  },
};

export default rule;
