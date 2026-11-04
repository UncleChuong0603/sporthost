import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { requireClubAccess, permissionLabels } from "@/server/access/permissions";
import { clubAccessDetails } from "@/server/modules/clubs/access";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { AccessForm } from "@/features/clubs/access-form";
import { saveAccess } from "../../actions";
import { subscriptionState } from "@/domain/subscription";

export default async function Access({ params }: { params: Promise<{ clubId: string }> }) {
  const id = Number((await params).clubId); if (!Number.isSafeInteger(id) || id < 1) notFound();
  const host = await requireHost();
  const context = await requireClubAccess(getDb(), host.id, id, "owner").catch(error => { if (error instanceof AppError && (error.status === 404 || error.status === 403)) notFound(); throw error; });
  const { cohosts, logs } = await clubAccessDetails(host.id, id); const csrf = makeCsrf(await sessionCookie());
  return <><Link href={`/clubs/${id}`} className="mb-5 inline-flex min-h-11 items-center font-semibold text-primary">← {context.club.name}</Link><h1 className="mb-8 text-3xl font-bold">Quyền đồng quản lý</h1><div className="grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border bg-white p-6"><h2 className="mb-5 text-xl font-semibold">Thêm hoặc cập nhật quyền</h2>{subscriptionState(context.club).active ? <AccessForm action={saveAccess.bind(null, id, null)} csrf={csrf} /> : <div><p className="text-sm text-muted-foreground">Cấp và cập nhật quyền đồng quản lý cần gói Pro. Bạn vẫn có thể thu hồi quyền đã cấp.</p><Link href={`/clubs/${id}/subscription`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline">Nâng cấp Pro · 49.000đ / 30 ngày</Link></div>}</section><section className="rounded-2xl border bg-white p-6"><h2 className="mb-5 text-xl font-semibold">Đồng quản lý hiện tại</h2>{cohosts.length ? <ul className="space-y-5">{cohosts.map(c => <li key={c.id} className="space-y-3 border-b pb-5 last:border-0"><p className="break-all font-semibold">{c.email}</p><p className="text-sm text-muted-foreground">{c.rights.map(r => permissionLabels[r]).join(" · ")}</p><AccessForm action={saveAccess.bind(null, id, c.id)} csrf={csrf} remove /></li>)}</ul> : <p className="text-muted-foreground">Chưa có đồng quản lý.</p>}</section></div><section className="mt-6 rounded-2xl border bg-white p-6"><h2 className="mb-5 text-xl font-semibold">Nhật ký thay đổi</h2><ul className="divide-y">{logs.map(log => <li key={log.id} className="py-4"><p className="font-semibold">{log.action}</p><time className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</time></li>)}</ul></section></>;
}
