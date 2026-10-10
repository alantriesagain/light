# @bootstrapp/light/signals

The reactive primitives everything else builds on: `signal`, `computed`,
`effect`, `batch`, `untracked`, and `selector` (keyed O(2) selection fan-out).
Zero dependencies, environment-agnostic. Safe at module eval in any runtime.

The layering: **signals → store → views.** `store.js` is the keyed reactive
store behind a component's `$state`; the view engine wires the renderer's
thunk adapter to `effect` when it loads (so `${() => sig.value}` bindings are
live anywhere View is used); the renderer itself stays dependency-free and
receives the adapter through `configure({ effect })`.

Notes that earn their place here:

- **`Signal.$sync`** exposes the keyed `{ adapter, get, set, subscribe }`
  contract a binding layer consumes (Bootstrapp's `sync:` properties take a
  signal that way: `count: T.number({ sync: sig })`). A `Computed` bound this
  way is read-only; a write through it throws.
- **`selector(sig)`** holds a subscription on its source for its lifetime;
  create it once per signal at module/controller scope, not per render.
- **`subscribe(cb)` runs the callback untracked**: only the source signal
  is a dependency of the internal effect. A callback may freely read or
  write other reactive state (bump a counter, set a view property) without
  subscribing itself to it; before this contract, a read-modify-write in a
  callback re-triggered its own effect forever.
- The dependency protocol (`getCurrentEffect`, the `Reactive` shape) is
  public API: external reactive sources (the store's per-key reads,
  renderer thunk parts) register with the running effect through it.

Tests are the spec: `signals.test.js` (node).
