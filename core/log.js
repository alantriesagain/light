const writeLine = (stream, prefix, parts) => {
  const text = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
  stream.write(`${prefix}${text}\n`);
};

/**
 * @typedef Logger
 * @property {(...args: any[]) => void} log
 * @property {(...args: any[]) => void} warn
 * @property {(...args: any[]) => void} error
 * @property {(sublabel: string) => Logger} child
 */

/**
 * @param {string} [label]
 * @returns {Logger}
 */
export const createLogger = (label = "") => {
  const prefix = label ? `[${label}] ` : "";
  return {
    log: (...args) => writeLine(process.stdout, prefix, args),
    warn: (...args) => writeLine(process.stderr, `${prefix}warn: `, args),
    error: (...args) => writeLine(process.stderr, `${prefix}error: `, args),
    child: (sublabel) => createLogger(label ? `${label}/${sublabel}` : sublabel),
  };
};

export const defaultLogger = createLogger();
