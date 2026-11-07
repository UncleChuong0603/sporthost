"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ContactRound, LayoutDashboard, ShieldCheck, UserRound, UsersRound, Wallet } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Tổng quan", Icon: LayoutDashboard },
  { href: "/clubs", label: "Câu lạc bộ", Icon: UsersRound },
  { href: "/schedule", label: "Lịch chơi", Icon: CalendarDays },
  { href: "/members", label: "Thành viên", Icon: ContactRound },
  { href: "/finance", label: "Thu chi", Icon: Wallet },
  { href: "/account", label: "Tài khoản", Icon: UserRound },
];
export function WorkspaceNavigation({ admin = false }: { admin?: boolean }) {
  const path = usePathname();
  return <nav aria-label="Điều hướng chính" className="grid grid-cols-3 gap-1 p-2 lg:mt-8 lg:flex lg:flex-col lg:gap-1.5 lg:p-0">
    {(admin ? [...links, { href: "/admin", label: "Quản trị", Icon: ShieldCheck }] : links).map(({ href, label, Icon }) => {
      const active = path === href || path.startsWith(href + "/") || (href === "/schedule" && path.startsWith("/games/")) || (href === "/finance" && path.startsWith("/payments/"));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold transition-colors sm:text-sm lg:justify-start lg:gap-3 lg:px-4 ${active ? "bg-white/15 text-white ring-1 ring-inset ring-white/15" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}><Icon className={`size-[18px] shrink-0 ${active ? "text-teal-200" : ""}`} aria-hidden="true" /><span>{label}</span></Link>;
    })}
  </nav>;
}
