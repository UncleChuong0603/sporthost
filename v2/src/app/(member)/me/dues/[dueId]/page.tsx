import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { duePage } from "@/server/modules/finance/club";
import { AppError } from "@/server/errors";
import { moneyText } from "@/domain/catalog";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { UploadForm } from "@/features/shared/upload-form";
import { Input } from "@/components/ui/input";
import { panel } from "@/features/member-portal/shared";
export default async function MyDue({ params }: { params: Promise<{ dueId: string }> }) {
  const dueId = Number((await params).dueId); if (!Number.isSafeInteger(dueId) || dueId < 1) notFound();
  const due = await duePage({ accountId: (await requireHost()).id, dueId }).catch(error => { if (error instanceof AppError && error.status === 404) notFound(); throw error; });
  return <><Link className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary" href="/me/payments">← Thanh toán của tôi</Link><p className="font-semibold text-primary">{due.clubName}</p><h1 className="mb-6 mt-2 text-3xl font-bold">Phí tháng {due.period}</h1><section className={panel}><h2 className="text-xl font-bold">{due.name}</h2><p className="my-4 text-3xl font-bold tabular-nums">{moneyText(due.amount)}</p><p className="mb-5 text-sm font-semibold text-primary">{due.paid ? "Host đã ghi nhận thanh toán" : due.status === "reported" ? "Biên nhận chờ host đối soát" : "Chưa ghi nhận thanh toán"}</p>{due.payment.account_number && <div className="rounded-xl bg-muted p-4 text-sm"><p className="font-semibold">{due.payment.bank_name}</p><p className="my-2 break-all text-xl font-bold">{due.payment.account_number}</p><p>{due.payment.account_holder}</p><p className="mt-2 whitespace-pre-wrap">{due.payment.payment_note}</p></div>}{due.payment.qr_key && <a className="my-3 inline-flex min-h-11 items-center font-semibold text-primary underline" href={`/me/dues/${dueId}/qr`} target="_blank" rel="noreferrer">Xem ảnh QR nhận tiền</a>}{due.canReport && <div className="mt-5 border-t pt-5"><h3 className="mb-4 font-bold">Gửi biên nhận chuyển khoản</h3><UploadForm action={`/me/dues/${dueId}/proof`} csrf={makeCsrf(await sessionCookie())} label="Gửi biên nhận"><label className="block space-y-2 text-sm font-semibold"><span className="block">Ảnh biên nhận</span><Input name="proof" type="file" accept="image/png,image/jpeg,image/webp" required /></label><p className="text-sm text-muted-foreground">Tối đa 3 MB. Host cần đối chiếu tiền thực tế trước khi ghi nhận đã thu.</p></UploadForm></div>}</section></>;
}
