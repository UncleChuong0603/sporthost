import { requireHost } from "@/server/auth/service";
import { listClubs, sessionDefaults } from "@/server/modules/clubs/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { SessionForm } from "@/features/scheduling/session-form";
import { createGameAction } from "../actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
export default async function NewSession({ searchParams }: { searchParams: Promise<{ club_id?: string }> }) {
  const host = await requireHost(); const selected = (await searchParams).club_id;
  const clubs = (await listClubs(host.id)).filter(c => c.owner || c.rights.includes("manage_session")).sort((a, b) => Number(String(b.id) === selected) - Number(String(a.id) === selected));
  const details = await Promise.all(clubs.map(c => sessionDefaults(host.id, c.id)));
  return <><PageHeader title="Tạo buổi chơi" description="Chọn CLB, giờ và số chỗ. Mức phí tính bằng đồng Việt Nam; thời gian theo giờ Việt Nam (UTC+7)." back={{ href: "/schedule", label: "Lịch chơi" }} /><section className="max-w-3xl rounded-2xl border bg-white p-5 sm:p-8">{details.length ? <SessionForm action={createGameAction} csrf={makeCsrf(await sessionCookie())} clubs={details} /> : <div className="space-y-4"><p className="text-muted-foreground">Bạn cần tạo CLB hoặc được cấp quyền quản lý lịch trước.</p><Button asChild><Link href="/clubs/new">Tạo câu lạc bộ</Link></Button></div>}</section></>;
}
