import Link from "next/link";
import { requireHost } from "@/server/auth/service";
import { listClubs } from "@/server/modules/clubs/service";
import { listProofs } from "@/server/modules/finance/proofs";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { ActionForm } from "@/features/shared/action-form";
import { Input } from "@/components/ui/input";
import { proofCommand } from "../../finance/actions";
import { moneyText } from "@/domain/catalog";
import { AppError } from "@/server/errors";
export default async function PaymentReview({ searchParams }: { searchParams: Promise<{ club_id?: string }> }) {
  const host = await requireHost(); const selected = (await searchParams).club_id;
  const clubs = (await listClubs(host.id)).filter(club => club.owner || club.rights.includes("manage_finance"));
  const clubId = selected ? Number(selected) : clubs[0]?.id;
  if (selected && (!Number.isSafeInteger(clubId) || clubId! < 1)) throw new AppError(400, "CLB chưa hợp lệ.");
  const records = clubId ? await listProofs(host.id, clubId) : []; const csrf = makeCsrf(await sessionCookie());
  return <><h1 className="text-3xl font-bold">Đối soát biên nhận</h1><p className="mb-6 mt-3 text-muted-foreground">Kiểm tra tài khoản nhận tiền trước khi xác nhận. Ảnh và số tiền khách báo chưa phải giao dịch đã thu.</p><form className="mb-6 flex flex-wrap gap-3"><select aria-label="CLB cần đối soát" name="club_id" defaultValue={clubId} className="h-12 max-w-full rounded-lg border bg-white px-3">{clubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}</select><button className="min-h-12 rounded-lg bg-primary px-5 font-semibold text-white">Xem biên nhận</button></form>
    <section className="space-y-5">{records.map(record => <article key={record.id} className="rounded-2xl border bg-white p-5 sm:p-7"><h2 className="text-lg font-bold">{record.name}</h2><p className="my-2 text-sm text-muted-foreground">{record.title} · {record.createdAt}</p>{record.reportedAmount !== null && <p className="my-3 text-sm">Khách báo chuyển: <strong>{moneyText(record.reportedAmount)}</strong></p>}<a href={`/proofs/${record.id}/image`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Mở ảnh biên nhận #{record.id}</a>{record.gameId && <Link href={`/games/${record.gameId}/billing`} className="ml-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Xem khoản cần thu</Link>}<div className="mt-4 grid gap-6 sm:grid-cols-2"><ActionForm action={proofCommand.bind(null, record.id, "confirm")} csrf={csrf} label="Host xác nhận tiền đã vào" variant="default">{record.issued && <label className="block space-y-2 text-sm font-semibold"><span className="block">Số tiền thực nhận (đ)</span><Input name="received_amount" type="number" min={1} max={100000000} required /></label>}<label className="block space-y-2 text-sm font-semibold"><span className="block">Ghi chú đối soát</span><Input name="note" maxLength={300} /></label></ActionForm><ActionForm action={proofCommand.bind(null, record.id, "reject")} csrf={csrf} label="Từ chối biên nhận"><label className="block space-y-2 text-sm font-semibold"><span className="block">Lý do từ chối</span><Input name="note" maxLength={300} /></label></ActionForm></div></article>)}</section>{!records.length && <p className="rounded-2xl border bg-white p-10 text-center text-muted-foreground">Không có biên nhận đang chờ đối soát.</p>}</>;
}
