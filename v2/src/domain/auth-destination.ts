// Narrow allowlist: caller-provided destinations can never leave the app.
export function authDestination(raw: unknown, fallback: "/me" | "/dashboard" = "/me") {
  return typeof raw === "string" && /^\/me\/connect\/[A-Za-z0-9_-]{32}$/.test(raw) ? raw : raw === "/dashboard" || raw === "/me" ? raw : fallback;
}
