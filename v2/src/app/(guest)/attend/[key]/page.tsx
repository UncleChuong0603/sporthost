import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity } from "lucide-react";
import { guestBooking } from "@/server/modules/bookings/queries";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { bookingLabels, attendanceLabels } from "@/domain/status";
import { moneyText } from "@/domain/catalog";
import { ActionForm } from "@/features/shared/action-form";
import { PartyEditor } from "@/features/bookings/party-editor";
import { guestCommand } from "../../actions";
import { GuestFinance } from "@/features/bookings/guest-finance";
export const dynamic = "force-dynamic";
export default async function Attend({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params; const game = await guestBooking(key).catch(error => { if (error instanceof AppError && error.status === 404) notFound(); throw error; });
  const csrf = makeCsrf(await sessionCookie());
  return <><header className="border-b bg-white px-5 py-4"><div className="mx-auto flex max-w-3xl items-center gap-2 font-bold"><Activity className="size-6 text-primary" aria-hidden="true" />SportHost</div></header><main id="main" className="mx-auto max-w-3xl px-5 py-8"><Link href={`/join/${game.publicId}`} className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary">← Thông tin buổi chơi</Link><p className="mb-2 text-sm font-semibold text-primary">{game.clubName}</p><h1 className="text-3xl font-bold">{game.title}</h1><p className="mb-6 mt-3 text-sm text-muted-foreground">{game.startsAt.replace("T", " · ")} · {game.venue}</p><section className="rounded-2xl border bg-white p-5 sm:p-7"><div className="mb-5 flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold">Đăng ký của {game.name}</h2><span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-primary">{bookingLabels[game.status]}</span></div><p className="text-sm text-muted-foreground">{game.phone} · {game.participants.length} người</p><ul className="mt-5 divide-y">{game.participants.map(p => <li className="flex justify-between gap-3 py-3 text-sm" key={p.id}><span className="font-semibold">{p.name}</span><span className="text-muted-foreground">{attendanceLabels[p.attendanceStatus]}</span></li>)}</ul><div className="mt-5 border-t pt-5"><p className="text-sm text-muted-foreground">{!game.issued && game.feeMode === "COST_SHARING" ? "Phí sau buổi chơi" : "Phí dự kiến của nhóm"}</p><p className="my-2 text-2xl font-bold">{!game.issued && game.feeMode === "COST_SHARING" ? "Chờ host phát hành sau điểm danh" : moneyText(game.feeAmount)}</p><p className="text-sm text-muted-foreground">{game.paid ? "Host đã ghi nhận thanh toán." : game.paymentStatus === "reported" ? "Biên nhận đang chờ host đối chiếu." : "Chưa ghi nhận thanh toán."}</p></div></section>
    {game.kind === "fixed" && game.status !== "cancelled" && !game.isCancelled && <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="mb-4 text-xl font-semibold">Xác nhận tham gia</h2><div className="flex flex-wrap gap-3"><ActionForm action={guestCommand.bind(null, key, "yes")} csrf={csrf} label="Tôi tham gia" variant="default" /><ActionForm action={guestCommand.bind(null, key, "no")} csrf={csrf} label="Không tham gia" /></div></section>}
    {game.editable && <details className="mt-6 rounded-2xl border bg-white p-5"><summary className="flex min-h-11 items-center text-lg font-semibold">Sửa nhóm đăng ký</summary><div className="mt-4"><PartyEditor action={guestCommand.bind(null, key, "edit")} csrf={csrf} initial={game.participants.slice(1)} /></div></details>}
    {game.cancellable && <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="mb-4 font-semibold">Hủy tham gia</h2><p className="mb-4 text-sm text-muted-foreground">{String(game.policy.cancellation_policy || "Vui lòng liên hệ host nếu bạn cần hỗ trợ đối soát khoản đã đóng.")}</p><ActionForm action={guestCommand.bind(null, key, "cancel")} csrf={csrf} label="Xác nhận hủy cả nhóm" /></section>}
    <GuestFinance accessKey={key} csrf={csrf} />
  </main></>;
}
