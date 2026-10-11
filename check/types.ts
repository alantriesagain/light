/**
 * @bootstrapp/light/check/types.ts: the convention checker's contract. A rule,
 * the project model it reads, the shapes the parsers answer, and what a host
 * of the engine adds to the model.
 */

/** A problem a rule reports; `line`/`col` are resolved from `offset` when absent. */
export interface Finding {
  file: string;
  message: string;
  offset?: number;
  line?: number;
  col?: number;
}

export type Styling = "css" | "tailwind";

export interface RuleApplies<M extends ProjectModel = ProjectModel> {
  styling?: Styling;
  dep?: string;
  when?: (ctx: M) => boolean;
}

export interface Reporter {
  report(finding: Finding): void;
}

/** What a rule's `check` receives: the model plus `report`. */
export type CheckContext<M extends ProjectModel = ProjectModel> = M & Reporter;

export interface CheckRule<M extends ProjectModel = ProjectModel> {
  severity: "error" | "warn";
  description: string;
  why?: string;
  appliesTo?: RuleApplies<M>;
  check: (ctx: CheckContext<M>) => void | Promise<void>;
}

export type ImportKind = "named" | "default" | "side-effect" | "reexport" | "dynamic";
export interface ParsedImport { spec: string; offset: number; kind: ImportKind }

export interface PropertyInfo { name: string; offset: number; hasNonNullDefault: boolean }

export interface ParsedComponent {
  extends: string | null;
  tag: string | null;
  styleTrue: boolean;
  /** False when `style` is present but not a literal, as in a component factory that takes it as a parameter. */
  styleKnown: boolean;
  /** Each `mixins: [...]` entry that is a named import (or a call on one): the module specifier and exported name. */
  mixins: Array<{ spec: string; exported: string }>;
  topLevelKeys: string[];
  keyOffsets: Record<string, number>;
  propertyNames: PropertyInfo[];
  propsOffset: number | null;
  literal: import("typescript").ObjectLiteralExpression;
  sf: import("typescript").SourceFile;
}

export interface View extends Omit<ParsedComponent, "literal" | "sf"> {
  file: string;
  source: string;
  isComponent: boolean;
  literal: import("typescript").ObjectLiteralExpression | null;
  sf: import("typescript").SourceFile | null;
}

export interface Template { content: string; start: number }
export interface ClassAttr { value: string; offset: number; template: boolean }

export type PackageJson = Record<string, any> & {
  name?: string;
  main?: string;
  exports?: Record<string, unknown> | string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  bootstrapp?: Record<string, any>;
};

export interface WalkOptions {
  extensions?: readonly string[];
  recursive?: boolean;
  skipTests?: boolean;
  prune?: (name: string, rel: string) => boolean;
  keep?: (name: string, rel: string) => boolean;
}

/**
 * A `bootstrapp.components` block and the directory its paths are relative
 * to: a prefix names a directory (every file under it is `<prefix>-<path>`)
 * or a record of component name to file (`<prefix>-<name>`). `owner` is the
 * dependency's short name, null for the project itself.
 */
export interface ComponentMap {
  owner: string | null;
  dir: string;
  components: Record<string, string | Record<string, string>>;
}

export interface ComponentIndex {
  has(tag: string): boolean;
  ownerOf(tag: string): string | null;
  sourceOf(tag: string): string | null;
  /** The sources of the fragments a tag lists under `mixins`, resolved from its own file (relative specifiers only). */
  mixinSourcesOf(tag: string): string[];
  propsOf(tag: string): Set<string> | null;
}

/**
 * What a host of the engine adds to the project model: the component maps of
 * the project's dependencies, extra component directories, directories and
 * prefixes the walk leaves out, the hooks and events its plugins give every
 * component, its own notion of a dependency and of the styling engine, and a
 * path prefix the model is restricted to.
 */
export interface HostOptions {
  componentMaps?: (ctx: ProjectModel) => ComponentMap[];
  componentDirs?: (ctx: ProjectModel) => string[];
  extensions?: readonly string[];
  ignore?: { dirs?: Iterable<string>; prefixes?: Iterable<string>; prune?: (name: string, rel: string) => boolean };
  pluginHooks?: Iterable<string>;
  pluginEvents?: Iterable<string>;
  hasDep?: (dep: string, ctx: ProjectModel) => boolean;
  styling?: Styling;
  scope?: string;
}

/** The project model a rule reads. */
export interface ProjectModel {
  projectDir: string;
  pkg: PackageJson;
  config: Record<string, any>;
  deps: Record<string, string>;
  componentDirs: string[];
  styling: Styling;
  /** The lifecycle hooks a host's plugins add to every component. */
  pluginHooks: ReadonlySet<string>;
  /** The events a host's plugins make every component emit. */
  pluginEvents: ReadonlySet<string>;
  hasDep(dep: string): boolean;
  files(): string[];
  read(rel: string): string | null;
  code(rel: string): string | null;
  views(): View[];
  view(rel: string): View;
  componentIndex(): ComponentIndex;
  templates(rel: string): Template[];
  imports(rel: string): ParsedImport[];
  classAttrs(rel: string): ClassAttr[];
  assetFiles(dir: string): string[];
}

/** The model plus what the runners need. */
export type ProjectContext<M extends ProjectModel = ProjectModel> = M & {
  lineAt(rel: string, offset: number): { line: number; col: number };
  invalidate(rel: string): void;
};

export interface RuleEntry<M extends ProjectModel = ProjectModel> { id: string; owner: string; file: string; rule: CheckRule<M> }

export interface ReportedFinding { ruleId: string; severity: "error" | "warn"; file: string; line: number; col: number; message: string }

export interface CatalogEntry {
  id: string;
  owner: string;
  declaredSeverity: string;
  effectiveSeverity: string;
  status: "active" | "off" | "n/a";
  reason?: string;
  description: string;
  why?: string;
}

export interface CheckResult {
  rules: CatalogEntry[];
  findings: ReportedFinding[];
  configWarnings: string[];
  stats: { files: number; rules: number; errors: number; warnings: number; durationMs: number };
}
