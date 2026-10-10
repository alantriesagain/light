import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { categoryPath, componentPath, neighbourCategories, neighbours, walk } from "./paths.js";

const listings = [
  { id: "form", label: "Form", icon: "list-checks", description: "", components: ["checkbox", "input"] },
  { id: "display", label: "Display", icon: "eye", description: "", components: ["badge", "button"] },
];

describe("paths", () => {
  it("spells a component's and a category's URL", () => {
    assert.equal(componentPath("display", "button"), "/components/display/button");
    assert.equal(categoryPath("display"), "/components/display");
  });

  it("walks every component in category order", () => {
    assert.deepEqual(walk(listings).map((ref) => ref.name), ["checkbox", "input", "badge", "button"]);
  });

  it("finds both neighbours across a category boundary", () => {
    assert.deepEqual(neighbours(listings, "form", "input"), {
      previous: { category: "form", name: "checkbox" },
      next: { category: "display", name: "badge" },
    });
  });

  it("answers null at either end and for a stranger", () => {
    assert.equal(neighbours(listings, "form", "checkbox").previous, null);
    assert.equal(neighbours(listings, "display", "button").next, null);
    assert.deepEqual(neighbours(listings, "layout", "card"), { previous: null, next: null });
  });

  it("finds the neighbouring categories", () => {
    assert.equal(neighbourCategories(listings, "form").previous, null);
    assert.equal(neighbourCategories(listings, "form").next?.id, "display");
    assert.equal(neighbourCategories(listings, "display").next, null);
  });
});
