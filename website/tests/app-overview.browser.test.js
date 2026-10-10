import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { bootApp, disposeApp, until } from "@bootstrapp/test/app.js";

const counted = (doc) => [...doc.querySelectorAll("lc-nav-tree .nav-tree-count")].reduce((sum, el) => sum + Number(el.textContent), 0);

describe("the overview and a category", () => {
  let app;

  before(async () => {
    app = await bootApp("/");
    await until(() => app.doc.querySelectorAll(".catalogue-card").length > 0);
  });

  after(() => disposeApp(app));

  it("shows one card per component and a sink in the hero", () => {
    assert.equal(app.doc.querySelectorAll(".catalogue-card").length, counted(app.doc));
    assert.ok(app.doc.querySelector("showcase-catalogue showcase-sink"));
    assert.match(app.doc.querySelector("showcase-catalogue h1").textContent, /components/);
  });

  it("opens a component from its card", async () => {
    app.doc.querySelector(".catalogue-card").click();
    await until(() => app.$APP.Router.path === "/components/form/auth-form");
    await until(() => app.doc.querySelector("docs-component h1")?.textContent === "Auth Form");
  });

  it("narrows a category page to its own components", async () => {
    app.$APP.Router.go("/components/display");
    await until(() => app.doc.querySelector("docs-category h1")?.textContent === "Display");
    const count = Number([...app.doc.querySelectorAll("lc-nav-tree .nav-tree-group")].find((group) => group.textContent.includes("Display")).querySelector(".nav-tree-count").textContent);
    await until(() => app.doc.querySelectorAll(".catalogue-card").length === count);
    assert.equal(app.doc.querySelector("showcase-catalogue .catalogue-lead"), null);
    assert.ok(app.doc.querySelector("docs-category lc-pagination[variant=pager]"));
    assert.deepEqual(app.errors, []);
  });
});
