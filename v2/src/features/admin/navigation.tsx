"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserRoundCog,
  Building2,
  CalendarDays,
  CreditCard,
  ScrollText,
} from "lucide-react";
export const adminNav = [
  ["/admin", "Tổng quan", LayoutDashboard],
  ["/admin/users", "Người dùng", Users],
  ["/admin/hosts", "Host", UserRoundCog],
  ["/admin/clubs", "Câu lạc bộ", Building2],
  ["/admin/sessions", "Buổi chơi", CalendarDays],
  ["/admin/subscriptions", "Gói đăng ký", CreditCard],
  ["/admin/audit-logs", "Nhật ký quản trị", ScrollText],
] as const;
export function AdminNavigation({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  return (
    <nav aria-label="Quản trị" className="space-y-1">
      {adminNav.map(([href, label, Icon]) => {
        const active =
          href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${active ? "bg-primary text-white" : mobile ? "hover:bg-muted" : "text-slate-200 hover:bg-white/10"}`}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
