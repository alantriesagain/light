/**
 * Built-in "app" MCP server: drives the connected Bootstrapp app over the /app
 * control channel. Registered natively at startup (no subprocess, no config),
 * so any bridged agent can operate a live app tab out of the box. Each tool is
 * a thin wrapper over `appHub.command(name, args)`.
 */

const str = (description) => ({ type: "string", description });

const CAPABILITY = {
  type: "string",
  enum: ["image", "image-edit", "video", "tts"],
  description: "Media capability to generate",
};

export const APP_TOOLS = [
  {
    name: "app_status",
    description: "Whether a live Bootstrapp app tab is connected to the control channel.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "app_generate_media",
    description: "Generate media in the live app; the result imports into its media library. Omit model to use the capability default.",
    inputSchema: {
      type: "object",
      properties: {
        capability: CAPABILITY,
        prompt: str("What to generate (or the text to speak for tts)"),
        model: str("Model id; omit for the capability default"),
        options: { type: "object", description: "Model options (e.g. aspect_ratio, duration, voice)" },
        sourceHash: str("Library hash of the input image for image-edit / video i2v"),
      },
      required: ["capability", "prompt"],
    },
  },
  {
    name: "app_list_media_models",
    description: "List media-generation models available for a capability.",
    inputSchema: { type: "object", properties: { capability: CAPABILITY }, required: ["capability"] },
  },
  {
    name: "app_open_resource",
    description: "Open a resource URI in the live app (e.g. creators://library, creators://project/<slug>).",
    inputSchema: { type: "object", properties: { uri: str("Resource URI") }, required: ["uri"] },
  },
  {
    name: "app_open_generate_modal",
    description: "Open the Generate modal in the live app so the user sees it.",
    inputSchema: {
      type: "object",
      properties: {
        tab: { type: "string", enum: ["video", "image", "speech"], description: "Which tab to open" },
        inputHash: str("Library hash of an image to preload"),
      },
    },
  },
  {
    name: "app_list_library",
    description: "List the live app's media library assets (hash, kind, title, uri).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "app_workspace_info",
    description: "The live app's filesystem backing (directory/virtual/gaiteway), workspace root path, and active resource.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "app_list_files",
    description: "List files/folders in the live app's open workspace.",
    inputSchema: {
      type: "object",
      properties: {
        uri: str("Folder URI, default file:/// (workspace root)"),
        depth: { type: "number", description: "How many levels to expand (default 1)" },
      },
    },
  },
  {
    name: "app_read_file",
    description: "Read a text file from the live app's open workspace.",
    inputSchema: {
      type: "object",
      properties: { uri: str("File URI, e.g. file:///notes/todo.md"), max: { type: "number" } },
      required: ["uri"],
    },
  },
  {
    name: "app_command",
    description: "Invoke any registered app-control command by name with raw args (escape hatch).",
    inputSchema: {
      type: "object",
      properties: { name: str("Command name"), args: { type: "object" } },
      required: ["name"],
    },
  },
];

const TOOL_TO_COMMAND = {
  app_generate_media: "generateMedia",
  app_list_media_models: "listMediaModels",
  app_open_resource: "openResource",
  app_open_generate_modal: "openGenerateModal",
  app_list_library: "listLibrary",
  app_workspace_info: "workspaceInfo",
  app_list_files: "listFiles",
  app_read_file: "readFile",
};

const content = (data) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

/**
 * @param {{ appHub: any }} deps
 * @returns {{ tools: any[], invoke: (tool: string, args: any) => Promise<any> }}
 */
export const createAppTools = ({ appHub }) => ({
  tools: APP_TOOLS,
  async invoke(tool, args = {}) {
    if (tool === "app_status") return content({ connected: !!appHub?.connected?.() });
    if (!appHub?.connected?.())
      return content({ error: "no app connected — open the Bootstrapp app in a browser tab (dev mode)" });

    try {
      if (tool === "app_command") return content(await appHub.command(args.name, args.args || {}));
      const command = TOOL_TO_COMMAND[tool];
      if (!command) return content({ error: `unknown tool: ${tool}` });
      return content(await appHub.command(command, args));
    } catch (e) {
      return content({ error: e.message });
    }
  },
});
