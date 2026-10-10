import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROUPS, PAGES, searchIndex } from "./search-index.js";

const listings = [{ id: "display", label: "Display", icon: "eye", description: "", components: ["bar-chart", "button"] }];
const presets = [{ name: "daisy", label: "Daisy", description: "Pill selectors", loader: async () => ({}) }];

describe("searchIndex", () => {
  const docs = searchIndex(listings, presets);

  it("lists components first, then pages, then skins", () => {
    assert.deepEqual([...new Set(docs.map((doc) => doc.group))], GROUPS);
    assert.equal(docs.length, listings[0].components.length + PAGES.length + presets.length);
  });

  it("titles a component by its readable name and links its page", () => {
    const chart = docs.find((doc) => doc.id === "component:display/bar-chart");
    assert.equal(chart?.title, "Bar Chart");
    assert.equal(chart?.href, "/components/display/bar-chart");
    assert.equal(chart?.hint, "lc-bar-chart · Display");
  });

  it("carries the skin's name for the palette to apply", () => {
    const skin = docs.find((doc) => doc.kind === "skin");
    assert.equal(skin?.skin, "daisy");
    assert.equal(skin?.href, undefined);
  });
});
