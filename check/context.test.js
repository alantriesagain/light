import assert from "node:assert/strict";
import test from "node:test";
import { contextFromFiles } from "./test-utils.js";
import { createContext } from "./context.js";

const VIEW = `import { html } from "@bootstrapp/light/html";
import T from "@bootstrapp/light/types";

export default {
  tag: "fx-card",
  style: true,
  props: {
    items: T.array({ defaultValue: [] }),
    draft: T.string(),
  },
  connected() {},
  render() {
    return html\`<div class="card">\${this.items.map((i) => html\`<span>\${i.name}</span>\`)}</div>\`;
  },
};
`;

test("views() parses component shape", () => {
  const ctx = contextFromFiles({ "views/card.js": VIEW, "views/util.js": "export const cap = (s) => s;" });
  const views = ctx.views();
  assert.equal(views.length, 2);
  const card = views.find((v) => v.file === "views/card.js");
  assert.equal(card.isComponent, true);
  assert.equal(card.tag, "fx-card");
  assert.equal(card.styleTrue, true);
  assert.deepEqual(card.propertyNames.map((p) => p.name), ["items", "draft"]);
  assert.ok(card.topLevelKeys.includes("connected"));
  const util = views.find((v) => v.file === "views/util.js");
  assert.equal(util.isComponent, false);
});

test("views() flags props whose defaultValue is non-null", () => {
  const src = `export default {
  tag: "fx-defaults",
  props: {
    rows: T.array({ defaultValue: [] }),
    bundle: T.object({ defaultValue: null }),
    ghost: T.object({ defaultValue: undefined }),
    item: T.object(),
    label: "plain",
  },
  render() { return null; },
};
`;
  const ctx = contextFromFiles({ "views/defaults.js": src });
  const byName = Object.fromEntries(ctx.views()[0].propertyNames.map((p) => [p.name, p.hasNonNullDefault]));
  assert.deepEqual(byName, { rows: true, bundle: false, ghost: false, item: false, label: true });
});

test("views() reads a defineComponent with mixins like any other", () => {
  const src = `import { defineComponent } from "@bootstrapp/light";
export default defineComponent({
  mixins: [withThing],
  tag: "fx-wrapped",
  props: { value: T.string() },
  render() { return null; },
});
`;
  const ctx = contextFromFiles({ "views/wrapped.js": src });
  const view = ctx.views()[0];
  assert.equal(view.tag, "fx-wrapped");
  assert.deepEqual(view.propertyNames.map((p) => p.name), ["value"]);
});

test("views() looks through a JSDoc cast when reading defaultValue", () => {
  const src = `export default {
  tag: "fx-x",
  props: {
    rows: /** @type {any} */ (T.array({ defaultValue: [] })),
    bare: T.number(0),
    none: T.string(),
  },
};
`;
  const ctx = contextFromFiles({ "views/x.js": src });
  const names = Object.fromEntries(ctx.views()[0].propertyNames.map((p) => [p.name, p.hasNonNullDefault]));
  assert.deepEqual(names, { rows: true, bare: true, none: false });
});

test("templates() extracts nested html extents", () => {
  const ctx = contextFromFiles({ "views/card.js": VIEW });
  const tpls = ctx.templates("views/card.js");
  assert.equal(tpls.length, 1);
  assert.ok(tpls[0].content.includes('class="card"'));
  assert.ok(tpls[0].content.includes("<span>"));
});

test("lineAt maps offsets to 1-based line/col", () => {
  const ctx = contextFromFiles({ "a.js": "one\ntwo\nthree" });
  assert.deepEqual(ctx.lineAt("a.js", 0), { line: 1, col: 1 });
  assert.deepEqual(ctx.lineAt("a.js", 4), { line: 2, col: 1 });
  assert.deepEqual(ctx.lineAt("a.js", 9), { line: 3, col: 2 });
});

test("imports() classifies static and dynamic imports", () => {
  const src = `import "@bootstrapp/light/theme/theme.css";
import View from "@bootstrapp/light";
import { html } from "@bootstrapp/light/html";
const mod = await import("./lazy.js");
`;
  const ctx = contextFromFiles({ "main.js": src });
  const imports = ctx.imports("main.js");
  assert.deepEqual(imports.map((i) => [i.spec, i.kind]), [
    ["@bootstrapp/light/theme/theme.css", "side-effect"],
    ["@bootstrapp/light", "default"],
    ["@bootstrapp/light/html", "named"],
    ["./lazy.js", "dynamic"],
  ]);
});

test("imports() ignores a specifier quoted inside a comment", () => {
  const ctx = contextFromFiles({
    "views/a.js": '/** consumers import { X } from "@bootstrapp/camera/commands.js" */\n// import "@bootstrapp/nope";\nimport T from "@bootstrapp/light/types";\nconst m = () => import("@bootstrapp/anim");',
  });
  assert.deepEqual(ctx.imports("views/a.js").map((i) => [i.spec, i.kind]), [["@bootstrapp/light/types", "default"], ["@bootstrapp/anim", "dynamic"]]);
});

test("classAttrs() captures literal and template class values", () => {
  const src = 'html`<div class="a b"><span class=${done ? "x" : "y"}></span></div>`; export default { class: "host" };';
  const ctx = contextFromFiles({ "views/x.js": src });
  const attrs = ctx.classAttrs("views/x.js");
  assert.deepEqual(attrs.map((a) => a.value), ["a b", "host", 'done ? "x" : "y"']);
});

test("deps merge the manifest's dependency blocks and the check.from names; hasDep reads them", () => {
  const ctx = contextFromFiles({}, { pkgJson: { name: "x", dependencies: { "@bootstrapp/light": "^1" }, devDependencies: { typescript: "^5" }, bootstrapp: { check: { from: ["@bootstrapp/check"] } } } });
  assert.deepEqual(ctx.deps, { "@bootstrapp/light": "^1", typescript: "^5", "@bootstrapp/check": "workspace:*" });
  assert.equal(ctx.hasDep("light"), true);
  assert.equal(ctx.hasDep("check"), true);
  assert.equal(ctx.hasDep("tw"), false);
  assert.equal(ctx.styling, "css");
  assert.deepEqual([...ctx.pluginHooks], []);
});

test("a host supplies its own notion of a dependency, the styling and the plugin hooks and events", () => {
  const ctx = contextFromFiles({}, {
    pkgJson: { name: "x", dependencies: { bootstrapp: "^1" } },
    host: { hasDep: (dep, model) => dep === "view" && !!model.deps.bootstrapp, styling: "tailwind", pluginHooks: ["dataLoaded"], pluginEvents: ["dataLoaded"] },
  });
  assert.equal(ctx.hasDep("view"), true);
  assert.equal(ctx.hasDep("light"), false);
  assert.equal(ctx.styling, "tailwind");
  assert.ok(ctx.pluginHooks.has("dataLoaded"));
  assert.ok(ctx.pluginEvents.has("dataLoaded"));
});

test("files() leaves out the ignored directories, the check.ignore prefixes and what the host prunes", () => {
  const ctx = contextFromFiles(
    { "views/a.js": "", "node_modules/x/index.js": "", "dist/out.js": "", "website/index.html": "", "native/android/x.kt": "", "lib/b.js": "" },
    { pkgJson: { name: "x", bootstrapp: { check: { ignore: ["website/"] } } }, host: { ignore: { dirs: ["native"] } } },
  );
  assert.deepEqual(ctx.files(), ["lib/b.js", "package.json", "views/a.js"]);
});

test("a scope restricts files() to one directory", () => {
  const ctx = contextFromFiles({ "views/a.js": "", "lib/b.js": "", "examples/todo/app.js": 'export default { tag: "todo-app" };' }, { host: { scope: "examples/todo/", componentDirs: () => ["examples/todo/"] } });
  assert.deepEqual(ctx.files(), ["examples/todo/app.js"]);
  assert.deepEqual(ctx.views().map((v) => v.tag), ["todo-app"]);
});

test("invalidate() refreshes every cached view of a file, and the file set when it changes", () => {
  const map = {
    "package.json": JSON.stringify({ name: "fixture", bootstrapp: { components: { fx: "views/" } } }),
    "views/card.js": 'export default { tag: "fx-card", props: { a: T.string() } };',
    "index.js": '/* x */ import "./lib.js";',
    "lib.js": "",
  };
  const ctx = createContext({ projectDir: "/fixture", fileMap: map });
  assert.equal(ctx.views().length, 1);
  assert.deepEqual([...ctx.componentIndex().propsOf("fx-card")], ["a"]);
  assert.ok(ctx.code("index.js").startsWith("       "));
  assert.equal(ctx.lineAt("index.js", 8).col, 9);

  map["views/card.js"] = 'export default { tag: "fx-card", props: { b: T.string() } };';
  map["index.js"] = "\nexport const nothing = 1;";
  ctx.invalidate("views/card.js");
  ctx.invalidate("index.js");
  assert.deepEqual(ctx.view("views/card.js").propertyNames.map((p) => p.name), ["b"]);
  assert.deepEqual([...ctx.componentIndex().propsOf("fx-card")], ["b"]);
  assert.equal(ctx.code("index.js"), map["index.js"]);
  assert.equal(ctx.lineAt("index.js", 1).line, 2);

  map["views/new.js"] = 'export default { tag: "fx-new" };';
  ctx.invalidate("views/new.js");
  assert.ok(ctx.files().includes("views/new.js"));
  assert.equal(ctx.componentIndex().has("fx-new"), true);
  delete map["views/new.js"];
  ctx.invalidate("views/new.js");
  assert.ok(!ctx.files().includes("views/new.js"));
  assert.equal(ctx.componentIndex().has("fx-new"), false);
});

test("views() covers a components map given in the nested name -> path form", () => {
  const pkgJson = {
    name: "@bootstrapp/light",
    bootstrapp: { components: { lc: { button: "display/button.js", modal: "overlay/modal.js" } } },
  };
  const ctx = contextFromFiles(
    {
      "display/button.js": 'export default { tag: "lc-button" };',
      "overlay/modal.js": 'export default { tag: "lc-modal" };',
      "views/ide-sidebar.js": 'export default { tag: "lc-ide-sidebar" };',
      "utils/pure.js": "export const id = (s) => s;",
    },
    { pkgJson },
  );
  const files = ctx.views().map((v) => v.file).sort();
  assert.deepEqual(files, ["display/button.js", "overlay/modal.js"]);
});

test("views() falls back to views/ only when no components map resolves a directory, and a host adds directories", () => {
  const pkgJson = { name: "fixture", bootstrapp: { components: {} } };
  const files = { "views/card.js": 'export default { tag: "fx-card" };', "display/button.js": 'export default { tag: "fx-button" };' };
  assert.deepEqual(contextFromFiles(files, { pkgJson }).views().map((v) => v.file), ["views/card.js"]);
  const hosted = contextFromFiles(files, { pkgJson, host: { componentDirs: () => ["display/"] } });
  assert.deepEqual(hosted.componentDirs, ["views/", "display/"]);
  assert.deepEqual(hosted.views().map((v) => v.tag), ["fx-button", "fx-card"]);
});
