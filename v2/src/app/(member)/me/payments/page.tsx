import { requireHost } from "@/server/auth/service";
import { playerPayments, pageNumber } from "@/server/modules/member-portal/service";
import { moneyText } from "@/domain/catalog";
import { PaymentCard, MemberEmpty, MemberPagination, panel } from "@/features/member-portal/shared";
export default async function Payments({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageNumber((await searchParams).page), payments = await playerPayments((await requireHost()).id, page);
  return <><h1 className="text-3xl font-bold">Thanh toán của tôi</h1><p className="mt-2 text-muted-foreground">Khoản thu của bạn và nhóm bạn đăng ký. Biên nhận cần host đối soát.</p><div className="my-6 grid gap-3 sm:grid-cols-2"><section className={panel}><h2 className="text-sm text-muted-foreground">Còn cần đóng</h2><p className="mt-2 text-3xl font-bold tabular-nums">{moneyText(payments.outstanding)}</p></section><section className={panel}><h2 className="text-sm text-muted-foreground">Thừa / cần hoàn</h2><p className="mt-2 text-3xl font-bold tabular-nums">{moneyText(payments.credit)}</p></section></div><div className="grid gap-4 sm:grid-cols-2">{payments.rows.map(payment => <PaymentCard key={`${payment.type}-${payment.id}`} payment={payment} />)}</div>{!payments.rows.length && <MemberEmpty title="Chưa có khoản thanh toán"><p>Phí buổi chơi và phí tháng sẽ xuất hiện khi hồ sơ của bạn được liên kết và có khoản thu.</p></MemberEmpty>}<MemberPagination page={page} total={payments.total} href="/me/payments" /></>;
}
