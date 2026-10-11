/**
 * Comment strippers that keep offsets: every comment character becomes a
 * space (newlines stay), so a match found in the stripped text points at
 * the same position in the source.
 */

/** @param {string} match */
const blank = (match) => match.replace(/[^\n]/g, " ");

/**
 * Blank block comments (JSDoc `@example` blocks included) and whole-line
 * `//` comments in JavaScript. A `//` inside a string, such as a URL, is
 * left alone.
 * @param {string} source
 * @returns {string}
 */
export const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^(\s*)\/\/.*$/gm, blank);

/**
 * Blank block comments in CSS.
 * @param {string} css
 * @returns {string}
 */
export const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, blank);
