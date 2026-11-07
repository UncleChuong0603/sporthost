import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { listClubs } from "@/server/modules/clubs/service";
import { listMembers } from "@/server/modules/members/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { genderLabels } from "@/domain/catalog";
import { MemberForm } from "@/features/members/member-form";
import { addMember, editMember, memberAccount } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/features/shared/action-form";
import { clubMemberAccounts } from "@/server/modules/member-portal/service";

import { EmptyState } from "@/components/ui/empty-state";
export default async function Members({ searchParams }: { searchParams: Promise<{ club_id?: string; q?: string; kind?: string; gender?: string }> }) {
  const host = await requireHost(); const query = await searchParams;
  const clubs = (await listClubs(host.id)).filter(club => club.owner || club.rights.some(right => right === "manage_bookings" || right === "manage_finance"));
  const selected = query.club_id ? clubs.find(club => club.id === Number(query.club_id)) : undefined;
  if (query.club_id && !selected) notFound();
  const visible = selected ? [selected] : clubs;
  let rows = (await Promise.all(visible.map(async club => {
    const [members, accounts] = await Promise.all([listMembers(host.id, club.id), club.owner ? clubMemberAccounts(host.id, club.id) : Promise.resolve([])]);
    return members.map(member => ({ ...member, clubId: club.id, clubName: club.name, canEdit: club.owner || club.rights.includes("manage_bookings"), canLink: club.owner, linkedEmail: accounts.find(account => account.memberId === member.id)?.email }));
  }))).flat();
  if (query.q) rows = rows.filter(member => (member.name + " " + member.phone).toLocaleLowerCase("vi").includes(query.q!.toLocaleLowerCase("vi")));
  if (query.kind) rows = rows.filter(member => member.kind === query.kind);
  if (query.gender) rows = rows.filter(member => member.gender === query.gender);
  const createTarget = visible.find(club => club.owner || club.rights.includes("manage_bookings"));
  const csrf = makeCsrf(await sessionCookie());
  const select = "h-12 min-w-0 max-w-full rounded-lg border bg-white px-3";
  return <>
    <h1 className="text-3xl font-bold">Thành viên</h1><p className="mb-7 mt-2 text-muted-foreground">Thông tin người chơi theo từng câu lạc bộ.</p>
    <nav aria-label="Chọn câu lạc bộ" className="mb-6 flex flex-wrap gap-3 rounded-2xl border bg-white p-4"><Link href="/members" className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold ${!selected ? "bg-primary text-white" : "bg-white"}`}>Tất cả CLB</Link>{clubs.map(club => <Link key={club.id} href={`/members?club_id=${club.id}`} className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold ${selected?.id === club.id ? "bg-primary text-white" : "bg-white"}`}>{club.name}</Link>)}</nav>
    <form className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4 [&>label]:min-w-0 [&>label]:max-w-full"><input name="club_id" type="hidden" value={selected?.id || ""} /><label className="block min-w-0 flex-1 space-y-2 text-sm font-semibold"><span className="block">Tìm tên hoặc điện thoại</span><input name="q" defaultValue={query.q} className={select + " w-full"} /></label><label className="block space-y-2 text-sm font-semibold"><span className="block">Loại thành viên</span><select name="kind" defaultValue={query.kind || ""} className={select}><option value="">Tất cả</option><option value="fixed">Cố định</option><option value="guest">Vãng lai</option></select></label><label className="block space-y-2 text-sm font-semibold"><span className="block">Giới tính thành viên</span><select name="gender" defaultValue={query.gender || ""} className={select}><option value="">Tất cả</option>{Object.entries(genderLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><Button variant="outline">Lọc thành viên</Button></form>
    <section className="overflow-hidden rounded-2xl border bg-white"><h2 className="border-b p-5 text-lg font-semibold">{selected?.name || "Các câu lạc bộ"} · {rows.length} thành viên</h2>{rows.length ? <ul className="divide-y">{rows.map(member => <li key={member.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{member.name}</p><p className="mt-1 text-sm text-muted-foreground">{member.phone} · {member.level || "Chưa cập nhật trình độ"}</p>{!selected && <p className="mt-1 text-xs text-primary">{member.clubName}</p>}</div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-muted px-3 py-1">{genderLabels[member.gender as keyof typeof genderLabels]}</span><span className="rounded-full bg-teal-50 px-3 py-1 text-primary">{member.kind === "fixed" ? "Cố định" : "Vãng lai"}</span></div></div>{member.canEdit && <details className="mt-3 border-t pt-3"><summary className="flex min-h-11 items-center text-sm font-semibold text-primary">Sửa thành viên {member.name}</summary><div className="mt-3"><MemberForm action={editMember.bind(null, member.clubId, member.id)} csrf={csrf} member={member} /></div></details>}{member.canLink && <details className="mt-3 border-t pt-3"><summary className="flex min-h-11 items-center text-sm font-semibold text-primary">Tài khoản người chơi {member.name}</summary><div className="mt-3 max-w-md">{member.linkedEmail ? <><p className="mb-4 break-all text-sm">Đã liên kết: <strong>{member.linkedEmail}</strong></p><ActionForm action={memberAccount.bind(null, member.clubId, member.id, "unlink")} csrf={csrf} label="Gỡ liên kết tài khoản" confirmation="Tài khoản sẽ không còn xem được đăng ký và thanh toán của hồ sơ này. Lịch sử người chơi trong CLB vẫn được giữ." variant="destructive" /></> : <ActionForm action={memberAccount.bind(null, member.clubId, member.id, "link")} csrf={csrf} label="Liên kết tài khoản" variant="default"><label className="block space-y-2 text-sm font-semibold"><span className="block">Email tài khoản thành viên</span><Input name="email" type="email" required autoComplete="off" /></label><p className="text-sm text-muted-foreground">Thành viên tạo tài khoản tại /me/signup và xác minh email trước. Chỉ liên kết khi bạn đã xác nhận đúng người; tài khoản sẽ xem được đăng ký và thanh toán của hồ sơ này.</p></ActionForm>}</div></details>}</li>)}</ul> : <div className="p-4"><EmptyState title="Chưa có thành viên phù hợp" description={query.q || query.kind || query.gender ? "Thử đổi từ khóa hoặc xóa bộ lọc. Thông tin thành viên hiện có vẫn được giữ nguyên." : createTarget ? "Thêm người chơi ở biểu mẫu bên dưới. Chọn Cố định cho người chơi thường xuyên, Vãng lai cho khách." : "Bạn cần có CLB và quyền quản lý thành viên để thêm người chơi."} action={<Button asChild variant="outline"><Link href={selected ? `/members?club_id=${selected.id}` : "/members"}>Xóa bộ lọc</Link></Button>} /></div>}</section>
    {createTarget && <section className="mt-6 rounded-2xl border bg-white p-5 sm:p-8"><h2 className="mb-5 text-xl font-semibold">Thêm thành viên · {createTarget.name}</h2><MemberForm action={addMember.bind(null, createTarget.id)} csrf={csrf} /></section>}
  </>;
}
