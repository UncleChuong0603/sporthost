import Link from "next/link";
import { ArrowUpRight, CircleCheck } from "lucide-react";
import type { dashboardData } from "@/server/modules/clubs/dashboard";
import { moneyText } from "@/domain/catalog";

type Data = Awaited<ReturnType<typeof dashboardData>>;
export function DashboardTasks({ data }: { data: Data }) {
  const groups = [
    { label: "Kết nối người chơi chờ duyệt", total: data.work.connections.reduce((sum, row) => sum + row.total, 0), items: data.work.connections.map(row => ({ key: String(row.clubId), title: row.clubName, detail: `${row.total} yêu cầu · chủ CLB xác nhận đúng hồ sơ`, href: `/clubs/${row.clubId}/connections` })) },
    { label: "Tiền thừa / cần xử lý", total: data.work.credits.length, items: data.work.credits.map(row => ({ key: `${row.bookingId}:${row.payerId ?? "group"}`, title: row.name, detail: `${row.clubName} · ${row.gameTitle} · ${moneyText(row.amount)}`, href: `/games/${row.gameId}/billing` })) },
    { label: "Đăng ký cần duyệt", total: data.pendingCount, items: data.pending.map(row => ({ key: String(row.id), title: row.name, detail: `${row.gameTitle} · ${row.startsAt.replace("T", " ")}`, href: `/games/${row.gameId}#booking-${row.id}` })) },
    { label: "Biên nhận chờ kiểm tra", total: data.work.proofs.reduce((sum, row) => sum + row.total, 0), items: data.work.proofs.map(row => ({ key: String(row.clubId), title: row.clubName, detail: `${row.total} biên nhận · kiểm tra tiền thực nhận trước khi xác nhận`, href: `/payments/review?club_id=${row.clubId}` })) },
    { label: "Buổi cần hoàn tất", total: data.work.sessions.length, items: data.work.sessions.map(row => ({ key: String(row.id), title: row.title, detail: `${row.clubName} · ${row.unmarked ? `Còn ${row.unmarked} người chưa điểm danh` : "Sẵn sàng kiểm tra và phát hành khoản đóng"}`, href: row.href })) },
    { label: "Khoản còn cần thu", total: data.work.receivables.reduce((sum, row) => sum + row.total, 0), items: data.work.receivables.map(row => ({ key: String(row.clubId), title: row.clubName, detail: `${row.total} khoản · ${moneyText(row.amount)} · mọi kỳ`, href: `/finance?club_id=${row.clubId}&status=unpaid` })) },
  ];
  const active = groups.filter(group => group.total > 0);
  return <section aria-label="Cần xử lý" className="rounded-2xl border bg-white p-5 sm:p-6">
    <h2 className="text-xl font-bold">Cần xử lý</h2>
    <p className="mt-2 text-sm text-muted-foreground">Các việc trong CLB bạn có quyền phụ trách. Khoản cần thu gồm nợ đã phát hành và phí tháng.</p>
    {active.length ? <div className="mt-4 grid gap-4 lg:grid-cols-2">{active.map(group => <details key={group.label} className="min-w-0 rounded-xl border p-4" open={active.length === 1}>
      <summary className="min-h-11 cursor-pointer content-center font-semibold">{group.label}<span className="ml-2 inline-block rounded-full bg-teal-50 px-2.5 py-1 text-sm tabular-nums text-primary">{group.total}</span></summary>
      <ul className="mt-2 divide-y">{group.items.map(item => <li key={item.key}><Link className="flex min-h-11 items-start justify-between gap-3 rounded-lg py-3 text-sm hover:text-primary" href={item.href}><span className="min-w-0"><span className="block break-words font-semibold">{item.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.detail}</span></span><ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0" /></Link></li>)}</ul>
    </details>)}</div> : <p className="mt-4 flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm text-primary"><CircleCheck aria-hidden="true" className="size-5 shrink-0" />Bạn đã xử lý xong các việc hiện tại.</p>}
  </section>;
}
