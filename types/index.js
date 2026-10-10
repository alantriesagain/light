/**
 * @file @bootstrapp/light/types
 * `T`: property descriptors for components, and the coercion of an attribute
 * string into the declared type.
 */

/** @import { Parser, TypeDefinition, TypeOptions } from "./types.ts" */

const NON_ATTRIBUTE_TYPES = new Set(["array", "object", "function"]);

/** @type {Record<string, null | undefined>} */
const specialCases = { undefined: undefined, null: null, "": null };

/** @param {string} value */
const parseJSON = (value) => {
  try {
    return value in specialCases ? value : JSON.parse(value);
  } catch (_) {
    return undefined;
  }
};

/**
 * Coercion per type, from what an attribute or an input holds to the declared
 * type. A host adds its own types here (`parsers.date = ...`).
 * @type {Record<string, Parser>}
 */
export const parsers = {
  any: (value) => value,
  function: (value) => value,
  boolean: (value, prop) =>
    ((prop?.attribute ?? true) && value === "") || ["true", 1, "1", true].includes(/** @type {string | number | boolean} */ (value)),
  string: (value) => {
    const key = String(value);
    return key in specialCases ? specialCases[key] : key;
  },
  number: (value) => (value === null || value === undefined || value === "" ? value : Number(value)),
  array: (value, prop) => {
    if (Array.isArray(value)) return value;
    const parsed = typeof value === "string" ? parseJSON(value) : value;
    if (!value || !Array.isArray(parsed)) return [];
    const itemType = /** @type {Record<string, TypeDefinition> | undefined} */ (prop?.itemType);
    if (!itemType || typeof itemType.type === "string") return parsed;
    return parsed.map((item) =>
      typeof item !== "object" || item === null
        ? item
        : Object.fromEntries(
            Object.entries(item).map(([key, val]) => {
              const parser = itemType[key] && parsers[itemType[key].type];
              return [key, parser ? parser(val, prop) : val];
            }),
          ),
    );
  },
  object: (input, prop) => {
    if (input === null) return null;
    const value = typeof input === "string" ? parseJSON(input) : input;
    if (prop?.properties && value && typeof value === "object") {
      const target = /** @type {Record<string, unknown>} */ (value);
      for (const [key, def] of Object.entries(prop.properties))
        if (def.defaultValue !== undefined && target[key] === undefined) target[key] = def.defaultValue;
    }
    return value;
  },
};

/**
 * `value` coerced to `prop.type`; a type without a parser passes through.
 * @param {unknown} value
 * @param {TypeDefinition} [prop]
 * @returns {unknown}
 */
export const parse = (value, prop) => {
  const parser = prop && parsers[prop.type];
  return parser ? parser(value, prop) : value;
};

/**
 * A property descriptor. `options` is an options object or a bare default
 * (`T.string("hi")` is `T.string({ defaultValue: "hi" })`; an array is a
 * default too). Arrays, objects and functions do not read attributes.
 * @param {string} type
 * @param {TypeOptions | unknown} [options]
 * @returns {TypeDefinition}
 */
export const createType = (type, options) => {
  /** @type {TypeDefinition} */
  const typeDef = {
    type,
    attribute: !NON_ATTRIBUTE_TYPES.has(type),
    ...(typeof options === "object" && !Array.isArray(options) && options !== null ? options : { defaultValue: options }),
  };
  if (typeDef.reactive === false) {
    if (typeDef.getter || typeDef.setter || typeDef.hasChanged)
      throw new Error(`T.${type}: reactive:false is a plain instance field; it cannot combine with getter/setter/hasChanged.`);
    typeDef.attribute = false;
  }
  return typeDef;
};

/**
 * Whether a descriptor is a reactive store field (the default) or a plain
 * per-instance field (`reactive: false`).
 * @param {{ reactive?: boolean } | undefined} prop
 */
export const isReactive = (prop) => prop?.reactive !== false;

/**
 * A field's starting value from its descriptor, fresh per instance: a factory
 * default is called, an object or array is deep-cloned, a primitive passes.
 * @param {{ defaultValue?: unknown } | undefined} prop
 */
export const cloneDefault = (prop) => {
  const dv = prop?.defaultValue;
  return typeof dv === "function" ? dv() : dv && typeof dv === "object" ? structuredClone(dv) : dv;
};

/** @param {string} type */
const factory = (type) => (/** @type {unknown} */ options) => createType(type, options);

const T = {
  any: factory("any"),
  string: factory("string"),
  number: factory("number"),
  boolean: factory("boolean"),
  array: factory("array"),
  object: factory("object"),
  function: factory("function"),
  createType,
  parse,
};

export default T;
