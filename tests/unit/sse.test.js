import { test } from "node:test";
import assert from "node:assert/strict";
import { writeSse, sendJson, parseBody } from "../../server/sse.js";

const fakeRes = () => {
  const r = { written: [], statusCode: null, headers: null, ended: false };
  r.writeHead = (status, headers) => { r.statusCode = status; r.headers = headers; };
  r.write = (chunk) => { r.written.push(chunk); return true; };
  r.end = (chunk) => { if (chunk) r.written.push(chunk); r.ended = true; };
  r.writableEnded = false;
  return r;
};

test("writeSse formats event + data lines", () => {
  const r = fakeRes();
  const ok = writeSse(r, "tick", { n: 1 });
  assert.equal(ok, true);
  assert.equal(r.written.join(""), "event: tick\ndata: {\"n\":1}\n\n");
});

test("writeSse returns false when writableEnded", () => {
  const r = fakeRes();
  r.writableEnded = true;
  assert.equal(writeSse(r, "x", {}), false);
});

test("sendJson sets headers and body", () => {
  const r = fakeRes();
  sendJson(r, 201, { ok: true });
  assert.equal(r.statusCode, 201);
  assert.equal(r.headers["Content-Type"], "application/json");
  assert.equal(JSON.parse(r.written.join("")).ok, true);
});

test("parseBody handles JSON", async () => {
  const req = makeReq("{\"a\":1}");
  const body = await parseBody(req);
  assert.deepEqual(body, { a: 1 });
});

test("parseBody returns {} for empty", async () => {
  const req = makeReq("");
  assert.deepEqual(await parseBody(req), {});
});

test("parseBody rejects malformed", async () => {
  const req = makeReq("{nope}");
  await assert.rejects(() => parseBody(req));
});

const makeReq = (body) => ({
  on(event, cb) {
    if (event === "data" && body) cb(Buffer.from(body));
    if (event === "end") setImmediate(cb);
  },
});
