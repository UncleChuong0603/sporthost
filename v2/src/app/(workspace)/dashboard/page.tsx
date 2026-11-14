import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { requireHost } from "@/server/auth/service";
import { listClubs } from "@/server/modules/clubs/service";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { DashboardOverview } from "@/features/clubs/dashboard-overview";
import { ClubCard } from "@/features/clubs/club-card";

export default async function Dashboard() {
  const host = await requireHost(); const clubs = await listClubs(host.id);
  const canSchedule = clubs.some(club => club.owner || club.rights.includes("manage_session"));
  return <><PageHeader eyebrow="Cùng CLB ra sân" title="Tổng quan" description="Nắm lịch sắp tới, xử lý đăng ký và theo dõi thu chi của bạn." action={clubs.length ? <Button asChild><Link href={canSchedule ? "/schedule/new" : "/clubs/new"}><Plus aria-hidden="true" />{canSchedule ? "Tạo buổi chơi" : "Tạo CLB"}</Link></Button> : undefined} />
    {clubs.length ? <><DashboardOverview hostId={host.id} clubs={clubs} /><div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Câu lạc bộ của bạn</h2><Link href="/clubs" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Quản lý CLB<ArrowRight className="size-4" aria-hidden="true" /></Link></div><section aria-label="Câu lạc bộ của bạn" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{clubs.map(club => <ClubCard key={club.id} club={club} />)}</section></> : <><EmptyState title="Bắt đầu với câu lạc bộ đầu tiên" description="Tạo CLB để thiết lập cách chơi, mời thành viên và quản lý các khoản đóng cùng một nơi." action={<Button asChild><Link href="/clubs/new"><Plus aria-hidden="true" />Tạo câu lạc bộ</Link></Button>} /><ol aria-label="Các bước bắt đầu" className="mt-5 grid gap-4 sm:grid-cols-3">{[["01", "Tạo câu lạc bộ", "Đặt tên, chọn khu vực và thiết lập mặc định."], ["02", "Chuẩn bị cho buổi chơi", "Thêm thành viên và thông tin ngân hàng hoặc QR."], ["03", "Lên lịch & mời người", "Tạo buổi chơi rồi gửi liên kết vào nhóm CLB."]].map(([number, title, text]) => <li key={number} className="rounded-2xl border bg-white p-5"><p className="mb-3 text-xs font-bold text-primary">BƯỚC {number}</p><h2 className="font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></li>)}</ol></>}
  </>;
}
