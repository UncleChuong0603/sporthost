"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, CalendarDays, Wallet, UserRound } from "lucide-react";
const items = [
  { href: "/me", label: "Trang chủ", Icon: House },
  { href: "/me/schedule", label: "Lịch của tôi", Icon: CalendarDays },
  { href: "/me/payments", label: "Thanh toán", Icon: Wallet },
  { href: "/me/profile", label: "Hồ sơ", Icon: UserRound },
];
export function MemberNavigation() {
  const path = usePathname();
  return <nav aria-label="Điều hướng người chơi" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-white px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 sm:static sm:mx-auto sm:mb-0 sm:max-w-5xl sm:gap-2 sm:rounded-2xl sm:border sm:p-2">
    {items.map(({ href, label, Icon }) => {
      const active = path === href || (href === "/me/schedule" && path.startsWith("/me/bookings/")) || (href === "/me/payments" && path.startsWith("/me/dues/"));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-colors sm:flex-row sm:gap-3 sm:text-sm ${active ? "bg-teal-50 text-primary" : "text-muted-foreground hover:bg-muted"}`}><Icon className="size-5" aria-hidden="true" />{label}</Link>;
    })}
  </nav>;
}
