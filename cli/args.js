/**
 * @typedef {{ type?: string, default?: any }} ArgSpec
 * @typedef {Record<string, any> & { _: string[] }} ParsedArgs
 */

/**
 * @param {string[]} argv
 * @param {Record<string, ArgSpec>} [spec]
 * @returns {ParsedArgs}
 */
export const parseArgs = (argv, spec = {}) => {
  /** @type {ParsedArgs} */
  const opts = { _: [], ...defaultsOf(spec) };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      opts._.push(a);
      continue;
    }
    const key = a.slice(2);
    const def = spec[key];
    if (!def) {
      opts[key] = true;
      continue;
    }
    if (def.type === "boolean") {
      opts[key] = true;
      continue;
    }
    const value = argv[++i];
    opts[key] = def.type === "number" ? Number(value) : value;
  }

  return opts;
};

/** @param {Record<string, ArgSpec>} spec */
const defaultsOf = (spec) => {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [key, def] of Object.entries(spec))
    if (def.default !== undefined) out[key] = def.default;

  return out;
};
