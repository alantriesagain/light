import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const LIGHT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEFT_OUT = new Set([".bootstrapp", "benchmarks", "dist", "examples", "fixtures", "node_modules", "scripts"]);

/** Where the staged package lands. */
export const DIST = join(LIGHT, "dist");

/** @param {string} dir @returns {string[]} */
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? (LEFT_OUT.has(entry.name) ? [] : walk(join(dir, entry.name))) : [join(dir, entry.name)]);

/**
 * Copy the sources into `dist`, generate their `.d.ts`, and leave the `.js`
 * and `.d.ts` files with a package.json whose exports name the declarations.
 * @returns {{ dir: string, manifest: { name: string, exports: Record<string, string | { types: string, default: string }> } }}
 */
export const stage = () => {
  rmSync(DIST, { recursive: true, force: true });
  const sources = walk(LIGHT).map((file) => relative(LIGHT, file)).filter((file) => /\.(js|ts)$/.test(file) && !file.endsWith(".test.js"));
  const docs = ["README.md", "LICENSE"].filter((file) => existsSync(join(LIGHT, file)));
  for (const file of [...sources, ...docs]) {
    mkdirSync(dirname(join(DIST, file)), { recursive: true });
    cpSync(join(LIGHT, file), join(DIST, file));
  }
  writeFileSync(join(DIST, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      allowJs: true,
      declaration: true,
      emitDeclarationOnly: true,
      allowImportingTsExtensions: true,
      target: "es2024",
      module: "esnext",
      moduleResolution: "bundler",
      lib: ["es2024", "dom", "dom.iterable"],
      strict: true,
      skipLibCheck: true,
    },
    include: ["**/*.js", "**/*.ts"],
    exclude: sources.filter((file) => file.endsWith(".js") && sources.includes(file.replace(/\.js$/, ".d.ts"))),
  }));
  execFileSync(join(LIGHT, "node_modules/.bin/tsc"), ["-p", DIST], { stdio: "inherit" });
  for (const file of walk(DIST))
    if (file.endsWith(".d.ts")) writeFileSync(file, readFileSync(file, "utf8").replace(/(["'])(\.{1,2}\/[^"']+)\.ts\1/g, "$1$2.js$1"));
    else if (file.endsWith(".ts") || relative(DIST, file) === "tsconfig.json") rmSync(file);

  const { bootstrapp: _, scripts: __, devDependencies: ___, ...manifest } = JSON.parse(readFileSync(join(LIGHT, "package.json"), "utf8"));
  manifest.exports = Object.fromEntries(Object.entries(manifest.exports).map(([key, target]) =>
    [key, typeof target === "string" ? target : { ...target, types: target.types.replace(/\.ts$/, ".d.ts") }]));
  writeFileSync(join(DIST, "package.json"), `${JSON.stringify({ ...manifest, files: ["**/*.js", "**/*.d.ts"] }, null, 2)}\n`);
  return { dir: DIST, manifest };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  stage();
  execFileSync("npm", ["pack"], { cwd: DIST, stdio: "inherit" });
}
