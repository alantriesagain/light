const SUBCOMMANDS = {
  adapters: () => import("./commands/adapters.js"),
  mcp: () => import("./commands/mcp.js"),
  sessions: () => import("./commands/sessions.js"),
  config: () => import("./commands/config.js"),
  health: () => import("./commands/health.js"),
};

const USAGE = `gaiteway [options]                       start the server (default)
gaiteway --stdio                       run as ACP server over stdin/stdout
gaiteway --port <n> --host <h>         bind options
gaiteway --config <dir>                use a specific config directory

Management:
  gaiteway adapters list|add|remove
  gaiteway mcp list|add|remove|inspect
  gaiteway sessions list|show|kill
  gaiteway config init|get|set|path
  gaiteway health [--url URL]

See gaiteway <command> --help for command-specific options.
`;

export const run = async (argv) => {
  const [first, ...rest] = argv;

  if (first === "--help" || first === "-h") {
    process.stdout.write(USAGE);
    return;
  }

  if (first && SUBCOMMANDS[first]) {
    const mod = await SUBCOMMANDS[first]();
    await mod.default(rest);
    return;
  }

  const mod = await import("./commands/server.js");
  await mod.default(argv);
};
