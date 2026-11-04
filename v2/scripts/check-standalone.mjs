import { readdir, readFile } from "node:fs/promises";
import { resolve, relative, join } from "node:path";

const root = resolve(".next/standalone");
const problems = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), name = relative(root, path).replaceAll("\\", "/");
    if (entry.name.startsWith(".env") || /(?:^|\/)(?:test-results|playwright-report|__pycache__)(?:\/|$)/.test(name) || /\.(?:pem|key|pfx|py|pyc)$/i.test(entry.name)) problems.push(name);
    if (entry.isDirectory()) await visit(path);
  }
}
await visit(root);
if (problems.length) throw new Error(`Standalone includes forbidden private/test/runtime files: ${problems.slice(0, 10).join(", ")}`);
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (Object.keys(packageJson.dependencies || {}).some(name => /^(?:express|fastapi|@nestjs\/core)$/.test(name))) throw new Error("Separate backend runtime found");
console.log("Standalone artifact has no env files, private keys, test outputs or Python files.");
