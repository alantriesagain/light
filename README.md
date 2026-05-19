# mestre

One ACP server in front of many agent runtimes. Run it as a stdio process for editors (Zed, Cline), or as an HTTP+WebSocket server for browsers and OpenAI-SDK clients. Adapters cover Claude Code, the Claude Agent SDK, OpenAI/Codex, and any ACP-speaking subprocess.

> Name and npm scope are not final. Wire format and CLI are stable for the 0.3.x line.

## Install

```bash
npm i -g mestre
```

Adapter SDKs are optional peer deps — install only what you use:

```bash
npm i @anthropic-ai/claude-agent-sdk   # for the claude-sdk adapter
npm i openai                            # for the codex adapter
```

The `claude-cli` and `acp` adapters spawn external CLIs and need no peer SDK.

## Usage

Default action is to start the server. No subcommand needed.

```bash
mestre                       # HTTP + WS on :8765
mestre --port 9000 --host 0.0.0.0
mestre --config /path/to/dir # use a specific config directory
mestre --stdio               # ACP server over stdin/stdout (for editors)
```

### Adapter shortcuts

Enable a single adapter inline without editing config:

```bash
mestre --claude              # only claude-cli
mestre --claude-sdk          # only claude-sdk (Node library, no CLI subprocess)
mestre --codex               # only codex
mestre --acp                 # only the generic acp adapter
```

Combinable: `mestre --claude --codex` enables both, ignoring the config's adapter list.

### Origin lock

By default the server accepts any origin (`Access-Control-Allow-Origin: *`). To restrict access to a single origin (CORS + WebSocket upgrade):

```bash
mestre --url https://app.example.com
mestre --claude --url app.example.com   # https:// is assumed if scheme omitted
```

Requests from other origins get `403`. Bare CLI scripts (no `Origin` header) are still allowed — the lock only applies to browser-style requests.

Stop with `Ctrl-C`. Honors `SIGTERM` for supervisors.

### Editor integration (Zed)

In `~/.config/zed/settings.json`:

```json
{
  "agent_servers": {
    "mestre": {
      "type": "custom",
      "command": "mestre",
      "args": ["--stdio"]
    }
  }
}
```

Then start a new agent thread in Zed and pick `mestre`. If `mestre` isn't on Zed's PATH, use the absolute path from `which mestre`.

### From the browser

Connect to `ws://localhost:8765/acp`, send ACP JSON-RPC messages:

```js
const ws = new WebSocket("ws://localhost:8765/acp");
ws.onopen = () => {
  ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1 } }));
  ws.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "session/new", params: {} }));
};
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.method === "session/update") console.log(msg.params.update);
};
```

### From OpenAI-SDK clients

`POST /v1/chat/completions` and `GET /v1/models` are standard. Model is `adapter/model`:

```bash
curl -N http://localhost:8765/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"claude/sonnet","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

`/v1/responses` is not implemented.

## Adapters

| ID | What it wraps | Tools / permissions | Requires |
|---|---|---|---|
| `claude-cli` | `claude` CLI via `--sdk-url` | yes | `claude` on PATH |
| `claude-sdk` | `@anthropic-ai/claude-agent-sdk` library | yes | `npm i @anthropic-ai/claude-agent-sdk`, API key |
| `codex` | OpenAI Chat Completions | no | `npm i openai`, `OPENAI_API_KEY` |
| `acp` | Any ACP-speaking subprocess | yes | a `command` in config |

All adapters emit ACP `SessionUpdate` blocks internally; the WS, stdio, and OpenAI-compat transports consume the same stream.

## ACP wire format

JSON-RPC 2.0. Same shape over `WS /acp` and stdio.

| Direction | Method | Purpose |
|---|---|---|
| Client → Server | `initialize` | capability negotiation |
| Client → Server | `session/new` | create session, returns `sessionId` |
| Client → Server | `session/prompt` | send prompt; resolves with `stopReason` |
| Client → Server | `session/cancel` | interrupt current turn |
| Client → Server | `session/close` | close session |
| Server → Client (notif.) | `session/update` | streaming `SessionUpdate` blocks |
| Server → Client (req.) | `session/request_permission` | tool-use approval |

`SessionUpdate` variants in use: `agent_message_chunk`, `agent_thought_chunk`, `tool_call`, `tool_call_update`, `user_message_chunk`. Content blocks are text-only for now.

## Management REST

Out-of-band introspection — for agents/sessions/health. Never used to run sessions.

```
GET    /health
GET    /agents
GET    /models/:agent
GET    /sessions
DELETE /session/:id
```

`WS /ws/cli/:sessionId` is internal to the `claude-cli` adapter (the spawned `claude` process connects back here). Not a public protocol.

## MCP host

mestre maintains live MCP client connections to every configured MCP server and exposes them uniformly. Both the REST surface (for management UIs) and adapters (for agents) consume the same host.

| Method | Path | Purpose |
|---|---|---|
| GET | `/mcp/servers` | list servers + status + capabilities |
| POST | `/mcp/servers` | add + connect (`{name, command?, args?, env?, url?, path?}`) |
| DELETE | `/mcp/servers/:name` | disconnect + remove |
| POST | `/mcp/servers/:name/connect` | force (re)connect |
| GET | `/mcp/servers/:name/status` | connection state |
| GET | `/mcp/tools` | list tools across all servers (with `inputSchema`, `fullName`) |
| POST | `/mcp/tools/:fullName/invoke` | call a tool: `{arguments: {...}}` → tool result |
| GET | `/mcp/resources` | list resources |
| GET | `/mcp/resources/read?uri=...` | read a resource |
| GET | `/mcp/prompts` | list prompts |
| POST | `/mcp/prompts/:fullName/render` | render a prompt |
| WS | `/mcp/notifications` | live stream of server/tool/resource changes |

`fullName` is `mcp__<server>__<tool>` and disambiguates name collisions across servers.

## Subcommands

```
mestre adapters list | add <name> | remove <name>
mestre mcp list | add <name> <path> | remove <name> | inspect <name>
mestre sessions list | show <id> | kill <id>
mestre config init | get [key] | set <key> <value> | path
mestre health [--url URL]
```

## Configuration

Config is a single JSON file. Lookup order:

1. `--config <dir>` flag
2. `$MESTRE_HOME` env var
3. `./.mestre/` (project-local)
4. `$XDG_CONFIG_HOME/mestre/` (user-global, default `~/.config/mestre/`)

```
.mestre/
├── config.json
└── sessions/<id>.json    # transcript per session
```

`config.json` shape:

```json
{
  "port": 8765,
  "host": "localhost",
  "adapters": ["claude-cli", "codex", "acp"],
  "defaultModel": null,
  "mcpServers": [
    { "name": "demo", "path": "./mcp-server.js" }
  ]
}
```

`mestre config init` creates the default; `mestre config set <key> <value>` patches it.

## Development

```bash
npm test                # all unit + integration tests
npm run test:unit
npm run test:integration
```

No real agents are spawned in the test suite; a fake adapter exercises the full HTTP + ACP-WS surface.

## Status / not yet

- `POST /v1/responses` (OpenAI Responses API translator)
- `claude --acp` once Claude CLI ships it (drops the `--sdk-url` reverse-WS plumbing)
- Codex / gemini adapters route tool calls through `mcp-host` (today only `claude-cli` and `acp` have tool access)
- `session/load` (resume from transcript)
- Image / audio content blocks

## License

[AGPL-3.0-or-later](./LICENSE) © Alan Leal

This project is licensed under the GNU Affero General Public License v3.0 or later. If you run a modified version on a server and let users interact with it over a network, you must make the modified source available to those users.
