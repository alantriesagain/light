import type { Parser, TypeDefinition, TypeOptions, TypesAPI } from "./types.ts";

declare const T: TypesAPI;
export default T;
export declare const parsers: Record<string, Parser>;
export declare const parse: (value: unknown, prop?: TypeDefinition) => unknown;
export declare const createType: (type: string, options?: TypeOptions | unknown) => TypeDefinition;
export declare const isReactive: (prop: { reactive?: boolean } | undefined) => boolean;
export declare const cloneDefault: (prop: { defaultValue?: unknown } | undefined) => unknown;
export type * from "./types.ts";
