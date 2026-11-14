import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { clubReminderSettings } from "@/server/modules/notifications/service";
import { subscriptionState } from "@/domain/subscription";
import { ActionForm } from "@/features/shared/action-form";
import { updateReminders } from "@/features/notifications/actions";
import { Input } from "@/components/ui/input";
export default async function Reminders({ params }: { params: Promise<{ clubId: string }> }) {
  const clubId = Number((await params).clubId); if (!Number.isSafeInteger(clubId) || clubId < 1 || clubId > 2147483647) notFound();
  const { club, value } = await clubReminderSettings((await requireHost()).id, clubId);
  const active = subscriptionState(club).active;
  return <><Link className="inline-flex min-h-11 items-center font-semibold text-primary" href={`/clubs/${clubId}`}>← {club.name}</Link><h1 className="mt-3 text-3xl font-bold">Nhắc việc trong ứng dụng</h1>
    <p className="my-5 max-w-3xl leading-7 text-muted-foreground">Pro · Chỉ nhắc người chơi đã kết nối, xác minh email và bật loại nhắc tương ứng trong mục Thông báo. Không gửi email hoặc tin Zalo.</p>
    {!active && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">CLB đang dùng Free. Bạn vẫn có thể tắt lịch nhắc đã lưu; <Link className="font-semibold text-primary underline" href={`/clubs/${clubId}/subscription`}>nâng cấp Pro</Link> để bật nhắc việc.</p>}
    <section className="max-w-3xl rounded-2xl border bg-white p-5 sm:p-8"><h2 className="mb-6 text-xl font-bold">Lịch nhắc của CLB</h2>
      <ActionForm action={updateReminders.bind(null, clubId)} csrf={makeCsrf(await sessionCookie())} label="Lưu lịch nhắc" variant="default">
        <label className="flex min-h-11 items-center gap-3"><input data-tour="club-reminders" name="rsvp" type="checkbox" defaultChecked={value.rsvpEnabled} className="size-5 accent-primary" />Nhắc trả lời lời mời RSVP</label>
        <label className="block space-y-2 text-sm font-semibold"><span>Nhắc trước hạn trả lời (giờ)</span><Input name="lead" type="number" min={1} max={168} required defaultValue={value.rsvpLeadHours} /></label>
        <p className="text-sm leading-6 text-muted-foreground">Nhắc một lần cho mỗi lời mời và thời hạn. Dừng khi người chơi đã trả lời, hết hạn nhận người hoặc buổi bị hủy.</p>
        <label className="flex min-h-11 items-center gap-3 border-t pt-4"><input name="payment" type="checkbox" defaultChecked={value.paymentEnabled} className="size-5 accent-primary" />Nhắc khoản còn cần đóng sau buổi chơi</label>
        <label className="block space-y-2 text-sm font-semibold"><span>Khoảng cách nhắc khoản đóng (ngày)</span><Input name="interval" type="number" min={1} max={14} required defaultValue={value.paymentIntervalDays} /></label>
        <p className="text-sm leading-6 text-muted-foreground">Tính từ khi phát hành phí buổi chơi. Chỉ nhắc khi còn dư nợ thực tế và không có biên nhận chờ đối soát.</p>
        <label className="flex min-h-11 items-center gap-3 border-t pt-4"><input name="monthly" type="checkbox" defaultChecked={value.monthlyEnabled} className="size-5 accent-primary" />Nhắc phí tháng chưa đóng</label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2 text-sm font-semibold"><span>Nhắc từ ngày trong tháng</span><Input name="monthly_day" type="number" min={1} max={28} required defaultValue={value.monthlyDay} /></label><label className="block space-y-2 text-sm font-semibold"><span>Khoảng cách nhắc phí tháng (ngày)</span><Input name="monthly_interval" type="number" min={1} max={14} required defaultValue={value.monthlyIntervalDays} /></label></div>
        <p className="text-sm leading-6 text-muted-foreground">Áp dụng cho khoản phí tháng đã tạo, từ 00:00 ngày đã chọn của kỳ thu theo giờ Việt Nam (UTC+7). Kỳ cũ còn nợ vẫn được xét; kỳ tương lai chưa tới ngày sẽ chưa nhắc. Không tự tạo khoản thu.</p>
        <p className="text-sm leading-6 text-muted-foreground">Người chơi phải bật riêng Nhận nhắc phí tháng trong Thông báo. Đã đóng, khoản 0đ hoặc biên nhận đang chờ đối soát sẽ không bị nhắc. Nếu nợ nhiều kỳ, mỗi khoảng nhắc chỉ gửi một thông báo cho một người tại CLB.</p>
        <p className="text-xs leading-6 text-muted-foreground">Lịch được kiểm tra mỗi 15 phút. Bạn có thể tắt bất kỳ loại nhắc nào và lưu lại.</p>
      </ActionForm>
    </section>
  </>;
}
