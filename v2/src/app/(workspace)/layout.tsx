import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, LogOut, UserRound } from "lucide-react";
import { currentHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { WorkspaceNavigation } from "@/features/clubs/workspace-navigation";
import { WorkspaceScope } from "@/features/clubs/workspace-scope";

export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const host = await currentHost();
  if (!host) redirect("/login");
  const csrf = makeCsrf(await sessionCookie());
  return <WorkspaceScope><div className="min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-62">
    <aside className="hidden bg-[#142d35] text-white lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-62 lg:flex-col lg:p-6">
      <Link href="/dashboard" aria-label="SportHost" className="flex min-h-11 items-center gap-3 text-xl font-bold"><Activity className="size-7 text-teal-200" aria-hidden="true" />SportHost</Link>
      <WorkspaceNavigation />
      <div className="hidden lg:mt-auto lg:block"><p className="mb-3 truncate text-xs text-slate-300">{host.email}</p><form action={logout}><input type="hidden" name="csrf" value={csrf} /><button className="flex min-h-11 items-center gap-3 text-sm text-slate-100 hover:text-white"><LogOut className="size-4" aria-hidden="true" />Đăng xuất</button></form></div>
    </aside>
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b bg-white px-5 py-3 sm:px-8"><Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 font-bold lg:hidden"><Activity aria-hidden="true" className="size-5 text-primary" />SportHost</Link><p className="hidden text-sm font-semibold text-muted-foreground lg:block">Không gian quản lý CLB</p><div className="flex flex-wrap items-center gap-3"><Link href="/account" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary lg:hidden"><UserRound aria-hidden="true" className="size-4" />Tài khoản</Link><Link href="/me" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Chế độ người chơi</Link><form action={logout} className="lg:hidden"><input type="hidden" name="csrf" value={csrf} /><Button variant="ghost" size="icon" aria-label="Đăng xuất"><LogOut /></Button></form></div></header>
    <main id="main" className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
    <WorkspaceNavigation mobile />
  </div></WorkspaceScope>;
}
