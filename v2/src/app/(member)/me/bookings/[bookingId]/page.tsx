import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { guestBooking, guestFinance } from "@/server/modules/bookings/queries";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { bookingLabels, attendanceLabels } from "@/domain/status";
import { moneyText } from "@/domain/catalog";
import { ActionForm } from "@/features/shared/action-form";
import { PartyEditor } from "@/features/bookings/party-editor";
import { PlayerFinance } from "@/features/bookings/guest-finance";
import { panel } from "@/features/member-portal/shared";
import { memberBookingCommand } from "../../actions";
export default async function MyBooking({ params }: { params: Promise<{ bookingId: string }> }) {
  const bookingId = Number((await params).bookingId);
  if (!Number.isSafeInteger(bookingId) || bookingId < 1) notFound();
  const access = { accountId: (await requireHost()).id, bookingId };
  const game = await guestBooking(access).catch(error => { if (error instanceof AppError && error.status === 404) notFound(); throw error; });
  const finance = await guestFinance(access), csrf = makeCsrf(await sessionCookie());
  return <><Link className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary" href="/me/schedule">← Lịch của tôi</Link><p className="text-sm font-semibold text-primary">{game.clubName}</p><h1 className="mt-2 text-3xl font-bold">{game.title}</h1><p className="mb-6 mt-3 text-sm text-muted-foreground">{game.startsAt.replace("T", " · ")} · {game.venue}</p><section className={panel}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Đăng ký của {game.name}</h2><span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-primary">{game.isCancelled ? "Buổi đã hủy" : bookingLabels[game.status]}</span></div><ul className="mt-4 divide-y">{game.participants.map(person => <li key={person.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold">{person.name}</span><span className="text-muted-foreground">{attendanceLabels[person.attendanceStatus]}</span></li>)}</ul><p className="mt-4 border-t pt-4 text-sm text-muted-foreground">{!game.issued && game.feeMode === "COST_SHARING" ? "Chờ host tính phí sau buổi chơi" : `Phí của nhóm: ${moneyText(game.feeAmount)}`}</p></section>
    {game.kind === "fixed" && game.status !== "cancelled" && !game.isCancelled && <section className={panel + " mt-5"}><h2 className="mb-4 text-lg font-bold">Bạn có tham gia không?</h2><div className="flex flex-wrap gap-3"><ActionForm action={memberBookingCommand.bind(null, bookingId, "yes")} csrf={csrf} label="Tôi tham gia" variant="default" /><ActionForm action={memberBookingCommand.bind(null, bookingId, "no")} csrf={csrf} label="Không tham gia" /></div></section>}
    {game.editable && <details className={panel + " mt-5"}><summary className="flex min-h-11 items-center font-bold">Sửa nhóm đăng ký</summary><div className="mt-4"><PartyEditor action={memberBookingCommand.bind(null, bookingId, "edit")} csrf={csrf} initial={game.participants.slice(1)} /></div></details>}
    {game.cancellable && <details className={panel + " mt-5"}><summary className="flex min-h-11 items-center font-semibold">Hủy tham gia</summary><p className="my-4 text-sm text-muted-foreground">{String(game.policy.cancellation_policy || "Hủy áp dụng cho cả nhóm. Khoản đã đóng cần host đối soát và hoàn tiền riêng.")}</p><ActionForm action={memberBookingCommand.bind(null, bookingId, "cancel")} csrf={csrf} label="Xác nhận hủy cả nhóm" variant="destructive" /></details>}
    <PlayerFinance finance={finance} csrf={csrf} basePath={`/me/bookings/${bookingId}`} payerAction={memberBookingCommand.bind(null, bookingId, "payer")} />
  </>;
}
