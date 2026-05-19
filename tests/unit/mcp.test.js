import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createMcpRegistry } from "../../core/mcp-config.js";

const tmpServer = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "abr-mcp-"));
  const p = path.join(dir, "server.js");
  fs.writeFileSync(p, "// fake server\n");
  return p;
};

test("discover registers servers from path", async () => {
  const reg = createMcpRegistry();
  const p = tmpServer();
  await reg.discover([{ name: "demo", path: p, tools: ["t1"], resources: ["res://x"] }]);
  assert.equal(reg.getServers().size, 1);
  assert.equal(reg.getServers().get("demo").serverPath, p);
});

test("discover registers command-form servers", async () => {
  const reg = createMcpRegistry();
  await reg.discover([{ name: "cmd", command: "node", args: ["x.js"] }]);
  const s = reg.getServers().get("cmd");
  assert.equal(s.command, "node");
  assert.deepEqual(s.args, ["x.js"]);
});

test("getTools yields fullName with mcp__ prefix", async () => {
  const reg = createMcpRegistry();
  const p = tmpServer();
  await reg.discover([{ name: "srv", path: p, tools: [{ name: "ping", description: "p" }] }]);
  const tools = reg.getTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "ping");
  assert.equal(tools[0].fullName, "mcp__srv__ping");
  assert.equal(tools[0].server, "srv");
});

test("getResources flattens across servers", async () => {
  const reg = createMcpRegistry();
  const p = tmpServer();
  await reg.discover([
    { name: "a", path: p, resources: ["a://1"] },
    { name: "b", path: p, resources: [{ uri: "b://2", description: "two" }] },
  ]);
  const r = reg.getResources();
  assert.equal(r.length, 2);
  assert.equal(r.find((x) => x.uri === "b://2").description, "two");
});

test("stdioConfig builds spawn-able configs", async () => {
  const reg = createMcpRegistry();
  const p = tmpServer();
  await reg.discover([{ name: "node-srv", path: p }, { name: "cmd-srv", command: "echo", args: ["x"] }]);
  const cfg = reg.stdioConfig();
  assert.equal(cfg["node-srv"].command, "node");
  assert.deepEqual(cfg["node-srv"].args, [p]);
  assert.equal(cfg["cmd-srv"].command, "echo");
});

test("missing path emits warning and skips", async () => {
  const reg = createMcpRegistry();
  const origErr = process.stderr.write;
  let captured = "";
  process.stderr.write = (s) => { captured += s; return true; };
  try {
    await reg.discover([{ name: "ghost", path: "/no/such/file" }]);
  } finally {
    process.stderr.write = origErr;
  }
  assert.equal(reg.getServers().size, 0);
  assert.match(captured, /Server not found/);
});
