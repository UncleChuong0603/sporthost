import type { MetadataRoute } from "next";
import { getConfig } from "@/server/config";
import { canonicalOrigin, publicPages, publicIndexing } from "@/lib/public-pages";
export const dynamic = "force-dynamic";
export default function sitemap(): MetadataRoute.Sitemap {
  const config = getConfig();
  return publicIndexing(config.APP_ENV, config.origin) ? publicPages.map(path => ({ url: canonicalOrigin + path })) : [];
}
