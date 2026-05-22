/**
 * @typedef {Object} WorkspaceContext
 * @property {"workspace" | "normal"} kind
 * @property {string} [root]
 * @property {string} [friendlyRoot]
 */

/**
 * Build the workspace-awareness block appended to every adapter's system prompt.
 *
 * "workspace" — the IDE has bound gaiteway's CWD as its filesystem backing.
 * Agent and user are looking at the same physical folder; agent should act
 * directly on it.
 *
 * "normal" — generic chat. Filesystem tools still target gaiteway's CWD
 * (that's the process they run in), but the user isn't necessarily working
 * there in the IDE.
 *
 * @param {WorkspaceContext | undefined | null} ctx
 * @returns {string}
 */
export const buildWorkspacePrompt = (ctx) => {
  if (!ctx || ctx.kind === "normal")
    return [
      "<session-kind>normal</session-kind>",
      "You are running in a normal chat session — no IDE workspace is bound to this agent.",
      "Your filesystem and shell tools target the process working directory, which the user is not necessarily viewing in their IDE.",
      "Confirm paths before reading or writing files. Don't assume the user wants you to act on the local filesystem unless they say so.",
    ].join("\n");

  const root = ctx.root || "(unknown)";
  const friendly = ctx.friendlyRoot && ctx.friendlyRoot !== root ? ` (${ctx.friendlyRoot})` : "";

  return [
    "<session-kind>workspace</session-kind>",
    "",
    `WORKSPACE ROOT: ${root}${friendly}`,
    "",
    "You are running in a workspace-aware session. The user has bound this folder as their IDE workspace —",
    "they see the same files in their editor that you see on disk. Any file you read, write, or change is",
    "visible to them immediately.",
    "",
    "You have direct filesystem and shell access here via your native Read, Write, Edit, Bash, Glob, and Grep",
    "tools. Default to acting on the workspace: explore it, run commands in it, edit files in it.",
    "Don't ask the user where files live or whether you may list a directory — the workspace root above is",
    "authoritative for relative paths, and routine read/list operations don't require permission.",
    "",
    "Treat work as scoped to this workspace unless the user explicitly says otherwise.",
  ].join("\n");
};

/**
 * Combine a user-supplied custom prompt with the workspace block. Either can
 * be missing; the result is undefined if both are empty.
 *
 * @param {string | undefined | null} customPrompt
 * @param {WorkspaceContext | undefined | null} ctx
 * @returns {string | undefined}
 */
export const composeSystemPrompt = (customPrompt, ctx) => {
  const workspaceBlock = buildWorkspacePrompt(ctx);
  const parts = [];
  if (customPrompt) parts.push(customPrompt);
  if (workspaceBlock) parts.push(workspaceBlock);
  return parts.length ? parts.join("\n\n") : undefined;
};

export default { buildWorkspacePrompt, composeSystemPrompt };
