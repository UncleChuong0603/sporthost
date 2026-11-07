import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, LogOut, ArrowUpRight } from "lucide-react";
import { WorkspaceNavigation } from "@/features/shared/workspace-navigation";
import { currentHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const host = await currentHost();
  if (!host) redirect("/login");
  const csrf = makeCsrf(await sessionCookie());
  return <div className="min-h-dvh lg:pl-64">
    <aside className="bg-sidebar text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:overflow-y-auto lg:p-5">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 lg:border-0 lg:p-2"><Link href="/dashboard" aria-label="SportHost" className="flex min-h-11 items-center gap-3 text-xl font-bold"><span className="flex size-10 items-center justify-center rounded-xl bg-primary"><Activity className="size-6" aria-hidden="true" /></span><span>SportHost<span className="block text-[10px] font-medium uppercase tracking-[.16em] text-slate-300">Không gian của host</span></span></Link><form action={logout} className="lg:hidden"><input type="hidden" name="csrf" value={csrf} /><Button variant="ghost" size="icon" className="text-white hover:bg-white/10" aria-label="Đăng xuất"><LogOut /></Button></form></div>
      <WorkspaceNavigation admin={host.isPlatformAdmin} />
      <div className="hidden lg:mt-auto lg:block"><p className="mb-3 truncate text-xs text-slate-300">{host.email}</p><form action={logout}><input type="hidden" name="csrf" value={csrf} /><button className="flex min-h-11 items-center gap-3 text-sm text-slate-100 hover:text-white"><LogOut className="size-4" aria-hidden="true" />Đăng xuất</button></form></div>
    </aside>
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 border-b bg-white px-4 sm:px-8"><p className="text-xs font-medium text-muted-foreground sm:text-sm">Quản lý CLB · Giờ Việt Nam (UTC+7)</p><Link href="/me" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Chế độ người chơi<ArrowUpRight className="size-4" aria-hidden="true" /></Link></header>
    <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-5 py-7 outline-none sm:px-8 sm:py-9">{children}</main>
  </div>;
}
