import { notFound } from "next/navigation";
import { duePage } from "@/server/modules/finance/club";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { moneyText } from "@/domain/catalog";
import { AppError } from "@/server/errors";
import { UploadForm } from "@/features/shared/upload-form";
import { Input } from "@/components/ui/input";
export const dynamic = "force-dynamic";
export default async function DuePayment({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const due = await duePage(key).catch(error => { if (error instanceof AppError && error.status === 404) notFound(); throw error; });
  return <main id="main" className="mx-auto max-w-xl px-5 py-10"><p className="mb-3 font-bold text-primary">SportHost · {due.clubName}</p><h1 className="text-3xl font-bold">Phí tháng {due.period}</h1><section className="mt-6 rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">{due.name}</h2><p className="my-4 text-3xl font-bold">{moneyText(due.amount)}</p><p className="mb-5 text-sm font-semibold text-primary">{due.paid ? "Host đã ghi nhận thanh toán" : due.status === "reported" ? "Biên nhận đang chờ đối soát" : "Chưa ghi nhận thanh toán"}</p>{due.payment.account_number && <div className="rounded-xl bg-muted p-4 text-sm"><p className="font-semibold">{due.payment.bank_name}</p><p className="my-2 break-all text-xl font-bold">{due.payment.account_number}</p><p>{due.payment.account_holder}</p><p className="mt-2 whitespace-pre-wrap">{due.payment.payment_note}</p></div>}{due.payment.qr_key && <a className="my-3 inline-flex min-h-11 items-center font-semibold text-primary underline" href={`/dues/pay/${key}/qr`} target="_blank" rel="noreferrer">Xem ảnh QR nhận tiền</a>}{due.canReport && <div className="mt-6 border-t pt-5"><h3 className="mb-3 font-semibold">Gửi biên nhận chuyển khoản</h3><UploadForm action={`/dues/pay/${key}/proof`} csrf={makeCsrf(await sessionCookie())} label="Gửi biên nhận"><label className="block space-y-2 text-sm font-semibold"><span className="block">Ảnh biên nhận (tối đa 3 MB)</span><Input name="proof" type="file" required accept="image/png,image/jpeg,image/webp" /></label><p className="text-sm text-muted-foreground">Ảnh gửi lên cần host đối chiếu tiền thực tế trước khi ghi nhận đã thu.</p></UploadForm></div>}</section></main>;
}
