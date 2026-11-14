import Link from "next/link";
import { ArrowUpRight, MapPin, UsersRound } from "lucide-react";
import { sports } from "@/domain/catalog";
import type { listClubs } from "@/server/modules/clubs/service";

export function ClubCard({ club }: { club: Awaited<ReturnType<typeof listClubs>>[number] }) {
  return <Link href={`/clubs/${club.id}`} className="group flex min-w-0 flex-col rounded-2xl border bg-white p-5 transition-colors hover:border-primary/40 sm:p-6">
    <div className="mb-5 flex items-center justify-between"><span className="rounded-xl bg-teal-50 p-3 text-primary"><UsersRound className="size-6" aria-hidden="true" /></span><ArrowUpRight className="size-5 text-muted-foreground group-hover:text-primary" aria-hidden="true" /></div>
    <p className="text-xs font-bold uppercase tracking-wide text-primary">{sports[club.sportType as keyof typeof sports] || "Thể thao"}</p><h2 className="mt-2 text-xl font-bold">{club.name}</h2>
    <p className="mb-5 mt-3 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-1 size-3.5 shrink-0" aria-hidden="true" />{club.location || "Chưa cập nhật khu vực"}</p>
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs"><span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">{club.owner ? "Chủ câu lạc bộ" : "Đồng quản lý"}</span><span className="font-semibold text-primary">Quản lý CLB →</span></div>
  </Link>;
}
