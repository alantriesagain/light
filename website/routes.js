import { defineRoutes } from "bootstrapp/router";

export default defineRoutes({
  "/": { name: "home", title: "Light", component: "docs-home" },
  "/components": { name: "components", title: "Components", component: "docs-overview" },
  "/components/:category": { name: "category", title: "Components", component: "docs-category" },
  "/components/:category/:name": { name: "component", title: "Components", component: "docs-component" },
  "/theming": { name: "theming", title: "Theming", component: "docs-theming" },
  "/skins": { name: "skins", title: "Skins", component: "docs-skins" },
}, { template: "template-shell", spa: true });
