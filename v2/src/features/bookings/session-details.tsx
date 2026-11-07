import { dateTimeText } from "@/domain/format";
type SessionDetailsProps = {
  game: {
    skillGuidance: string;
    venueInstructions: string;
    mapsUrl: string;
    registrationDeadline: string | null;
    cancellationDeadline: string | null;
    rsvpDeadline?: string | null;
    participationConditions: string;
    cancellationPolicy: string;
    startsAt?: string;
    policy?: Record<string, unknown>;
  };
};

function safeMapsLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      ["maps.google.com", "www.google.com", "google.com", "maps.app.goo.gl", "goo.gl"].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function SessionDetails({ game }: SessionDetailsProps) {
  const maps = safeMapsLink(game.mapsUrl);
  const cancellationPolicy = typeof game.policy?.cancellation_policy === "string" ? game.policy.cancellation_policy : game.cancellationPolicy;
  const cancellationDeadline = String(game.policy?.cancellation_deadline || game.cancellationDeadline || game.startsAt || "");
  const notes = [
    ["Trình độ phù hợp", game.skillGuidance], ["Hướng dẫn đến sân", game.venueInstructions],
    ["Điều kiện tham gia", game.participationConditions], ["Chính sách hủy", cancellationPolicy],
  ].filter(([, value]) => value);
  const deadlines = [
    ["Hạn đăng ký", game.registrationDeadline], ["Hạn trả lời lời mời", game.rsvpDeadline],
    ["Hạn tự hủy", cancellationDeadline],
  ].filter(([, value]) => value);
  if (!maps && !notes.length && !deadlines.length) return null;
  return <section aria-label="Thông tin tham gia" className="mt-5 rounded-2xl border bg-white p-5 sm:p-6">
    <h2 className="text-lg font-bold">Thông tin tham gia</h2>
    {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary">Mở bản đồ đến sân</a>}
    {deadlines.length > 0 && <><dl className="mt-4 space-y-3 text-sm">{deadlines.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt>{label}</dt><dd className="font-semibold">{dateTimeText(value!)}</dd></div>)}</dl><p className="mt-2 text-xs text-muted-foreground">Các mốc giờ theo Việt Nam (UTC+7).</p></>}
    {notes.map(([label, value]) => <div key={label} className="mt-4"><h3 className="text-sm font-semibold">{label}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{value}</p></div>)}
  </section>;
}

export function BookingDecision({ status, reason, cancelled }: { status: string; reason: string; cancelled: boolean }) {
  const message = cancelled ? "Buổi chơi đã hủy. Kiểm tra khoản đã đóng và liên hệ host để đối soát hoặc hoàn tiền." :
    status === "pending" ? "Host đang xét duyệt đăng ký. Bạn chưa có chỗ được xác nhận." :
    status === "waitlist" ? "Bạn đang trong danh sách chờ, chưa có chỗ được xác nhận. Kiểm tra lại trạng thái trước khi đến sân." :
    status === "rejected" ? "Host đã từ chối đăng ký. Vui lòng liên hệ host nếu cần hỗ trợ." :
    status === "cancelled" ? "Đăng ký đã hủy. Khoản đã phát hành hoặc đã đóng vẫn cần được đối soát với host." : "";
  const visibleReason = reason && ["pending", "waitlist", "rejected", "cancelled"].includes(status);
  if (!message && !visibleReason) return null;
  return <aside aria-label="Trạng thái đăng ký" className="mt-5 space-y-2 rounded-xl border bg-muted/40 p-4 text-sm leading-6">
    {message && <p>{message}</p>}
    {visibleReason && <p className="whitespace-pre-wrap break-words"><strong>Ghi chú từ host: </strong>{reason}</p>}
  </aside>;
}
