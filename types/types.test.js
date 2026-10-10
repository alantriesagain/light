import assert from "node:assert/strict";
import { describe, it } from "node:test";
import T, { cloneDefault, isReactive, parse, parsers } from "./index.js";

describe("light/types: descriptors", () => {
  it("reads attributes for scalars, not for arrays, objects and functions", () => {
    for (const type of ["string", "number", "boolean", "any"]) assert.equal(T[type]().attribute, true, type);
    for (const type of ["array", "object", "function"]) assert.equal(T[type]().attribute, false, type);
  });

  it("takes an options object or a bare default", () => {
    assert.deepEqual(T.string("hi"), { type: "string", attribute: true, defaultValue: "hi" });
    assert.deepEqual(T.array([1]), { type: "array", attribute: false, defaultValue: [1] });
    assert.equal(T.number({ defaultValue: 3, sync: "local" }).sync, "local");
  });

  it("makes reactive: false a plain field without an attribute, and refuses accessors on it", () => {
    const field = T.object({ reactive: false });
    assert.equal(field.attribute, false);
    assert.equal(isReactive(field), false);
    assert.equal(isReactive(T.object()), true);
    assert.throws(() => T.string({ reactive: false, getter: () => "x" }), /reactive:false/);
  });

  it("clones an object default and calls a factory default per field", () => {
    const shared = { a: 1 };
    assert.notEqual(cloneDefault({ defaultValue: shared }), shared);
    assert.deepEqual(cloneDefault({ defaultValue: () => [1] }), [1]);
    assert.equal(cloneDefault({ defaultValue: 2 }), 2);
  });
});

describe("light/types: parse", () => {
  it("coerces attribute strings to the declared type", () => {
    assert.equal(parse("", T.boolean()), true);
    assert.equal(parse("false", T.boolean()), false);
    assert.equal(parse("4", T.number()), 4);
    assert.equal(parse("null", T.string()), null);
    assert.deepEqual(parse("[1,2]", T.array()), [1, 2]);
    assert.deepEqual(parse("nope", T.array()), []);
    assert.deepEqual(parse('{"a":1}', T.object({ properties: { b: T.number(2) } })), { a: 1, b: 2 });
  });

  it("passes a type without a parser through, and takes a host's parsers", () => {
    assert.equal(parse("x", T.createType("color")), "x");
    parsers.color = (value) => String(value).toUpperCase();
    try {
      assert.equal(parse("x", T.createType("color")), "X");
    } finally {
      delete parsers.color;
    }
  });
});
