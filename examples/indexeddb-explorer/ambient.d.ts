/**
 * Ambient shim for the CDN specifier `explorer.js` imports.
 * An https URL never resolves to declarations, so the surface the explorer
 * drives is declared here. Must be a `.d.ts` script (no top-level imports or
 * exports): a module file would read this as an unresolvable augmentation.
 */

declare module "https://esm.sh/dexie@4.0.11" {
  /** The `Dexie` surface `explorer.js` drives, typed where the CDN specifier carries no declarations. */
  export default class Dexie {
    constructor(name: string);
    static getDatabaseNames(): Promise<string[]>;
    static delete(name: string): Promise<void>;
    readonly verno: number;
    readonly tables: DexieSchemaTable[];
    version(versionNumber: number): { stores(schema: Record<string, string | null>): void };
    open(): Promise<Dexie>;
    close(): void;
    table(name: string): DexieTable;
  }

  /** One object store, as `db.table(name)` answers it. */
  export interface DexieTable {
    toArray(): Promise<Record<string, unknown>[]>;
    add(record: Record<string, unknown>): Promise<unknown>;
    update(key: unknown, changes: Record<string, unknown>): Promise<number>;
    bulkAdd(records: Record<string, unknown>[]): Promise<unknown>;
    bulkDelete(keys: unknown[]): Promise<void>;
    where(index: string): DexieWhereClause;
  }

  /** The key-range builder `table.where(index)` answers. */
  export interface DexieWhereClause {
    equals(value: unknown): DexieCollection;
    above(value: unknown): DexieCollection;
    below(value: unknown): DexieCollection;
    between(lower: unknown, upper: unknown): DexieCollection;
    startsWith(prefix: string): DexieCollection;
  }

  /** A resolved query. */
  export interface DexieCollection {
    toArray(): Promise<Record<string, unknown>[]>;
  }

  /** One index of a store's schema. */
  export interface DexieSchemaIndex {
    name: string;
    keyPath: string | string[] | null;
    unique: boolean;
    multiEntry: boolean;
    auto: boolean;
  }

  /** One object store, as `db.tables` lists it. */
  export interface DexieSchemaTable {
    name: string;
    schema: { primKey: DexieSchemaIndex; indexes: DexieSchemaIndex[] };
  }
}
