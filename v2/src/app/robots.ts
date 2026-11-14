import type { MetadataRoute } from "next";
import { getConfig } from "@/server/config";
import { canonicalOrigin, publicIndexing } from "@/lib/public-pages";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const config = getConfig();
  return publicIndexing(config.APP_ENV, config.origin)
    ? { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/internal/"] }, sitemap: canonicalOrigin + "/sitemap.xml" }
    : { rules: { userAgent: "*", disallow: "/" } };
}
