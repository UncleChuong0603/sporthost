import "server-only";
import type { Metadata } from "next";
import { getConfig } from "./config";
import { canonicalOrigin, publicIndexing } from "@/lib/public-pages";
import { socialMetadata } from "@/lib/site-metadata";

export function publicMetadata(path: string, title: string, description: string): Metadata {
  const config = getConfig();
  const index = publicIndexing(config.APP_ENV, config.origin);
  const url = canonicalOrigin + path;
  return {
    title: { absolute: title }, description, alternates: { canonical: url },
    robots: { index, follow: index },
    openGraph: { ...socialMetadata.openGraph, title, description, url },
    twitter: { ...socialMetadata.twitter, title, description },
  };
}
