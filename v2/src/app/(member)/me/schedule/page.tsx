import Link from "next/link";
import { requireHost } from "@/server/auth/service";
import { playerCalendar, pageNumber } from "@/server/modules/member-portal/service";
import { BookingCard, MemberEmpty, MemberPagination } from "@/features/member-portal/shared";
export default async function Schedule({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const query = await searchParams, history = query.tab === "history", page = pageNumber(query.page);
  const calendar = await playerCalendar((await requireHost()).id, history, page);
  return <><h1 className="text-3xl font-bold">Lịch của tôi</h1><p className="mt-2 text-muted-foreground">Lời mời và các buổi bạn đã đăng ký.</p><nav aria-label="Lọc lịch tham gia" className="my-6 flex gap-3">{[{ href: "/me/schedule", label: "Sắp tới", active: !history },{ href: "/me/schedule?tab=history", label: "Lịch sử", active: history }].map(item => <Link aria-current={item.active ? "page" : undefined} href={item.href} key={item.href} className={`inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold ${item.active ? "border-primary bg-primary text-white" : "bg-white"}`}>{item.label}</Link>)}</nav><div className="grid gap-4 sm:grid-cols-2">{calendar.rows.map(booking => <BookingCard booking={booking} key={booking.id} />)}</div>{!calendar.rows.length && <MemberEmpty title={history ? "Chưa có lịch sử tham gia" : "Lịch đang trống"}><p>{history ? "Các buổi đã qua, đăng ký đã hủy và bị từ chối sẽ nằm ở đây." : "Buổi chơi xuất hiện khi host mời hoặc bạn đăng ký bằng hồ sơ đã liên kết."}</p></MemberEmpty>}<MemberPagination page={page} total={calendar.total} href={history ? "/me/schedule?tab=history" : "/me/schedule"} /></>;
}
