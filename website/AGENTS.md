# light/website (projects/light in the monorepo)

The component catalogue: the app that renders every `@bootstrapp/light` component from
its own demo, in any skin. It depends on `@bootstrapp/light` and `@bootstrapp/theme` the
way every project does, so the palette, the Google font and the icon collection arrive
through the ordinary boot with nothing set up by hand.

## Where things come from

- The nine categories and their order: `@bootstrapp/showcase/lib/categories.js`.
- A component's page is drawn from two things and nothing else: its `props` block
  and the `<component>.demo.js` beside it in the package. `@bootstrapp/showcase/lib/demos.js`
  loads one; the snippet under an example is `render.toString()`.
- The skins: `@bootstrapp/theme/presets.js`. A skin dresses the stages only, through
  `applyScopedTheme`; the chrome keeps this project's `theme.js`.
- The route table is `routes.js`: `/` (the landing page, `views/home.js`, its words and
  snippets in `lib/home-content.js` and its live `my-counter` in `lib/home-demos.js`),
  `/components`, `/components/:category`, `/components/:category/:name`, `/theming`,
  `/skins`, every one inside the `template-shell` template, which drops the rail and the
  outline on the landing page. The router spreads `category` and `name` onto the page as props.
- `controllers/catalogue.js` keeps what the pages share: the chosen skin (persisted, and
  taken from `?skin=` on boot), the search, the presets with their swatches, the current
  page's outline, and `open`/`select` for a card or a palette pick.
- `views/templates/shell.js` is the site around a page: `lc-app-shell` with the header
  (brand, the site's links, `lc-command-palette`, the skin `lc-dropdown`, `lc-darkmode`),
  a `lc-nav-tree` from the categories in the nav column (a drawer on a phone), and a
  `lc-toc` in the aside when the page reports headings.
- `lib/paths.js` spells the URLs and walks the catalogue in order; `lib/search-index.js`
  builds what the palette searches. Both are pure and tested under node.

## Rules for this project

- The site is composed from light's components. A raw `<pre>`, `<table>`, `<kbd>`, `<details>`
  or `<dialog>` in a view here means light is missing a component, and the fix is in
  light, not in this project's markup (`uix/pages-through-components`, this project's own rule in
  `check/rules/`, which shares its scan with `@bootstrapp/showcase`'s `pages-through-components`).
- Every length is a `--spacing-*`, `--radius-*` or `--text-*` token; the only literal
  pixel values allowed in this project's CSS are `0`, `1px`, `2px`, a media query's width
  and the `--docs-*` declarations in the shell (`tests/css-scale.test.js`).
- Views scope every top-level selector as `:where(docs-x)`; the shell's `.docs-page`,
  `.docs-title`, `.docs-lede` and `.docs-pager` are the classes a page's header uses.

## Commands

```bash
bootstrapp serve                 # http://localhost:3530
bootstrapp check                 # zero findings
bootstrapp typecheck
bootstrapp test                  # node + browser (tests/app-*.browser.test.js boot the real app)
```
