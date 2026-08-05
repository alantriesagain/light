/* ─────────── ACP content + updates ─────────── */

type TextBlock = { type: "text"; text: string };
type ImageBlock = { type: "image"; data: string; mimeType: string };
type ContentBlock = TextBlock | ImageBlock;

type ToolCallContentBlock = {
  type: "content";
  content: ContentBlock;
  isError?: boolean;
};

type SessionUpdate =
  | { sessionUpdate: "agent_message_chunk"; content: ContentBlock }
  | { sessionUpdate: "user_message_chunk"; content: ContentBlock }
  | { sessionUpdate: "agent_thought_chunk"; content: ContentBlock }
  | {
      sessionUpdate: "tool_call";
      toolCallId: string;
      title: string;
      kind: string;
      status: string;
      rawInput?: unknown;
      content: ToolCallContentBlock[];
    }
  | {
      sessionUpdate: "tool_call_update";
      toolCallId: string;
      status?: string;
      content?: ToolCallContentBlock[];
      rawOutput?: unknown;
    };

type StopReason = "end_turn" | "max_tokens" | "refusal" | "cancelled";

/* ─────────── Adapter contract ─────────── */

type PermissionOption = { optionId: string; name: string; kind: string };

type PermissionRequest = {
  toolCall: {
    toolCallId: string;
    title: string;
    kind: string;
    rawInput: unknown;
  };
  options: PermissionOption[];
};

type PermissionOutcome = {
  outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" };
};

type AdapterContext = {
  requestPermission?: (req: PermissionRequest) => Promise<PermissionOutcome>;
};

type Model = { id: string; name: string; modelId?: string };

// Union of adapter-specific session shapes. The router holds these opaquely
// (typed as `any` in callbacks below) and only the adapter that created a
// session knows its concrete shape. Returning `Session` from `createSession`
// keeps `router.createSession()` strongly typed.
type Session = ClaudeCliSession | ClaudeSdkSession | AcpSession | CodexSession;

type AdapterContract = {
  name: string;
  displayName: string;
  models: Model[];
  createSession: (options: CreateSessionOptions) => Promise<Session>;
  // `session: any` is intentional — the contract is opaque on input; each
  // adapter narrows internally. Tightening to a union breaks contravariance
  // (an adapter expecting `ClaudeCliSession` can't accept `AcpSession`).
  send: (
    session: any,
    prompt: ContentBlock[] | string,
    context: AdapterContext,
  ) => AsyncGenerator<SessionUpdate, StopReason, void>;
  cancel?: (session: any) => Promise<void>;
  close?: (session: any) => Promise<void>;
  attachWebSocket?: (session: any, ws: import("ws").WebSocket) => void;
  initialize?: () => Promise<void>;
  getMcpStatus?: (session: any) => Promise<{ servers: unknown[] }>;
};

type AdapterFactoryOptions = {
  bridgeHost?: string;
  bridgePort?: number;
  defaultModel?: string | null;
  mcpServersConfig?: Record<string, McpServerConfig>;
  allTools?: McpToolEntry[];
};

type AdapterFactory = (opts?: AdapterFactoryOptions) => AdapterContract;

type WorkspaceContext = {
  kind: "workspace" | "normal";
  root?: string;
  friendlyRoot?: string;
};

type CreateSessionOptions = {
  model?: string;
  customPrompt?: string;
  mcpConfig?: {
    tools?: Record<string, boolean>;
    servers?: Record<string, McpServerConfig>;
  };
  mcpServers?: NamedMcpServerConfig[];
  claudeSessionId?: string;
  workspaceContext?: WorkspaceContext;
};

/* ─────────── Sessions ─────────── */

type ClaudeCliSession = {
  id: string;
  proc: import("child_process").ChildProcess;
  ws: import("ws").WebSocket | null;
  outboundQueue: string[];
  inboundQueue: unknown[];
  inboundWaiter: ((msg: unknown) => void) | null;
  claudeSessionId: string | null;
  isStreaming: boolean;
  mcpConfig?: CreateSessionOptions["mcpConfig"];
  customPrompt?: string;
  workspaceContext?: WorkspaceContext;
  model?: string;
};

type ClaudeSdkSession = {
  id: string;
  model: string;
  customPrompt?: string;
  workspaceContext?: WorkspaceContext;
  mcpConfig?: CreateSessionOptions["mcpConfig"];
  sdkSessionId: string | null;
  queryInstance: {
    abort?: () => void;
    mcpServerStatus?: () => Promise<unknown[]>;
  } | null;
  isStreaming: boolean;
};

type AcpSession = {
  id: string;
  proc: import("child_process").ChildProcess;
  stream: JsonRpcStream;
  acpSessionId: string;
  model: string;
  isStreaming: boolean;
};

type JsonRpcStream = {
  request: (method: string, params: unknown) => Promise<unknown>;
  notify: (method: string, params: unknown) => Promise<void>;
  reply: (id: number, result: unknown) => Promise<void>;
  replyError: (id: number, code: number, message: string) => Promise<void>;
  nextInbound: () => Promise<{ msg: unknown } | null>;
};

type CodexSession = {
  id: string;
  model: string;
  customPrompt?: string;
  workspaceContext?: WorkspaceContext;
  mcpConfig?: CreateSessionOptions["mcpConfig"];
  messages: Array<{ role: string; content: string }>;
  isStreaming: boolean;
  abortController: AbortController | null;
};

/* ─────────── MCP ─────────── */

type McpServerConfig = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  serverPath?: string;
  path?: string;
  url?: string;
};

type NamedMcpServerConfig = McpServerConfig & {
  name: string;
  tools?: Array<string | { name: string; description?: string }>;
  resources?: Array<string | { uri: string; description?: string }>;
};

type McpCapabilities = {
  tools?: { listChanged?: boolean };
  resources?: { listChanged?: boolean; subscribe?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: object;
  completions?: object;
  experimental?: Record<string, object>;
  [k: string]: unknown;
};

type McpRawTool = {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
};

type McpRawResource = {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
};

type McpRawPrompt = {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
};

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  description?: string;
  enum?: unknown[];
  [k: string]: unknown;
};

type McpServerEntry = {
  name: string;
  config: McpServerConfig;
  status: "connecting" | "connected" | "disconnected" | "error";
  lastError: string | null;
  capabilities: McpCapabilities | null;
  tools: McpRawTool[];
  resources: McpRawResource[];
  prompts: McpRawPrompt[];
};

type McpToolEntry = {
  server: string;
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  fullName: string;
};

type McpResourceEntry = {
  server: string;
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
};

type McpPromptEntry = {
  server: string;
  name: string;
  description?: string;
  arguments?: McpRawPrompt["arguments"];
  fullName: string;
};

type McpToolResult = {
  content:
    | ToolCallContentBlock[]
    | Array<{ type: string; text?: string; [k: string]: unknown }>;
  isError?: boolean;
  structuredContent?: unknown;
};

type McpResourceContent = {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
};

type McpPromptResult = {
  messages: Array<{
    role: "user" | "assistant";
    content: ContentBlock;
  }>;
};

type McpHostEvent =
  | { type: "server:connected"; name: string }
  | { type: "server:disconnected"; name: string }
  | { type: "server:removed"; name: string }
  | { type: "server:refreshed"; name: string }
  | { type: "server:error"; name: string; error: string }
  | { type: "server:notification"; name: string; notification: unknown };

type McpHost = {
  subscribe: (cb: (event: McpHostEvent) => void) => () => void;
  list: () => Array<{
    name: string;
    status: McpServerEntry["status"];
    lastError: string | null;
    capabilities: McpCapabilities | null;
    config: McpServerConfig;
  }>;
  get: (
    name: string,
  ) => Pick<
    McpServerEntry,
    "name" | "status" | "lastError" | "capabilities" | "config"
  > | null;
  listAllTools: () => McpToolEntry[];
  listAllResources: () => McpResourceEntry[];
  listAllPrompts: () => McpPromptEntry[];
  connect: (name: string, config: McpServerConfig) => Promise<McpServerEntry>;
  registerNative: (
    name: string,
    def: { tools: unknown[]; invoke: (toolName: string, args: unknown) => unknown },
  ) => void;
  disconnect: (name: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
  refresh: (name: string) => Promise<void>;
  invokeTool: (fullName: string, args: unknown) => Promise<McpToolResult>;
  readResource: (uri: string) => Promise<McpResourceContent>;
  renderPrompt: (fullName: string, args: unknown) => Promise<McpPromptResult>;
};

type McpRegistry = {
  getServers: () => Map<string, NamedMcpServerConfig>;
  register: (name: string, server: NamedMcpServerConfig) => void;
  discover: (configs: NamedMcpServerConfig[]) => Promise<void>;
  getTools: () => McpToolEntry[];
  getResources: () => McpResourceEntry[];
  stdioConfig: () => Record<
    string,
    { command: string; args: string[]; env: Record<string, string> }
  >;
};

/* ─────────── Config + bridge ─────────── */

type Config = {
  port: number;
  host: string;
  adapters: string[];
  defaultModel: string | null;
  mcpServers: NamedMcpServerConfig[];
  _dir?: string;
  _file?: string;
  _exists?: boolean;
};

type BridgeServer = {
  server: import("http").Server;
  mcpHost: McpHost;
  start: () => Promise<{ port: number; host: string }>;
  stop: () => Promise<void>;
};

type RequestContext = {
  req: import("http").IncomingMessage;
  res: import("http").ServerResponse;
  url: URL;
  method: string;
  pathname: string;
  mcp: McpRegistry;
  mcpHost: McpHost;
  cfg: Config;
  log: (msg: string) => void;
  defaultModel: string | null;
  cors: Record<string, string>;
};

/* ─────────── External module stubs (optional peer deps) ─────────── */

declare module "@anthropic-ai/claude-agent-sdk" {
  export const query: any;
  const _default: any;
  export default _default;
}

declare module "openai" {
  const OpenAI: any;
  export default OpenAI;
}

declare module "@google/generative-ai" {
  const _default: any;
  export default _default;
}
