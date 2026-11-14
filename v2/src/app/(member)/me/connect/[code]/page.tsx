import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { connectionClub } from "@/server/modules/member-portal/connections";
import { AppError } from "@/server/errors";
import { ActionForm } from "@/features/shared/action-form";
import { Input } from "@/components/ui/input";
import { submitConnection } from "@/features/member-portal/connection-actions";

export default async function ConnectionPreview({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code;
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) notFound();
  const account = await requireHost();
  const club = await connectionClub(account.id, code).catch(error => { if (error instanceof AppError && error.status === 404) return null; throw error; });
  if (!club) return <section className="rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">Lời mời không còn hoạt động</h1><p className="mt-3 text-muted-foreground">Hãy xin lời mời mới từ chủ CLB. Yêu cầu đã gửi trước đó vẫn được giữ.</p><Link href="/me/connect" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary">Xem yêu cầu của tôi</Link></section>;
  const csrf = makeCsrf(await sessionCookie());
  return <><Link className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary" href="/me/connect">← Kết nối CLB</Link><h1 className="text-3xl font-bold">{club.name}</h1><p className="my-4 text-muted-foreground">Chủ CLB sẽ xác nhận danh tính và liên kết đúng hồ sơ. Gửi yêu cầu không cấp quyền quản lý CLB.</p>
    {club.linked ? <p className="rounded-xl border bg-teal-50 p-5">Bạn đã kết nối với CLB này. <Link href="/me/schedule" className="inline-flex min-h-11 items-center font-semibold text-primary">Mở lịch của tôi</Link></p> : club.request?.status === "pending" ? <p className="rounded-xl border bg-white p-5">Yêu cầu của bạn đang chờ chủ CLB duyệt. <Link href="/me/connect" className="inline-flex min-h-11 items-center font-semibold text-primary">Xem hoặc rút yêu cầu</Link></p> : !account.emailVerified ? <p className="rounded-xl border bg-teal-50 p-5">Xác minh email trước khi gửi yêu cầu. <Link href="/me/profile" className="inline-flex min-h-11 items-center font-semibold text-primary">Mở hồ sơ để xác minh</Link><span className="mt-2 block text-sm">Sau khi xác minh, mở lại lời mời này để tiếp tục.</span></p> : <section className="rounded-2xl border bg-white p-5"><ActionForm action={submitConnection.bind(null, code)} csrf={csrf} label="Gửi yêu cầu kết nối" variant="default"><label className="block space-y-2 text-sm font-semibold"><span className="block">Họ tên để chủ CLB nhận ra bạn</span><Input name="name" required maxLength={100} autoComplete="name" /></label><label className="block space-y-2 text-sm font-semibold"><span className="block">Lời nhắn cho chủ CLB (tùy chọn)</span><textarea name="note" maxLength={500} rows={3} className="w-full rounded-lg border bg-white p-3" /></label><p className="text-sm text-muted-foreground">Tài khoản: {account.email}. Chỉ chủ CLB được xem và duyệt yêu cầu này.</p></ActionForm></section>}
  </>;
}
