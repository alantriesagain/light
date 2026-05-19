import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../../cli/args.js";

test("parseArgs collects positionals", () => {
  const r = parseArgs(["foo", "bar"]);
  assert.deepEqual(r._, ["foo", "bar"]);
});

test("parseArgs applies number/string types", () => {
  const r = parseArgs(["--port", "9000", "--host", "h"], {
    port: { type: "number" },
    host: { type: "string" },
  });
  assert.equal(r.port, 9000);
  assert.equal(r.host, "h");
});

test("parseArgs applies defaults", () => {
  const r = parseArgs([], { port: { type: "number", default: 8765 } });
  assert.equal(r.port, 8765);
});

test("parseArgs boolean flag without value", () => {
  const r = parseArgs(["--stdio"], { stdio: { type: "boolean" } });
  assert.equal(r.stdio, true);
});

test("parseArgs unknown long flag becomes true", () => {
  const r = parseArgs(["--mystery"]);
  assert.equal(r.mystery, true);
});

test("parseArgs preserves positional order around flags", () => {
  const r = parseArgs(["a", "--port", "9", "b"], { port: { type: "number" } });
  assert.deepEqual(r._, ["a", "b"]);
  assert.equal(r.port, 9);
});
