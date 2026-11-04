import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "SportHost", template: "%s · SportHost" }, description: "Quản lý câu lạc bộ, lịch chơi và thu chi thể thao.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:p-3">Đến nội dung chính</a>{children}</body></html>;
}
