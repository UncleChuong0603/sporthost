import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Activity } from "lucide-react";
import { currentHost } from "@/server/auth/service";
import { assertAdmin } from "@/server/modules/admin/service";
import { AdminNavigation } from "@/features/admin/navigation";
import { logout } from "@/app/(auth)/actions";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Quản trị · SportHost",
  robots: { index: false, follow: false },
};
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = await currentHost();
  if (!host) redirect("/login");
  await assertAdmin(host.id);
  const csrf = makeCsrf(await sessionCookie());
  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-foreground p-6 text-white lg:flex">
        <Link
          href="/admin"
          className="flex min-h-11 items-center gap-2 text-xl font-bold"
        >
          <Activity aria-hidden="true" className="text-teal-200" />
          SportHost
        </Link>
        <p className="mb-8 mt-2 text-xs tracking-widest text-slate-300">
          QUẢN TRỊ NỀN TẢNG
        </p>
        <AdminNavigation />
        <Link
          href="/dashboard"
          className="mt-auto flex min-h-11 items-center text-sm text-slate-200"
        >
          Về không gian Host ↗
        </Link>
      </aside>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
          Super Admin
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="max-w-52 truncate text-sm text-muted-foreground">
            {host.email}
          </span>
          <form action={logout}>
            <input type="hidden" name="csrf" value={csrf} />
            <button className="min-h-11 text-sm font-semibold text-primary">
              Đăng xuất
            </button>
          </form>
        </div>
        <details className="w-full lg:hidden">
          <summary className="flex min-h-11 items-center font-semibold">
            Điều hướng quản trị
          </summary>
          <AdminNavigation mobile />
        </details>
      </header>
      <main
        id="main"
        className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8"
      >
        {children}
      </main>
    </div>
  );
}
