import Link from "next/link";
import { requireHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { playerConnections } from "@/server/modules/member-portal/connections";
import { ActionForm } from "@/features/shared/action-form";
import { Input } from "@/components/ui/input";
import { openConnection, withdrawConnection } from "@/features/member-portal/connection-actions";

const labels: Record<string, string> = { pending: "Chờ chủ CLB duyệt", approved: "Đã duyệt yêu cầu", rejected: "Chưa được chấp nhận", cancelled: "Bạn đã rút yêu cầu" };
export default async function ConnectPage() {
  const account = await requireHost(), requests = await playerConnections(account.id), csrf = makeCsrf(await sessionCookie());
  return <><h1 className="text-3xl font-bold">Kết nối CLB</h1><p className="mt-3 text-muted-foreground">Xin liên kết mời từ chủ CLB. Bạn gửi yêu cầu, sau đó chủ CLB xác nhận đúng hồ sơ người chơi.</p>
    {!account.emailVerified && <p className="mt-4 rounded-xl border bg-teal-50 p-4 text-sm">Bạn cần xác minh email để gửi yêu cầu. <Link href="/me/profile" className="inline-flex min-h-11 items-center font-semibold text-primary underline">Mở hồ sơ để xác minh</Link></p>}
    <section className="my-6 rounded-2xl border bg-white p-5"><h2 className="mb-4 text-xl font-bold">Nhập lời mời</h2><ActionForm action={openConnection} csrf={csrf} label="Xem CLB được mời" variant="default"><label className="block space-y-2 text-sm font-semibold"><span className="block">Mã hoặc liên kết mời kết nối</span><Input name="code" required maxLength={500} autoCapitalize="none" spellCheck={false} /></label></ActionForm></section>
    <section aria-label="Yêu cầu kết nối của tôi"><h2 className="mb-4 text-xl font-bold">Yêu cầu của bạn</h2>{!requests.length && <p className="rounded-2xl border bg-white p-5 text-muted-foreground">Bạn chưa gửi yêu cầu kết nối CLB.</p>}<div className="space-y-4">{requests.map(request => <article key={request.id} className="rounded-2xl border bg-white p-5"><h3 className="font-bold">{request.clubName}</h3><p className="mt-2 text-sm font-semibold text-primary">{labels[request.status]}</p>{request.reason && <p className="mt-2 whitespace-pre-wrap text-sm">{request.reason}</p>}{request.status === "pending" && <ActionForm className="mt-4" action={withdrawConnection.bind(null, request.id)} csrf={csrf} label="Rút yêu cầu kết nối" />}{request.status === "approved" && <Link className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary" href="/me/profile">Kiểm tra hồ sơ đang kết nối</Link>}{["rejected", "cancelled"].includes(request.status) && <p className="mt-3 text-sm text-muted-foreground">Bạn có thể dùng lời mời còn hoạt động để gửi yêu cầu lại sau khi trao đổi với chủ CLB.</p>}</article>)}</div></section>
  </>;
}
