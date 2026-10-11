/** The shape of a component definition file, read from its default export. */

import * as ts from "typescript";
import { defaultExportExpression, hasNonNullDefault, mixinBindings, nameOf, sourceFile, unwrapToLiteral } from "./ast.js";

/** @import { ParsedComponent } from "../types.ts" */

const DEFINERS = new Set(["defineComponent", "defineMixin", "View.define"]);

/**
 * Whether the default export's literal is the definition itself.
 *
 * `unwrapToLiteral` takes a call's last argument, which is the definition for
 * `defineComponent({...})` and the options for a component factory that builds
 * one (`editorFor({ tag, kind })`). In the second case the definition's own
 * keys sit in the factory's body, so a key missing from the literal says
 * nothing about whether the component declares it.
 *
 * @param {import("typescript").Expression | null} expr
 */
const isDirectDefinition = (expr) => {
  if (!expr || !ts.isCallExpression(expr)) return true;
  const callee = expr.expression;
  const name = ts.isIdentifier(callee) ? callee.text
    : ts.isPropertyAccessExpression(callee) ? `${callee.expression.getText()}.${callee.name.text}` : "";
  return DEFINERS.has(name);
};

/**
 * @param {string} source
 * @param {string} filename
 * @returns {ParsedComponent | null} null when the file has no object-literal default export
 */
export const parseComponentSource = (source, filename) => {
  const sf = sourceFile(source, filename);
  const exported = defaultExportExpression(sf);
  const literal = unwrapToLiteral(exported);
  if (!literal) return null;
  const direct = isDirectDefinition(exported);

  let tag = null;
  let extendsTag = null;
  let styleTrue = false;
  let styleKnown = direct;
  const topLevelKeys = [];
  const propertyNames = [];
  let propsOffset = null;
  /** @type {Record<string, number>} */
  const keyOffsets = {};
  for (const m of literal.properties) {
    const key = nameOf(m.name);
    if (!key) continue;
    topLevelKeys.push(key);
    keyOffsets[key] = m.getStart(sf);
    if (!ts.isPropertyAssignment(m)) continue;
    if (key === "tag" && ts.isStringLiteral(m.initializer)) tag = m.initializer.text;
    if (key === "extends" && ts.isStringLiteralLike(m.initializer)) extendsTag = m.initializer.text;
    if (key === "style") {
      styleTrue = m.initializer.kind === ts.SyntaxKind.TrueKeyword;
      styleKnown = styleTrue || m.initializer.kind === ts.SyntaxKind.FalseKeyword;
    }
    if (key === "props" && ts.isObjectLiteralExpression(m.initializer)) {
      propsOffset = m.initializer.getStart(sf);
      for (const p of m.initializer.properties) {
        const pk = nameOf(p.name);
        if (pk) propertyNames.push({ name: pk, offset: p.getStart(sf), hasNonNullDefault: hasNonNullDefault(p) });
      }
    }
  }
  return { tag, extends: extendsTag, styleTrue, styleKnown, mixins: mixinBindings(sf, literal), topLevelKeys, keyOffsets, propertyNames, propsOffset, literal, sf };
};
