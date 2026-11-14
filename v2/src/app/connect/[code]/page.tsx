import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentHost } from "@/server/auth/service";

export const dynamic = "force-dynamic";
export default async function PublicConnection({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code;
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) notFound();
  const next = `/me/connect/${code}`;
  if (await currentHost()) redirect(next);
  return <main id="main" className="mx-auto max-w-lg px-5 py-12"><h1 className="text-3xl font-bold">Bạn được mời kết nối CLB</h1><p className="my-5 text-muted-foreground">Đăng nhập hoặc tạo tài khoản người chơi để xem lời mời. Chủ CLB sẽ xác nhận đúng hồ sơ trước khi bạn truy cập lịch và khoản đóng.</p><div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 font-semibold text-white" href={`/me/login?next=${encodeURIComponent(next)}`}>Đăng nhập để tiếp tục</Link><Link className="inline-flex min-h-12 items-center rounded-lg border bg-white px-5 font-semibold text-primary" href={`/me/signup?next=${encodeURIComponent(next)}`}>Tạo tài khoản người chơi</Link></div></main>;
}
