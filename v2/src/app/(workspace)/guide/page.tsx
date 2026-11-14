import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, ArrowUpRight, Search } from "lucide-react";
import { requireHost } from "@/server/auth/service";
import { listClubs, clubSettings } from "@/server/modules/clubs/service";
import { hasPermission, type Capability, type Permission } from "@/server/access/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { filterGuides, guideGroups, type GuideArticle, type GuideDestination } from "@/features/guide/catalog";

export const metadata = { title: "Hướng dẫn từng bước | SportHost" };
type Query = { q?: string; group?: string; topic?: string; club_id?: string };
function destination(key: GuideDestination, clubId: number | undefined) {
  const scoped = (path: string) => clubId ? `${path}?club_id=${clubId}` : path;
  const club = clubId ? `/clubs/${clubId}` : "/clubs";
  const paths: Record<GuideDestination, string> = {
    "new-club": "/clubs/new", club, settings: clubId ? `${club}/settings` : club,
    "new-session": scoped("/schedule/new"), schedule: scoped("/schedule"), members: scoped("/members"), finance: scoped("/finance"), proofs: scoped("/payments/review"),
    connections: clubId ? `${club}/connections` : club, access: clubId ? `${club}/access` : club, reminders: clubId ? `${club}/reminders` : club, subscription: clubId ? `${club}/subscription` : club,
    account: "/account", me: "/me", dashboard: "/dashboard", "player-schedule": "/me/schedule", "player-payments": "/me/payments", "player-connect": "/me/connect", notifications: "/me/notifications",
    admin: "/admin", "admin-users": "/admin/users", "admin-subscriptions": "/admin/subscriptions", "admin-ledger": "/admin/platform-ledger", "admin-onboarding": "/admin/onboarding",
  };
  return paths[key];
}
export default async function Guide({ searchParams }: { searchParams: Promise<Query> }) {
  const host = await requireHost(), params = await searchParams, clubs = await listClubs(host.id);
  const club = params.club_id ? clubs.find(c => String(c.id) === params.club_id) : clubs[0];
  if (params.club_id && !club) notFound();
  const settings = club ? await clubSettings(host.id, club.id) : null;
  const q = (params.q || "").slice(0, 200), group = params.group || "", topic = params.topic || "";
  const articles = filterGuides({ query: q, group, topic, admin: host.isPlatformAdmin });
  const groups = guideGroups.filter(g => host.isPlatformAdmin || g.id !== "admin");
  const href = (values: Record<string, string>) => {
    const query = new URLSearchParams({ ...(club ? { club_id: String(club.id) } : {}), ...values });
    return `/guide${query.size ? "?" + query : ""}`;
  };
  const permitted = (article: GuideArticle) => article.access === "account" || article.access === "admin" && host.isPlatformAdmin || !!club && article.access !== "admin" && hasPermission(club.owner, club.rights as Permission[], article.access as Capability);
  return <>
    <PageHeader title="Hướng dẫn từng bước" description="Đi từ việc cần nhất để tổ chức buổi đầu tiên, rồi mở rộng khi CLB có nhu cầu. Đọc bài không tạo dữ liệu hay đánh dấu hoàn thành nhiệm vụ." />
    <section className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 p-5 sm:p-7" aria-labelledby="guide-start"><h2 id="guide-start" className="flex items-center gap-2 text-xl font-bold"><BookOpen aria-hidden="true" className="size-5 shrink-0" />Nên bắt đầu từ đâu?</h2><p className="my-3 text-sm leading-6">Tạo CLB → Tạo buổi chơi → Gửi lời mời. Sau đó thêm thành viên, duyệt đăng ký và điểm danh. Thu chi chỉ làm khi có phát sinh thật; các công cụ Pro dùng khi cần tiết kiệm thời gian.</p><p className="text-sm">Muốn được chỉ ngay trên màn hình, bấm nút <strong>Hướng dẫn</strong> ở đầu trang. Bộ bài bên dưới dùng để tra cứu và xem lại từng bước.</p></section>
    <form action="/guide" method="get" role="search" aria-label="Tìm hướng dẫn" className="mb-6 grid items-end gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      {group && <input type="hidden" name="group" value={group} />}
      <label className="block min-w-0 space-y-2 text-sm font-semibold"><span>Tìm tính năng hoặc việc cần làm</span><Input name="q" defaultValue={q} maxLength={200} placeholder="Ví dụ: Excel, điểm danh, hoàn tiền" /></label>
      <label className="block min-w-0 space-y-2 text-sm font-semibold"><span>CLB dùng để mở thao tác</span><select name="club_id" defaultValue={club?.id || ""} className="h-12 w-full min-w-0 rounded-lg border bg-white px-3">{!clubs.length && <option value="">Chưa có CLB</option>}{clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Button type="submit"><Search aria-hidden="true" className="size-4" />Tìm hướng dẫn</Button>
    </form>
    <nav aria-label="Nhóm hướng dẫn theo độ cần thiết" className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Link href={href({})} aria-current={!group && !topic && !q ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-primary">Tất cả hướng dẫn</Link>{groups.map((g, i) => <Link key={g.id} href={href({ group: g.id })} aria-current={group === g.id ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${group === g.id ? "border-primary bg-teal-50 text-primary" : "bg-white"}`}><span aria-hidden="true" className="tabular-nums text-primary">{i + 1}.</span>{g.title}</Link>)}</nav>
    <p role="status" className="mb-5 break-words text-sm text-muted-foreground">{articles.length} bài hướng dẫn{q ? ` cho “${q}”` : " · Sắp xếp theo thứ tự nên làm"}{club ? ` · Thao tác tại ${club.name}` : ""}</p>
    {!articles.length && <section className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">Chưa tìm thấy hướng dẫn phù hợp</h2><p className="my-3 text-sm text-muted-foreground">Thử từ khóa ngắn hơn, bỏ bộ lọc hoặc chọn nhóm khác.</p><Button asChild variant="outline"><Link href={href({})}>Xem tất cả hướng dẫn</Link></Button></section>}
    <div className="space-y-8">{groups.map((g, index) => {
      const rows = articles.filter(a => a.group === g.id); if (!rows.length) return null;
      return <section key={g.id} aria-labelledby={`guide-group-${g.id}`}><h2 id={`guide-group-${g.id}`} className="text-xl font-bold">{index + 1}. {g.title}</h2><p className="mb-4 mt-2 text-sm text-muted-foreground">{g.description}</p><div className="space-y-3">{rows.map((a, i) => {
        const allowed = permitted(a), activePro = a.plan !== "Pro" || !!settings?.subscription.active;
        return <details key={a.id} id={`guide-${a.id}`} open={!!q || !!topic || g.id === "start" && i === 0} className="scroll-mt-6 rounded-2xl border bg-white p-5 sm:p-6"><summary className="min-h-11 cursor-pointer"><span className="mb-2 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-semibold">{a.plan}</span><h3 className="text-lg font-bold">{a.title}</h3><span className="mt-2 block text-sm leading-6 text-muted-foreground">{a.summary}</span></summary><ol aria-label={`Các bước: ${a.title}`} className="mt-5 max-w-prose list-decimal space-y-3 pl-6 text-sm leading-7 marker:font-bold marker:text-primary">{a.steps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol>{a.note && <p className="mt-5 max-w-prose rounded-xl bg-muted p-4 text-sm leading-6"><strong>Lưu ý: </strong>{a.note}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-3">{allowed && activePro ? <Button asChild variant="outline"><Link href={destination(a.destination, club?.id)}>Mở màn hình thao tác<ArrowUpRight aria-hidden="true" className="size-4 shrink-0" /></Link></Button> : <p className="text-sm text-muted-foreground">{!club && a.access !== "account" && a.access !== "admin" ? "Tạo hoặc chọn CLB trước để mở thao tác." : !allowed ? "Thao tác này cần quyền phù hợp tại CLB đã chọn; bạn vẫn có thể đọc hướng dẫn." : "Cần Pro hoặc dùng thử còn hiệu lực để bắt đầu. Các quyền tắt/thu hồi hiện có vẫn thực hiện tại CLB."}</p>}<Link href={href({ topic: a.id }) + `#guide-${a.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" aria-label={`Liên kết bài: ${a.title}`}>Liên kết bài này</Link></div>
        </details>;
      })}</div></section>;
    })}</div>
    <p className="mt-8 text-sm leading-6 text-muted-foreground">Các bước mô tả tính năng đang có. Quyền thao tác tùy vai trò, CLB và trạng thái buổi. Giá và thời hạn Pro được xem tại trang gói của CLB trước khi mua.</p>
  </>;
}
