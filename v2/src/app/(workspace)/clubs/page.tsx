import Link from "next/link";
import { Plus } from "lucide-react";
import { requireHost } from "@/server/auth/service";
import { listClubs } from "@/server/modules/clubs/service";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ClubCard } from "@/features/clubs/club-card";

export default async function Clubs() {
  const clubs = await listClubs((await requireHost()).id);
  const create = <Button asChild><Link href="/clubs/new"><Plus aria-hidden="true" />Tạo câu lạc bộ</Link></Button>;
  return <><PageHeader eyebrow="Không gian của bạn" title="Câu lạc bộ" description="Quản lý thông tin, thành viên và cách tổ chức của từng CLB." action={clubs.length ? create : undefined} />
    {clubs.length ? <><p className="mb-4 text-sm font-medium text-muted-foreground">{clubs.length} câu lạc bộ bạn đang quản lý</p><section aria-label="Câu lạc bộ của bạn" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{clubs.map(club => <ClubCard key={club.id} club={club} />)}</section></> : <EmptyState title="Bắt đầu với câu lạc bộ đầu tiên" description="Tạo CLB, thiết lập nhận tiền, thêm thành viên rồi lên lịch buổi đầu tiên." action={create} />}
  </>;
}
