import { NotificationBell } from "@/features/notifications/bell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, ArrowUpRight, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { currentHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { WorkspaceNavigation } from "@/features/clubs/workspace-navigation";
import { WorkspaceScope } from "@/features/clubs/workspace-scope";
import { OnboardingProvider, OnboardingHelp, OnboardingHome } from "@/features/onboarding/provider";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const host = await currentHost();
  if (!host) redirect("/login");
  const csrf = makeCsrf(await sessionCookie());
  return <WorkspaceScope><OnboardingProvider csrf={csrf}><div className="min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64">
    <aside className="hidden bg-sidebar text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:overflow-y-auto lg:p-5">
      <Link href="/dashboard" aria-label="SportHost" className="flex min-h-11 items-center gap-3 p-2 text-xl font-bold"><span className="flex size-10 items-center justify-center rounded-xl bg-primary"><Activity className="size-6" aria-hidden="true" /></span><span>SportHost<span className="block text-[10px] font-medium uppercase tracking-[.16em] text-slate-300">Không gian của host</span></span></Link>
      <WorkspaceNavigation admin={host.isPlatformAdmin} />
      <div className="hidden lg:mt-auto lg:block"><p className="mb-3 truncate text-xs text-slate-300">{host.email}</p><form action={logout}><input type="hidden" name="csrf" value={csrf} /><button className="flex min-h-11 items-center gap-3 text-sm text-slate-100 hover:text-white"><LogOut className="size-4" aria-hidden="true" />Đăng xuất</button></form></div>
    </aside>
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-white px-5 py-3 sm:px-8"><Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 font-bold lg:hidden"><Activity aria-hidden="true" className="size-5 text-primary" />SportHost</Link><p className="hidden text-sm font-medium text-muted-foreground lg:block">Quản lý CLB · Giờ Việt Nam (UTC+7)</p><div className="flex flex-wrap items-center gap-3"><NotificationBell accountId={host.id} /><Link href="/account" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary lg:hidden"><UserRound aria-hidden="true" className="size-4" />Tài khoản</Link>{host.isPlatformAdmin && <Link href="/admin" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary lg:hidden"><ShieldCheck aria-hidden="true" className="size-4" />Quản trị</Link>}<Link href="/me" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">Chế độ người chơi<ArrowUpRight className="size-4" aria-hidden="true" /></Link><form action={logout} className="lg:hidden"><input type="hidden" name="csrf" value={csrf} /><Button variant="ghost" size="icon" aria-label="Đăng xuất"><LogOut /></Button></form></div></header>
    <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-5 py-7 outline-none sm:px-8 sm:py-9"><OnboardingHelp /><OnboardingHome />{children}</main>
    <WorkspaceNavigation mobile />
  </div></OnboardingProvider></WorkspaceScope>;
}
