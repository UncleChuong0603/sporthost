import "server-only";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { getConfig } from "./config";
export async function validateStartup() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const config = getConfig();
  if (config.deployed) {
    try { if (!(await stat(/* turbopackIgnore: true */ config.STORAGE_ROOT!)).isDirectory()) throw Error(); await access(config.STORAGE_ROOT!, constants.R_OK | constants.W_OK); }
    catch { throw new Error("Persistent upload volume is not mounted or writable by the application user"); }
  }
}
