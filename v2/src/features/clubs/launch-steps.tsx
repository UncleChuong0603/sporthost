import Link from "next/link";
import { eq, count } from "drizzle-orm";
import { CircleCheck, Circle } from "lucide-react";
import { getDb } from "@/server/db/client";
import { requireClubAccess } from "@/server/access/permissions";
import { membersInClubhost as members, gameSessionsInClubhost as sessions } from "@/server/db/schema";

export async function LaunchSteps({ hostId, clubId }: { hostId: number; clubId: number }) {
  const db = getDb(), { club } = await requireClubAccess(db, hostId, clubId, "owner");
  const [[memberCount], [gameCount]] = await Promise.all([
    db.select({ total: count() }).from(members).where(eq(members.clubId, clubId)),
    db.select({ total: count() }).from(sessions).where(eq(sessions.clubId, clubId)),
  ]);
  const steps = [
    { done: !!(club.bankName && club.accountNumber && club.accountHolder) || !!club.qrKey, title: "Thiết lập nhận tiền", text: "Thêm ngân hàng hoặc QR trước khi mời người chơi để đăng ký giữ đúng thông tin thanh toán.", href: `#payment` },
    { done: memberCount.total > 0, title: "Thêm thành viên", text: "Thêm người chơi cố định, liên kết email tài khoản để họ xem lịch và khoản đóng.", href: `/members?club_id=${clubId}` },
    { done: gameCount.total > 0, title: "Tạo buổi chơi đầu tiên", text: "Chọn giờ, sân và mức phí, rồi gửi liên kết đăng ký hoặc lời mời từ trang buổi chơi.", href: `/schedule/new?club_id=${clubId}` },
  ];
  if (steps.every(step => step.done)) return null;
  return <section aria-label="Chuẩn bị CLB" className="mb-6 rounded-2xl border bg-white p-5 sm:p-6"><h2 className="text-xl font-bold">Sẵn sàng cho buổi đầu tiên</h2><p className="mt-2 text-sm text-muted-foreground">{steps.filter(step => step.done).length}/3 bước đã hoàn tất. Bạn có thể quay lại cập nhật bất cứ lúc nào.</p><ol className="mt-4 grid gap-4 lg:grid-cols-3">{steps.map(step => <li key={step.title} className="rounded-xl border p-4"><div className="flex items-start gap-2">{step.done ? <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /> : <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}<h3 className="font-semibold">{step.title}</h3></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p><Link href={step.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary">{step.done ? "Đã thiết lập · Xem lại" : "Thiết lập ngay"}</Link></li>)}</ol></section>;
}
