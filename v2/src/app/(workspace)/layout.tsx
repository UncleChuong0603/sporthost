import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, LayoutDashboard, LogOut, UsersRound, ContactRound, UserRound, CalendarDays, Wallet } from "lucide-react";
import { currentHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const host = await currentHost();
  if (!host) redirect("/login");
  const csrf = makeCsrf(await sessionCookie());
  const links = [
    { href: "/dashboard", name: "Tổng quan", Icon: LayoutDashboard },
    { href: "/clubs", name: "Câu lạc bộ", Icon: UsersRound },
    { href: "/schedule", name: "Lịch chơi", Icon: CalendarDays },
    { href: "/members", name: "Thành viên", Icon: ContactRound },
    { href: "/finance", name: "Thu chi", Icon: Wallet },
    { href: "/account", name: "Tài khoản", Icon: UserRound },
  ];
  return <div className="min-h-dvh lg:pl-62">
    <aside className="flex bg-[#142d35] px-4 py-4 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-62 lg:flex-col lg:p-6">
      <Link href="/dashboard" aria-label="SportHost" className="flex min-h-11 items-center gap-3 text-xl font-bold"><Activity className="size-7 text-teal-200" aria-hidden="true" /><span className="hidden lg:inline">SportHost</span></Link>
      <nav aria-label="Điều hướng chính" className="ml-auto flex gap-1 lg:ml-0 lg:mt-10 lg:flex-col lg:gap-2">
        {links.map(({ href, name, Icon }) => <Link key={href} href={href} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-100 hover:bg-white/10"><Icon className="size-5" aria-hidden="true" /><span className="hidden lg:inline">{name}</span><span className="sr-only lg:hidden">{name}</span></Link>)}
      </nav>
      <div className="hidden lg:mt-auto lg:block"><p className="mb-3 truncate text-xs text-slate-300">{host.email}</p><form action={logout}><input type="hidden" name="csrf" value={csrf} /><button className="flex min-h-11 items-center gap-3 text-sm text-slate-100 hover:text-white"><LogOut className="size-4" aria-hidden="true" />Đăng xuất</button></form></div>
    </aside>
    <header className="flex h-18 items-center justify-between border-b bg-white px-5 sm:px-8"><p className="text-sm font-semibold text-muted-foreground">Không gian quản lý CLB</p><form action={logout} className="lg:hidden"><input type="hidden" name="csrf" value={csrf} /><Button variant="ghost" size="icon" aria-label="Đăng xuất"><LogOut /></Button></form><span className="hidden max-w-60 truncate text-sm text-muted-foreground lg:inline">{host.email}</span></header>
    <main id="main" className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
  </div>;
}
