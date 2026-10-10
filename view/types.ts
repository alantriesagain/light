/**
 * @bootstrapp/light: the view engine's public type declarations.
 */

import type { PropertyDeclaration, TypeDefinition } from "../types/types.ts";
import type View from "./index.js";

/** A class's merged property descriptors, every entry normalised. */
export type PropertiesSchema = Record<string, TypeDefinition>;

/** A definition's `properties` block as the author writes it: descriptors, or defaults standing in for them. */
export type PropertyDeclarations = Record<string, PropertyDeclaration>;

/**
 * Map a `properties: { x: T.string(), count: 0 }` block into the TS shape
 * that ends up on `this` inside `render()` / lifecycle hooks (`this.x: string`,
 * `this.count: number`); see `PropertyValue`.
 */
export type PropsToThis<P> = {
  [K in keyof P]: PropertyValue<P[K]>;
};

/**
 * The value type a `properties` entry declares: a descriptor's phantom type;
 * for a default, its widened type (`false` is `boolean`, `0` is `number`,
 * `""` is `string`), an empty array literal as `unknown[]`, `null` as `any`.
 */
export type PropertyValue<V> = V extends TypeDefinition<infer T> ? T
  : V extends boolean ? boolean
  : V extends number ? number
  : V extends string ? string
  : V extends readonly never[] ? unknown[]
  : V extends null | undefined ? any
  : V;

/**
 * What `this` is inside a definition's methods: the reactive properties, own
 * and from mixins; the sibling members declared on the same literal and on
 * the mixins (the definition keys the engine consumes never reach `this`, so
 * a property may share a hook's name); the engine's instance members; the
 * narrowed `$emit`; `_`-prefixed members as `any`; and, with `extends`, any
 * other member as `unknown`, since the base is known only by its tag.
 */
export type ComponentThis<D, M, P, E> = PropsToThis<P & Omit<MixinProps<M>, keyof P>> &
  Omit<D, keyof P | DefinitionKey> &
  MixinMembers<M> &
  Omit<View, "$emit"> &
  { $emit: TypedEmit<E & MixinEvents<M>> } &
  { [k: `_${string}`]: any } &
  (D extends { extends: string } ? Record<string, unknown> : unknown);

/** A component definition as `defineComponent` and `View.define` accept it, `this` typed inside its methods. */
export type Definition<D, M, P, E> = D & { properties?: P; events?: E; mixins?: M } & ThisType<ComponentThis<D, M, P, E>>;

/**
 * Map an `events: { change: T.object(...) }` block into the typed `this.emit`
 * signature using a conditional type: when the literal key is in `E`, the
 * payload narrows to that event's declared shape; otherwise it stays
 * `unknown` (matching the existing loose form so undeclared events keep
 * working).
 *
 * The single signature with a conditional `payload` type forces TS to
 * narrow per-call based on the literal key, instead of falling through
 * overloads to a permissive variant.
 *
 *   events: { change: T.object(...), reset: T.any() }
 *   → this.$emit("change", payload)   // payload: Record<string,unknown>
 *   → this.$emit("change", "wrong")   // ERROR
 *   → this.$emit("undeclared", ...)   // payload: unknown (loose)
 */
export type TypedEmit<E> = <K extends string>(
  key: K,
  payload?: K extends keyof E
    ? E[K] extends TypeDefinition<infer V> ? V : unknown
    : unknown,
) => CustomEvent;

/** Method-style so the parameter compares bivariantly: a delegated listener may declare the DOM event it receives. */
interface ViewEventListenerSignature {
  handle(payload: unknown): void;
}

/**
 * What `View.$on` calls back with: the CustomEvent's `detail`, or, for a
 * delegated `selector#eventType` subscription, the DOM `Event` itself.
 */
export type ViewEventListener = ViewEventListenerSignature["handle"];

/** Method-style so the parameter compares bivariantly: a hook may declare just the part of the detail it reads. */
interface LifecycleHookSignature {
  handle(detail: LifecycleEventDetail): void | Promise<void>;
}

export type LifecycleHook = LifecycleHookSignature["handle"];

/** What `configureView` hands the engine. */
export interface ViewConfig {
  /** Called when an element's update is scheduled; answers what to call once it ran. */
  track: (label: string) => (() => void) | void;
  /** Receives every async lifecycle hook and plugin init. */
  wrap: (work: Promise<unknown>, label: string) => void;
  /** Resolves when a served region the client cannot adopt may be rendered over. */
  settle: (() => Promise<unknown>) | undefined;
  /** The host's text for a key, or undefined when it has none. */
  translate: (key: string, params?: Record<string, unknown>) => string | undefined;
  /** Diagnostics such as a slot no render provides. */
  dev: boolean;
}

export interface LifecycleEventDetail {
  instance: View;
  component: ViewConstructor;
  tag?: string;
  changedProps?: Map<string, unknown>;
}

/** What `willUpdate`, `firstUpdated` and `updated` receive: the render engine always hands them the changed props. */
export interface UpdateEventDetail extends LifecycleEventDetail {
  changedProps: Map<string, unknown>;
}

/** Method-style so the parameter compares bivariantly: an update hook may declare just `{ changedProps }`. */
interface UpdateHookSignature {
  handle(detail: UpdateEventDetail): void | Promise<void>;
}

export type UpdateHook = UpdateHookSignature["handle"];

export interface ViewPluginEvents {
  connected?: LifecycleHook;
  disconnected?: LifecycleHook;
  willUpdate?: UpdateHook;
  firstUpdated?: UpdateHook;
  updated?: UpdateHook;
  [hook: string]: LifecycleHook | UpdateHook | undefined;
}

export interface ViewPlugin {
  name: string;
  /** Definition keys the plugin reads, which never land on the element. */
  keys?: string[];
  /** Lifecycle hooks the plugin adds: chained across mixins and `extends`, run through `$runHook`. */
  hooks?: string[];
  /** Rewrites a class's merged property declarations when the class is built. */
  properties?: (properties: PropertiesSchema, definition: ComponentDefinition) => PropertiesSchema | void;
  events?: ViewPluginEvents;
  test?: (ctx: { component: ViewConstructor; definition: ComponentDefinition }) => boolean;
  init?: (ctx: {
    View: typeof View;
    component: ViewConstructor;
    definition: ComponentDefinition;
    tag: string;
  }) => void | Promise<void>;
}

export interface ComponentDefinition {
  tag?: string;
  extends?: string;
  /**
   * Definition fragments merged under this one, in order: their properties,
   * events and members union, the component wins a collision, lifecycle
   * hooks chain mixin-first. A fragment may carry `mixins` of its own.
   */
  mixins?: readonly MixinDefinition[];
  properties?: PropertyDeclarations;
  /**
   * Optional declaration of events this component emits. Each entry maps
   * an event name to a `T.*()` factory describing the payload shape. Used
   * by `defineComponent()` to narrow `this.$emit("name", payload)` so the
   * payload matches the declared shape; downstream, the components
   * generator can emit typed `@name` handlers for consumers.
   *
   *   events: {
   *     "change": T.object({ value: T.string() }),
   *     "reset":  T.any(),
   *   }
   *
   * Purely metadata at runtime; the framework never reads this field.
   * Components that don't declare it keep the loose `(key: string, data?: unknown)`
   * emit signature.
   */
  events?: PropertiesSchema;
  /** Icon names the component renders from non-literal sites (a variant map); read by the build scanner and the icon check rules. */
  icons?: string[];
  formAssociated?: boolean;
  style?: boolean;
  connected?: LifecycleHook;
  disconnected?: LifecycleHook;
  willUpdate?: UpdateHook;
  firstUpdated?: UpdateHook;
  updated?: UpdateHook;
  class?: string;
  role?: string;
  /**
   * The theme tokens this component draws with, by category, so a page's
   * theme collector can gather what its descriptors need.
   */
  themeTokens?: Record<string, string[]>;
  render?: () => unknown;
}

/**
 * The definition keys the engine consumes (`tag`, `properties`, the lifecycle
 * hooks, `render`, ...). None of them lands on the element, so `this` inside
 * a definition omits them and a property may share a hook's name.
 */
export type DefinitionKey = keyof ComponentDefinition;

/** A definition fragment: any subset of a component definition plus members. */
export type MixinDefinition = Partial<ComponentDefinition> & Record<string, unknown>;

import type { MixinEvents, MixinProps } from "./primitives.ts";

export type { MixinProps, MixinEvents, UnionToIntersection } from "./primitives.ts";

/** The members (methods and plain fields) every mixin in `M` contributes, minus the definition keys the view engine consumes. */
export type MixinMembers<M> = import("./primitives.ts").MixinMembers<M, DefinitionKey>;

export interface ComponentEntry {
  _constructor?: ViewConstructor;
  definition?: ComponentDefinition;
  path?: string;
  loadPromise?: Promise<ViewConstructor | null>;
}

/**
 * `View`'s `this.constructor` carries framework-added statics that
 * regular `Function` typing doesn't expose. `ViewConstructor` is what
 * `this.$ctor` returns.
 */
export type ViewConstructor = typeof View & {
  icons?: string[];
  formAssociated?: boolean;
  style?: boolean;
  tag?: string;
  _storeDefs?: Record<string, { default: () => unknown }>;
  _klass?: string;
  _role?: string;
  _classTags?: string[];
  _hooks?: Record<string, LifecycleHook | undefined>;
  _hookLists?: Map<string, LifecycleHook[]> | null;
};

/** Re-export runtime types from the JS entry so the bare `@bootstrapp/light` specifier surfaces both the type-only declarations above and the JSDoc-inferred types of runtime exports (`import type View from "@bootstrapp/light"`). */
export * from "./index.js";
export { default } from "./index.js";
