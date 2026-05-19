import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as transcripts from "../../core/transcripts.js";
import { sessionsDir } from "../../core/config.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "abr-tx-"));

test("open creates session file", () => {
  const dir = tmp();
  transcripts.open(dir, "s1", { adapter: "fake", model: "m" });
  const file = path.join(sessionsDir(dir), "s1.json");
  assert.equal(fs.existsSync(file), true);
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));
  assert.equal(data.id, "s1");
  assert.equal(data.adapter, "fake");
  assert.deepEqual(data.transcript, []);
});

test("append adds entries with timestamps", () => {
  const dir = tmp();
  transcripts.open(dir, "s2", { adapter: "fake" });
  transcripts.append("s2", { role: "user", content: "hello" });
  transcripts.append("s2", { event: { type: "content", text: "world" } });
  const data = JSON.parse(fs.readFileSync(path.join(sessionsDir(dir), "s2.json"), "utf-8"));
  assert.equal(data.transcript.length, 2);
  assert.equal(data.transcript[0].role, "user");
  assert.ok(data.transcript[0].at);
});

test("append on closed/unknown id is a no-op", () => {
  transcripts.append("never-opened", { x: 1 });
});
