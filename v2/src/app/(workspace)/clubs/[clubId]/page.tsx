import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { clubSettings } from "@/server/modules/clubs/service";
import { SettingsForm } from "@/features/clubs/settings-form";
import { saveClub } from "../actions";
import { AppError } from "@/server/errors";
import { sports } from "@/domain/catalog";
import { ClubFinance } from "@/features/finance/club-finance";

export default async function ClubPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  if (!/^\d+$/.test(clubId) || !Number.isSafeInteger(Number(clubId))) notFound();
  const host = await requireHost();
  const club = await clubSettings(host.id, Number(clubId)).catch(error => { if (error instanceof AppError && error.status === 404) notFound(); throw error; });
  return <>
    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">{sports[club.sport_type]}</p>
    <h1 className="text-3xl font-bold">{club.name}</h1><p className="mb-8 mt-2 text-muted-foreground">{club.location || "Chưa cập nhật khu vực"}</p>
    <nav aria-label="Quản lý câu lạc bộ" className="mb-6 flex flex-wrap gap-3">
      {club.canContacts && <Link className="inline-flex min-h-11 items-center rounded-lg border bg-white px-4 font-semibold text-primary" href={`/members?club_id=${club.id}`}>Thành viên</Link>}
      {club.owner && <Link className="inline-flex min-h-11 items-center rounded-lg border bg-white px-4 font-semibold text-primary" href={`/clubs/${club.id}/access`}>Quyền đồng quản lý</Link>}
    </nav>
    <section className="max-w-3xl rounded-2xl border bg-white p-5 sm:p-8"><h2 className="mb-6 text-xl font-semibold">Cài đặt câu lạc bộ</h2>{club.canEdit ? <SettingsForm action={saveClub.bind(null, club.id)} csrf={makeCsrf(await sessionCookie())} club={club} /> : <dl className="grid gap-5 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Sức chứa mặc định</dt><dd className="mt-1 font-semibold">{club.default_capacity} người</dd></div><div><dt className="text-sm text-muted-foreground">Trình độ phù hợp</dt><dd className="mt-1 font-semibold">{club.skill_guidance || "Chưa cập nhật"}</dd></div></dl>}</section>
    {club.canFinance && <ClubFinance hostId={host.id} clubId={club.id} csrf={makeCsrf(await sessionCookie())} owner={club.owner} />}
  </>;
}
