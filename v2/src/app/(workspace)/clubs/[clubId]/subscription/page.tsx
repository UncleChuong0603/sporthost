import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Sparkles, ShieldCheck, ArrowLeft } from "lucide-react";
import { requireHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { subscriptionDetails } from "@/server/modules/subscriptions/service";
import { payosReady } from "@/server/infrastructure/payos";
import { AppError } from "@/server/errors";
import { PRO_PRICE, PRO_ORIGINAL_PRICE, PRO_SAVING, PRO_DISCOUNT_PERCENT, PRO_TRIAL_DAYS, PRO_PERIOD_DAYS } from "@/domain/subscription";
import { ActionForm } from "@/features/shared/action-form";
import { PaymentWatcher } from "@/features/subscriptions/payment-watcher";
import { buyPro, paymentCommand } from "./actions";

const money = (amount: number) => new Intl.NumberFormat("vi-VN").format(amount) + "đ";
const date = (value: string | null) => value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)) : "—";
const labels: Record<string, string> = { CREATING: "Đang tạo liên kết", PENDING: "Chờ thanh toán", PAID: "Đã thanh toán", CANCELLED: "Đã hủy", EXPIRED: "Đã hết hạn" };
export default async function SubscriptionPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ payment?: string; orderCode?: string }> }) {
  const { clubId } = await params; const query = await searchParams;
  if (!/^[1-9]\d*$/.test(clubId) || Number(clubId) > 2147483647) notFound();
  const host = await requireHost();
  const { club, state, orders } = await subscriptionDetails(host.id, Number(clubId)).catch(error => { if (error instanceof AppError && error.status === 404) notFound(); throw error; });
  const csrf = makeCsrf(await sessionCookie()); const ready = payosReady();
  const pending = orders.find(order => ["CREATING", "PENDING"].includes(order.status));
  const returned = orders.find(order => String(order.orderCode) === query.orderCode);
  return <div className="mx-auto max-w-5xl">
    <Link href={`/clubs/${club.id}`} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="size-4" aria-hidden="true" />{club.name}</Link>
    <p className="text-sm font-semibold uppercase tracking-widest text-primary">SportHost Pro</p>
    <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Thêm thời gian chơi. Bớt việc quản lý.</h1>
    <p className="mt-3 max-w-2xl text-muted-foreground">Tự động lên lịch và cùng đồng quản lý chăm sóc CLB. Một gói cho cả câu lạc bộ.</p>
    <section aria-label="Gói hiện tại" className="my-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-5">
      <div><h2 className="font-bold">{state.kind === "PRO" ? "Pro đang hoạt động" : state.kind === "TRIAL" ? "Bạn đang dùng thử Pro" : "Bạn đang dùng gói Cơ bản"}</h2><p className="mt-1 text-sm text-muted-foreground">{state.active ? `Còn ${state.daysLeft} ngày · Sử dụng đến ${date(state.endsAt)}` : "Bạn vẫn có thể quản lý buổi chơi, thành viên và thu chi cơ bản."}</p></div>
      {state.active && <span className="rounded-full bg-teal-50 px-4 py-2 text-sm font-semibold text-primary">{state.kind === "PRO" ? "Pro" : "Pro trial"}</span>}
    </section>
    {query.payment && <div role="status" className="mb-6 rounded-xl border bg-white p-4 text-sm">{returned?.status === "PAID" ? `Thanh toán thành công! Pro đã được cộng đến ${date(returned.activatedUntil)}.` : query.payment === "cancel" ? "Bạn đã quay lại từ trang thanh toán. Đơn chỉ được hủy khi payOS xác nhận; bạn có thể tiếp tục hoặc hủy bên dưới." : "Đã quay lại SportHost. Đang chờ payOS xác nhận giao dịch; vui lòng không chuyển khoản lần nữa."}</div>}
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-2xl border bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">Cơ bản</h2><p className="mt-4 text-4xl font-bold">Miễn phí</p><p className="mt-2 text-sm text-muted-foreground">Cho những buổi chơi hằng ngày.</p><ul className="mt-7 space-y-4">{["Quản lý CLB và thành viên", "Tạo từng buổi chơi, chia sẻ link đăng ký", "Duyệt người chơi và điểm danh", "Quản lý thu chi, QR và biên nhận thủ công"].map(text => <li key={text} className="flex gap-3 text-sm"><Check aria-hidden="true" className="size-5 shrink-0 text-primary" />{text}</li>)}</ul><p className="mt-8 rounded-xl bg-muted p-4 text-sm">CLB mới được trải nghiệm Pro {PRO_TRIAL_DAYS} ngày miễn phí, không cần thẻ.</p></section>
      <section className="relative order-first rounded-2xl border-2 border-primary bg-white p-6 shadow-sm sm:p-8 md:order-last"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-bold"><Sparkles aria-hidden="true" className="size-5 text-primary" />Pro</h2><span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white">Ưu đãi ra mắt · giảm {PRO_DISCOUNT_PERCENT}%</span></div>
        <p className="mt-6 text-sm text-muted-foreground">Giá gốc <s>{money(PRO_ORIGINAL_PRICE)}</s></p><p className="mt-1 tabular-nums"><span className="text-5xl font-bold tracking-tight">{money(PRO_PRICE)}</span><span className="text-sm text-muted-foreground"> / {PRO_PERIOD_DAYS} ngày / CLB</span></p><p className="mt-3 font-semibold text-primary">Tiết kiệm {money(PRO_SAVING)} mỗi kỳ</p>
        <ul className="my-7 space-y-4">{["Tất cả tính năng Cơ bản", "Tạo và gia hạn lịch chơi lặp nhiều tuần", "Thêm đồng quản lý, phân quyền theo vai trò", "Kích hoạt tự động sau khi xác nhận thanh toán", "Gia hạn cộng dồn, giữ trọn ngày trial còn lại"].map(text => <li key={text} className="flex gap-3 text-sm"><Check aria-hidden="true" className="size-5 shrink-0 text-primary" />{text}</li>)}</ul>
        {ready ? <ActionForm action={buyPro.bind(null, club.id)} csrf={csrf} label={pending ? "Tiếp tục đơn thanh toán" : state.kind === "PRO" ? `Gia hạn Pro · ${money(PRO_PRICE)}` : `Kích hoạt Pro · ${money(PRO_PRICE)}`} variant="default" className="[&_button]:w-full" /> : <p role="status" className="rounded-xl bg-muted p-4 text-sm">Thanh toán đang được cấu hình. Vui lòng quay lại sau.</p>}
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />Thanh toán qua payOS. Không tự động trừ tiền. Giá và tổng tiền được xác nhận trước mỗi lần mua.</p>
      </section>
    </div>
    {pending && <section className="mt-7 rounded-2xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Đơn đang chờ thanh toán</h2><p className="mt-2 break-all text-sm text-muted-foreground">#{pending.orderCode} · {money(pending.amount)} · Liên kết có hiệu lực 15 phút.</p><div className="mt-4 flex flex-wrap gap-3"><ActionForm action={paymentCommand.bind(null, club.id, pending.orderCode, "refresh")} csrf={csrf} label="Kiểm tra thanh toán" /><ActionForm action={paymentCommand.bind(null, club.id, pending.orderCode, "cancel")} csrf={csrf} label="Hủy đơn thanh toán" variant="ghost" /></div>{ready && pending.status === "PENDING" && <PaymentWatcher clubId={club.id} orderCode={pending.orderCode} csrf={csrf} />}</section>}
    <section className="mt-7 rounded-2xl border bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Lịch sử thanh toán</h2>{!orders.length ? <p className="mt-4 text-sm text-muted-foreground">Chưa có giao dịch. Mỗi lần mua Pro sẽ được lưu tại đây.</p> : <ul className="mt-3 divide-y">{orders.map(order => <li key={order.orderCode} className="flex flex-wrap justify-between gap-3 py-4"><div className="min-w-0"><p className="break-all text-sm font-semibold">#{order.orderCode} · Pro {order.periodDays} ngày</p><p className="mt-1 text-xs text-muted-foreground">{date(order.createdAt)}{order.activatedUntil ? ` · Cộng đến ${date(order.activatedUntil)}` : ""}</p></div><div className="text-sm"><p className="font-bold tabular-nums">{money(order.amount)}</p><p className={order.status === "PAID" ? "mt-1 text-primary" : "mt-1 text-muted-foreground"}>{labels[order.status]}</p></div></li>)}</ul>}</section>
    <section className="mt-7 space-y-3 pb-5"><h2 className="text-xl font-bold">Thông tin gói</h2><details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Hết trial thì sao?</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">CLB trở về Cơ bản, không tự động thu phí. Dữ liệu và các buổi chơi đã tạo vẫn giữ nguyên. Bạn cần Pro để tạo thêm lịch lặp và cấp quyền đồng quản lý mới.</p></details><details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Mua sớm có mất ngày còn lại không?</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Không. Mỗi lần thanh toán thành công cộng thêm {PRO_PERIOD_DAYS} ngày sau ngày hết hạn Pro hoặc trial hiện tại, tùy mốc nào xa hơn.</p></details><details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">Ưu đãi áp dụng như thế nào?</summary><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Giá ưu đãi hiện tại là {money(PRO_PRICE)} cho {PRO_PERIOD_DAYS} ngày của một CLB, so với giá gốc {money(PRO_ORIGINAL_PRICE)}. Tổng tiền hiển thị trước thanh toán; không có gia hạn tự động.</p></details></section>
  </div>;
}
