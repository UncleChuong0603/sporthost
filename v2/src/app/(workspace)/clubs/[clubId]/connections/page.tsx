import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { ownerConnections } from "@/server/modules/member-portal/connections";
import { clubSettings } from "@/server/modules/clubs/service";
import { AppError } from "@/server/errors";
import { ActionForm } from "@/features/shared/action-form";
import { Input } from "@/components/ui/input";
import { ConnectionInviteLink } from "@/features/member-portal/invite-link";
import { inviteCommand, reviewCommand } from "@/features/member-portal/connection-actions";

export default async function ConnectionsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const value = (await params).clubId;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) notFound();
  const id = Number(value), host = await requireHost();
  const data = await ownerConnections(host.id, id).catch(error => { if (error instanceof AppError && error.status === 404) notFound(); throw error; });
  const club = await clubSettings(host.id, id), csrf = makeCsrf(await sessionCookie());
  return <><Link className="mb-4 inline-flex min-h-11 items-center font-semibold text-primary" href={`/members?club_id=${id}`}>← Thành viên · {club.name}</Link><h1 className="text-3xl font-bold">Kết nối người chơi</h1><p className="my-4 max-w-2xl text-muted-foreground">Gửi lời mời để người chơi dùng tài khoản đã xác minh email gửi yêu cầu. Bạn kiểm tra đúng người và chọn hồ sơ trước khi duyệt.</p>
    <section data-tour="club-connections" tabIndex={-1} aria-label="Lời mời kết nối" className="my-6 rounded-2xl border bg-white p-5 sm:p-6"><h2 className="text-xl font-bold">Lời mời vào CLB</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Liên kết chỉ cho phép gửi yêu cầu. Chưa được duyệt thì người chơi chưa xem được lịch và khoản đóng của thành viên. Không tự ghép theo họ tên hoặc số điện thoại.</p>
      {data.invite?.enabled && <ConnectionInviteLink code={data.invite.token} />}
      <div className="mt-4 flex flex-wrap gap-4"><ActionForm action={inviteCommand.bind(null, id, "rotate")} csrf={csrf} label={data.invite ? "Cấp liên kết mời mới" : "Tạo liên kết mời"} variant="default" />{data.invite?.enabled && <ActionForm action={inviteCommand.bind(null, id, "disable")} csrf={csrf} label="Tắt liên kết mời" />}</div>
      {data.invite && !data.invite.enabled && <p className="mt-3 text-sm text-muted-foreground">Lời mời đang tắt. Các yêu cầu đã gửi vẫn có thể được duyệt.</p>}
    </section>
    <section aria-label="Yêu cầu kết nối chờ duyệt"><h2 className="mb-4 text-xl font-bold">Chờ bạn duyệt · {data.queue.length}</h2>{!data.queue.length && <p className="rounded-2xl border bg-white p-6 text-muted-foreground">Chưa có yêu cầu kết nối đang chờ.</p>}<div className="space-y-4">{data.queue.map(request => <article key={request.id} className="rounded-2xl border bg-white p-5 sm:p-6"><h3 className="text-lg font-bold">{request.name}</h3><p className="mt-2 break-all text-sm">{request.email}</p>{request.note && <p className="mt-3 whitespace-pre-wrap text-sm">{request.note}</p>}<div className="mt-5 grid gap-5 md:grid-cols-2">{data.available.length > 0 ? <ActionForm action={reviewCommand.bind(null, id, request.id, "approve")} csrf={csrf} label="Duyệt và liên kết hồ sơ" variant="default"><label className="block space-y-2 text-sm font-semibold"><span className="block">Hồ sơ thành viên cần liên kết</span><select name="member_id" required defaultValue="" className="min-h-12 w-full rounded-lg border bg-white px-3"><option value="" disabled>Chọn đúng hồ sơ đã xác nhận</option>{data.available.map(member => <option key={member.id} value={member.id}>{member.name} · {member.phone}</option>)}</select></label><p className="text-xs leading-5 text-muted-foreground">Duyệt cho phép tài khoản xem lịch và các khoản đóng của hồ sơ này. Hãy xác nhận đúng người trước khi liên kết.</p></ActionForm> : <p className="text-sm text-muted-foreground">Chưa có hồ sơ chưa liên kết. <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline" href={`/members?club_id=${id}`}>Thêm hoặc kiểm tra thành viên</Link></p>}<ActionForm action={reviewCommand.bind(null, id, request.id, "reject")} csrf={csrf} label="Từ chối yêu cầu"><label className="block space-y-2 text-sm font-semibold"><span className="block">Lý do từ chối</span><Input name="reason" required maxLength={500} /></label></ActionForm></div></article>)}</div></section>
  </>;
}
