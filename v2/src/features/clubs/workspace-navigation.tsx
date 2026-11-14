"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ContactRound, LayoutDashboard, UserRound, UsersRound, Wallet } from "lucide-react";
import { useWorkspaceClub } from "./workspace-scope";

const links = [
  { href: "/dashboard", name: "Tổng quan", Icon: LayoutDashboard },
  { href: "/schedule", name: "Lịch chơi", Icon: CalendarDays },
  { href: "/members", name: "Thành viên", Icon: ContactRound },
  { href: "/finance", name: "Thu chi", Icon: Wallet },
  { href: "/clubs", name: "CLB", desktopName: "Câu lạc bộ", Icon: UsersRound },
  { href: "/account", name: "Tài khoản", Icon: UserRound },
];

export function WorkspaceNavigation({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  const search = useSearchParams();
  const scopedClub = useWorkspaceClub();
  const candidate = path.match(/^\/clubs\/([1-9]\d*)(?:\/|$)/)?.[1] || search.get("club_id") || (path.startsWith("/games/") && scopedClub ? String(scopedClub) : null);
  const clubId = candidate && /^[1-9]\d*$/.test(candidate) && Number(candidate) <= 2147483647 ? candidate : null;
  const section = /^\/games\/\d+\/billing(?:\/|$)/.test(path) || path.startsWith("/payments/") ? "/finance" : path.startsWith("/games/") ? "/schedule" : path;
  return <nav aria-label="Điều hướng chính" className={mobile
    ? "fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-white px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
    : "mt-10 flex flex-col gap-2"}>
    {links.filter(link => !mobile || link.href !== "/account").map(({ href, name, desktopName, Icon }) => {
      const active = section === href || section.startsWith(href + "/");
      const destination = clubId && ["/schedule", "/members", "/finance"].includes(href) ? `${href}?club_id=${clubId}` : href;
      return <Link key={href} href={destination} aria-current={active ? "page" : undefined} className={mobile
        ? `flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold active:bg-muted ${active ? "bg-teal-50 text-primary" : "text-muted-foreground hover:bg-muted"}`
        : `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10 ${active ? "bg-white/10 text-teal-200" : "text-slate-100"}`}>
        <Icon className="size-5 shrink-0" aria-hidden="true" />{mobile ? name : desktopName || name}
      </Link>;
    })}
  </nav>;
}
