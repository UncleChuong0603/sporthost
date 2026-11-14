import type { Metadata } from "next";
import { siteTitle, siteDescription, socialMetadata } from "@/lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = {
  ...socialMetadata,
  metadataBase: new URL("https://sporthost.online"),
  title: { default: siteTitle, template: "%s · SportHost" },
  description: siteDescription,
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:p-3">Đến nội dung chính</a>{children}</body></html>;
}
