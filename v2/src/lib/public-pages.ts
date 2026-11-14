export const canonicalOrigin = "https://sporthost.online";
export const publicPages = ["/", "/tinh-nang", "/bang-gia"] as const;
export function publicIndexing(environment: string, origin: string) {
  return environment === "production" && origin === canonicalOrigin;
}
export function indexablePath(path: string) {
  return (publicPages as readonly string[]).includes(path);
}
