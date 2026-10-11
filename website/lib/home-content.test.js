import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FORM_FIELDS, PAIRS, SNIPPETS } from "./home-content.js";

describe("the home page's content", () => {
  it("has a snippet for every pair, and a pair for every snippet", () => {
    assert.deepEqual(PAIRS.map((pair) => pair.key).sort(), Object.keys(SNIPPETS).sort());
  });

  it("keys every pair once, as a section id a card can point at", () => {
    const keys = PAIRS.map((pair) => pair.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of keys) assert.match(key, /^[a-z]+$/);
  });

  it("shows the form the fields it runs", () => {
    for (const field of FORM_FIELDS) assert.ok(SNIPPETS.form.includes(`name: "${field.name}"`), field.name);
  });
});
