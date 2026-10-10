import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { bootApp, disposeApp, until } from "@bootstrapp/test/app.js";

describe("a component's page", () => {
  let app;

  before(async () => {
    app = await bootApp("/components/display/button");
    await until(() => app.doc.querySelectorAll("showcase-component-doc lc-example").length > 0);
  });

  after(() => disposeApp(app));

  it("draws the breadcrumbs, one example per demo example, and the outline", async () => {
    assert.equal(app.doc.querySelectorAll("lc-breadcrumbs .breadcrumbs-item").length, 3);
    const examples = app.doc.querySelectorAll("showcase-component-doc lc-example.component-doc-example");
    assert.ok(examples.length >= 5);
    await until(() => app.doc.querySelectorAll("lc-toc .toc-link").length === examples.length + 3);
    assert.equal(app.doc.querySelector("lc-toc .toc-link").getAttribute("href"), "#examples");
  });

  it("walks to the next component through the pager and keeps the outline current", async () => {
    const next = app.doc.querySelector("lc-pagination[variant=pager] .pagination-pager-link.next");
    assert.ok(next, "a next link");
    assert.match(next.getAttribute("href"), /\/components\/display\/calendar$/);
    app.$APP.Router.go("/components/display/calendar");
    await until(() => app.doc.querySelector("docs-component h1")?.textContent === "Calendar");
    await until(() => app.doc.querySelectorAll("showcase-component-doc lc-example").length > 0);
    const examples = app.doc.querySelectorAll("showcase-component-doc lc-example.component-doc-example");
    await until(() => app.doc.querySelectorAll("lc-toc .toc-link").length === examples.length + 3);
  });

  it("opens a neighbour from the page's own prev control", async () => {
    app.doc.querySelector("showcase-component-doc .component-doc-nav lc-button").click();
    await until(() => app.$APP.Router.path === "/components/display/button");
    await until(() => app.doc.querySelector("docs-component h1")?.textContent === "Button");
  });

  it("drops the outline when the next page has none", async () => {
    await until(() => app.doc.querySelectorAll("lc-toc .toc-link").length > 0);
    app.$APP.Router.go("/theming");
    await until(() => app.doc.querySelector("docs-theming") !== null);
    await until(() => app.doc.querySelectorAll("lc-toc .toc-link").length === 0);
    assert.deepEqual(app.errors, []);
  });
});
