---
name: refactor-to-components
description: Replace a project component with light's components, extend one, or promote a pattern into light
user_invocable: true
---

<!-- Managed by Bootstrapp: generated from @bootstrapp/light/skills/refactor-to-components.md. Edit the source, then run `bootstrapp types`. -->

# Refactor a project component to light's components

## Steps

1. **Identify the target** (a file under `views/`, or scan for candidates: components under thirty lines that wrap standard UI, raw `<button>`/`<a>`/`<input>` where light has a fit, patterns light already provides).
   **A view that dispatches on a field's type to pick a control is always a candidate**: hand the
   field list to `<lc-form>` instead. Eleven views each grew their own renderer for the same types,
   and every fix had to be made eleven times. `check/field-list-through-form` names them.
2. **Read the component** for what it renders, its properties, its lifecycle, and which `lc-*` tags it already uses.
3. **Search light**: the map in light's `package.json` under `bootstrapp.components.lc`, then the component source under `light/components/` for its real props, events and slots. Categories: `display/`, `layout/`, `form/`, `navigation/`, `overlay/`, `feedback/`, `app/`, `page/`, `utility/`. Behaviour lives beside them in `mixins/` and pure helpers in `utils/`.
4. **Pick a mode** and show before/after:

### Hand a field list to the form

The view renders inputs from a list of fields. Describe each field and let
`<lc-form>` draw it: `type`, `required`, `help`, `visibleIf`, `options` or
`loadOptions`, `fields`/`itemFields` for a nested shape. Listen for
`field-change` to write as it is edited, or `form-submit` to write on submit.

A control the form does not have is a registration, not a branch:

```js
import { registerFormFieldRenderer } from "@bootstrapp/light/components/form/field-renderers.js";
registerFormFieldRenderer("colour", (field, value, onChange, html) => html`...`);
```

A view that owns its own row chrome keeps it and asks
`renderFormControl(field, value, onChange, html)` for the control alone. The
field list itself usually comes from `@bootstrapp/form`, which reads a model's
`$form` block, a schema with none, or a variable spec.

### Replace

The component is a thin wrapper around standard UI. Replace every usage with the light component inline, delete the file.

### Extend

Same structure as a light component plus project behaviour: `extends: "lc-<component>"`, keep only the additions. Lifecycle hooks chain up the `extends:` chain, ancestor first, so the base's `connected()` still runs.

### Compose a mixin

The behaviour exists but the component does not fit. List what light already carries: `withFormControl` (label, value, disabled, form association), `withClickOutside()`, `withEscapeKey`, `withOverlay()` (scroll lock, focus restore, Escape to the topmost layer only), `withPopover` (anchored to its trigger), `withPointerDrag()`, `withSwipeThreshold()`. Import from `@bootstrapp/light/components/mixins/<name>.js` and list it under `mixins: []`.

### Promote

A pattern several projects need and light lacks. Decide which citizen it is first: a component if it owns DOM, a **mixin** if two or more components would list it (one host means it is that component's own code), a **lib** if it is pure functions with no `$APP` and no DOM. Then create it (`/create-light-component` from the repo root for a component), register a component in light's `package.json` with a `tag:` matching the map key, and replace or extend. Candidates seen so far: a countdown ring, a photo media card (image, scrim, top and bottom slots), a selected state on `lc-list-row`, a raised centre action on `lc-bottom-nav`.

5. **Execute** and update every reference; run `bootstrapp check` and the browser tests.

## Common replacements

| Raw or custom | light |
|---|---|
| `<a href>` | `<lc-link>` |
| `<button>` | `<lc-button>` |
| card div | `<lc-card>` |
| metric | `<lc-stat>` |
| chip | `<lc-badge>` or `<lc-tag>` |
| row with icon, label, hint, meta | `<lc-list-row>` |
| modal | `<lc-modal>` or `<lc-alert-dialog>` |
| tabs, chips | `<lc-tabs>`, `<lc-segmented>` |
| spinner, toast, empty | `<lc-spinner>`, `<lc-toast>`, `<lc-empty-state>` |

## Rules

- Read the component source before recommending; verify props and slots exist (`lc-list-row` has `leading` and `trailing` slots, `lc-stat` a `figure` slot).
- Restyle through `theme.js` (`lc.*` var blocks), never by wrapping in custom CSS. `lc.button["border-radius"]` becomes `--lc-button-border-radius`.
- A control already renders its own label: `<lc-input label="Email">`, never a wrapper element around it.
- Preserve behaviour; keep the browser tests green.
