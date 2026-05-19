const LOADERS = {
  "claude-cli": () => import("./claude-cli.js"),
  "claude-sdk": () => import("./claude-sdk.js"),
  codex: () => import("./codex.js"),
  acp: () => import("./acp.js"),
};

export class AdapterUnavailableError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "AdapterUnavailableError";
  }
}

const adapters = new Map();

export const listAdapterIds = () => Object.keys(LOADERS);

export const registerAdapter = (adapter) => {
  if (adapters.has(adapter.name)) return null;
  adapters.set(adapter.name, adapter);
  return adapter;
};

export const getAdapter = (id) => adapters.get(id);

export const listAdapters = () =>
  Array.from(adapters.values()).map((a) => ({
    id: a.name,
    name: a.displayName || a.name,
    models: a.models || [],
  }));

export const getDefaultAdapter = () => adapters.values().next().value || null;

export const isAdapterRegistered = (id) => adapters.has(id);

/**
 * @param {{ enabled?: string[], options?: any, log?: (msg: string) => void }} args
 */
export const loadAdapters = async ({ enabled = [], options = {}, log = () => {} }) => {
  const loaded = [];
  for (const id of enabled) {
    const loader = LOADERS[id];
    if (!loader) {
      log(`Adapter "${id}" not found (available: ${listAdapterIds().join(", ")})`);
      continue;
    }

    try {
      const mod = await loader();
      const factory = mod.default;
      if (typeof factory !== "function") {
        log(`Adapter "${id}" has no factory export`);
        continue;
      }

      const instance = factory(options);
      if (instance.initialize) await instance.initialize();

      const claimed = registerAdapter(instance);
      if (claimed) {
        log(`Registered adapter: ${instance.name}${instance.displayName ? ` (${instance.displayName})` : ""}`);
        loaded.push(instance);
      } else
        log(`Adapter "${instance.name}" already registered (skipped duplicate from "${id}")`);
    } catch (e) {
      if (e?.name === "AdapterUnavailableError")
        log(`Adapter "${id}" skipped: ${e.message}`);
      else
        log(`Failed to load adapter "${id}": ${e.message}`);
    }
  }
  return loaded;
};
