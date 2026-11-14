import Link from "next/link";
import { Check } from "lucide-react";
import type { hostSession } from "@/server/modules/bookings/queries";
import { moneyText } from "@/domain/catalog";

export function SessionProgress({ game }: { game: Awaited<ReturnType<typeof hostSession>> }) {
  if (game.isCancelled || game.lifecycleStatus === "CANCELLED") return <section aria-label="Tiến trình buổi chơi" className="mb-6 rounded-2xl border bg-white p-5"><h2 className="font-bold">Buổi chơi đã hủy</h2><p className="mt-2 text-sm text-muted-foreground">Lịch sử đăng ký và thu chi được giữ để tiếp tục theo dõi khoản còn thiếu hoặc cần hoàn.</p></section>;
  const unmarked = game.roster.filter(booking => booking.status === "confirmed").flatMap(booking => booking.participants).filter(person => person.attendanceStatus === "NOT_MARKED").length;
  const finished = game.lifecycleStatus === "PLAY_FINISHED";
  const issued = !!game.billing?.issued || game.attendanceLocked || game.lifecycleStatus === "SETTLED";
  const current = issued ? 3 : finished ? unmarked ? 1 : 2 : game.lifecycleStatus === "IN_PROGRESS" ? 1 : 0;
  const hints = [
    game.isOpen ? "Chia sẻ liên kết và kiểm tra đăng ký trước khi bắt đầu buổi chơi." : "Đăng ký đang đóng. Bạn có thể kiểm tra danh sách hoặc mở lại đăng ký trước giờ chơi.",
    unmarked ? `Còn ${unmarked} người chưa điểm danh. Ghi nhận có mặt hoặc vắng mặt trước khi tính phí.` : "Danh sách đã được điểm danh. Kết thúc buổi chơi khi mọi người đã chơi xong để chuyển sang tính phí.",
    game.canFinance ? "Kiểm tra người tham gia và chi phí, sau đó phát hành khoản cần đóng. Phát hành sẽ khóa cơ sở tính phí." : "Đã hoàn tất điểm danh. Người phụ trách thu chi sẽ kiểm tra và phát hành khoản cần đóng.",
    game.billing ? game.billing.outstanding > 0 ? `Còn cần thu ${moneyText(game.billing.outstanding)}. Kiểm tra tiền thực nhận và xử lý biên nhận trong phần thu chi.` : game.lifecycleStatus === "SETTLED" ? "Hiện không còn khoản thiếu. Sổ thu chi vẫn giữ đầy đủ lịch sử giao dịch và điều chỉnh." : "Đã phát hành khoản đóng và hiện không còn khoản thiếu. Bạn có thể kiểm tra sổ thu chi và khoản cần hoàn trước khi chốt sổ." : "Cơ sở tính phí đã khóa. Liên hệ người phụ trách thu chi nếu cần điều chỉnh.",
  ];
  return <section aria-label="Tiến trình buổi chơi" className="mb-6 rounded-2xl border bg-white p-5 sm:p-6">
    <h2 className="font-bold">Tiến trình buổi chơi</h2>
    <ol className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{["Mời người", "Điểm danh", "Tính phí", "Theo dõi thu tiền"].map((label, index) => <li key={label} aria-current={index === current ? "step" : undefined} className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${index === current ? "border-primary bg-teal-50 font-bold text-primary" : "text-muted-foreground"}`}><span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs">{index < current ? <Check aria-label="Hoàn tất" className="size-4" /> : index + 1}</span>{label}</li>)}</ol>
    {game.lifecycleStatus === "SETTLED" && <p className="mb-2 text-sm font-semibold">Đã chốt sổ. Các khoản còn thiếu vẫn tiếp tục được theo dõi.</p>}
    <p className="text-sm leading-6 text-muted-foreground">{hints[current]}</p>
    {current < 2 && <Link href="#attendance" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary">{current === 1 && game.canCheckIn ? "Đến danh sách điểm danh" : "Xem người tham gia"}</Link>}
    {current >= 2 && game.canFinance && <Link href={`/games/${game.id}/billing`} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary">{current === 2 ? "Kiểm tra và tính phí" : "Theo dõi các khoản đã phát hành"}</Link>}
  </section>;
}
