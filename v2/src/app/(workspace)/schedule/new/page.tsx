import { requireHost } from "@/server/auth/service";
import { listClubs, sessionDefaults } from "@/server/modules/clubs/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { SessionForm } from "@/features/scheduling/session-form";
import { createGameAction } from "../actions";
export default async function NewSession({ searchParams }: { searchParams: Promise<{ club_id?: string }> }) {
  const host = await requireHost(); const selected = (await searchParams).club_id;
  const clubs = (await listClubs(host.id)).filter(c => c.owner || c.rights.includes("manage_session")).sort((a, b) => Number(String(b.id) === selected) - Number(String(a.id) === selected));
  const details = await Promise.all(clubs.map(c => sessionDefaults(host.id, c.id)));
  return <><h1 className="text-3xl font-bold">Tạo buổi chơi</h1><p className="mb-8 mt-2 text-muted-foreground">Thiết lập lịch, số chỗ và chính sách trước khi chia sẻ link.</p><section className="max-w-3xl rounded-2xl border bg-white p-5 sm:p-8">{details.length ? <SessionForm action={createGameAction} csrf={makeCsrf(await sessionCookie())} clubs={details} /> : <p className="text-muted-foreground">Bạn cần tạo CLB hoặc được cấp quyền quản lý lịch trước.</p>}</section></>;
}
