---
name: add-controller
description: Add a controller that owns state, model writes and IO, with its browser test
user_invocable: true
---

<!-- Managed by Bootstrapp: generated from bootstrapp/controller/skills/add-controller.md. Edit the source, then run `bootstrapp types`. -->

# Add a controller

Logic lives in controllers; views render and dispatch. Every `$APP.Model` write, every rule, every piece of state shared beyond one component goes in a `defineController` file under `controllers/`. If you are unsure whether a piece belongs here, in a mixin, in `lib/` or in the view, read the "choosing a citizen" section of `framework/README.md` first.

## Steps

1. **Scaffold**: `bootstrapp new:controller <name> --properties "count:number"` writes `controllers/<name>.js`. Registration is automatic: `$APP.<name>.<member>` works everywhere, created on first use. Read `$APP` inside the function that uses it, never into a module-scope binding.
2. **Declare every instance field in `properties`**: reactive state with `T.*`, handles (an interval id, a `modelQuery` resource, an audio engine) with `reactive: false` (`controller/declare-instance-surface`).
3. **Own the teardown**: every subscription or disposable made in `connected()` goes through `this.$own(...)`; `connected()` may be async and returns the work it starts.
4. **Write the browser test in the same commit**: `tests/app-<name>.browser.test.js` booting the real app (`controller/controller-has-test`).
5. `bootstrapp types` so `$APP.<name>` is typed from the JSDoc on the methods.

## Shape

```js
import { defineController, modelQuery } from "bootstrapp/controller";
import $APP from "bootstrapp";
import T from "bootstrapp/types";

export default defineController({
  name: "tasks",
  adapter: true,
  properties: {
    filter: T.string({ defaultValue: "all", sync: "local" }),
    rows: [],
    _rows: T.object({ reactive: false, defaultValue: null }),
  },
  connected() {
    this._rows = modelQuery("task", { order: "-createdAt", fields: ["id", "title", "done"] });
    this.$own([this._rows.subscribe((rows) => { this.rows = rows ?? []; }), this._rows.dispose]);
    return this._rows.ensure();
  },
  /** @param {string} title */
  async add(title) {
    const [error, row] = await $APP.Model.task.add({ title, done: false, createdAt: new Date().toISOString() });
    return error ? null : row;
  },
});
```

## Rules

- Framework members are `$`-prefixed (`$name`, `$config`, `$state`, `$sync`, `$own`, `$attach`, `$ready`, `$dispose`); a `$`-prefixed property or member throws at define time. Every plain name is free, `state`, `config`, `ready`, `connected` and `name` included.
- `adapter: true` makes the controller a `sync:` target for views (`sync: "tasks"`, property names must match).
- A controller too large for one literal is composed: `mixins: [withUndo, withAutosave({ delay })]`, each a `defineMixin({ properties, methods })` from `bootstrapp/controller` imported from the module that defines it. Fragments fold in first, the definition wins a collision, hooks chain mixin-first, and the generated `$APP.<name>` type carries every fragment's members.
- Rows a controller mirrors come from `modelQuery` (live, no refresh after writes); other async goes through `resource()`.
- Small persisted state is `T.*({ sync: "local" })` on the controller; strings are stored raw, everything else as JSON.
- A timer uses `Date.now()` as its time source and keeps the resumable handle in a `sync: "local"` object so a reload rebuilds it; the interval id is a `reactive: false` property stopped in `this.$own(() => ...)`.
- Reference: `projects/bboxe/controllers/timer.js` (timer, resumable handle, wake lock), `projects/bboxe/controllers/library.js` (several `modelQuery` handles), `examples/centavo/controllers/rates.js` (`resource()`), `framework/controller/README.md`.
