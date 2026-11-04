import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, LogOut } from "lucide-react";
import { currentHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { logout } from "@/app/(auth)/actions";
import { MemberNavigation } from "@/features/member-portal/navigation";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  if (!await currentHost()) redirect("/me/login");
  return <div className="min-h-dvh pb-24 sm:pb-8"><header className="border-b bg-[#142d35] text-white"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8"><Link href="/me" className="flex min-h-11 items-center gap-3 font-bold"><Activity aria-hidden="true" className="size-7 text-teal-200" /><span>SportHost<span className="block text-xs font-normal text-slate-200">Không gian người chơi</span></span></Link><form action={logout}><input name="csrf" type="hidden" value={makeCsrf(await sessionCookie())} /><input name="audience" type="hidden" value="member" /><Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Đăng xuất"><LogOut aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Đăng xuất</span></Button></form></div></header><div className="sm:px-8 sm:pt-5"><MemberNavigation /></div><main id="main" className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-9">{children}</main></div>;
}
