import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isLegacyPostPath } from "@/server/compatibility/legacy-paths";

// Independent audit inventory is the source of truth, rather than a copy of adapter patterns.
const routes = readFileSync("../docs/nextjs/sprint-0/ROUTE_PARITY.csv", "utf8").trim().split(/\r?\n/).slice(1).map(line => { const [method, path] = line.split(","); return { method, path }; });
const sample = (path: string) => path.replace(/\{([^}]+)\}/g, (_, name) => name === "key" ? "synthetic-legacy-capability-key-1234" : name === "public_id" ? "synthetic-public-id" : name === "action" ? "approve" : "1");
const shape = (path: string) => path.replace(/\{[^}]+\}|\[[^\]]+\]/g, "{}");
function pagePaths(directory = "src/app", prefix = ""): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const segment = entry.name.startsWith("(") ? "" : "/" + entry.name;
    if (entry.isDirectory()) result.push(...pagePaths(join(directory, entry.name), prefix + segment));
    else if (entry.name === "page.tsx" || entry.name === "route.ts") result.push(shape(prefix || "/"));
  }
  return result;
}
describe("audited legacy HTTP contract coverage", () => {
  it.each(routes.filter(route => route.method === "POST" && !["/login", "/signup", "/logout"].includes(route.path)))("routes native POST $path through the compatibility adapter", ({ path }) => {
    expect(isLegacyPostPath(sample(path))).toBe(true);
  });
  it.each(routes.filter(route => route.method === "GET"))("retains the original GET $path", ({ path }) => {
    expect(pagePaths()).toContain(shape(path));
  });
  it("does not reinterpret unrelated or internal paths as a legacy mutation", () => {
    for (const path of ["/internal/legacy", "/internal/legacy-auth", "/api/anything", "/clubs/new", "/games/1/export.csv", "/clubs/1/qr", "/clubs/1/dues/unknown", "/join/a/b/c"]) expect(isLegacyPostPath(path)).toBe(false);
  });
});
