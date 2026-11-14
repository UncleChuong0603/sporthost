import Link from "next/link";
import {
  Users,
  UserRoundCog,
  Activity,
  Building2,
  CalendarDays,
  CreditCard,
  Clock,
  CircleCheck,
  CircleX,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { requireHost } from "@/server/auth/service";
import { adminOverview } from "@/server/modules/admin/service";
import { valueText } from "@/features/admin/table";

const money = (value: unknown) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
const states: Record<string, string> = {
  PRO: "Pro đang hoạt động",
  TRIAL: "Đang dùng thử",
  EXPIRED: "Đã hết hạn",
  FREE: "Cơ bản",
};
type Point = { day: string; users: number; hosts: number; sessions: number };
function GrowthChart({
  data,
  field,
  title,
}: {
  data: Point[];
  field: "users" | "hosts" | "sessions";
  title: string;
}) {
  const max = Math.max(1, ...data.map((p) => p[field]));
  const total = data.reduce((s, p) => s + p[field], 0);
  const points = data
    .map(
      (p, i) =>
        `${90 + (i * 486) / Math.max(1, data.length - 1)},${154 - (p[field] * 126) / max}`,
    )
    .join(" ");
  return (
    <section className="min-w-0 rounded-xl border bg-background p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-2xl font-bold tabular-nums">
          {total.toLocaleString("vi-VN")}
        </span>
      </div>
      <svg
        viewBox="0 0 600 175"
        role="img"
        aria-label={`${title}: ${total} bản ghi trong khoảng đã chọn`}
        className="mt-5 w-full text-primary"
      >
        <title>{title}</title>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <line
              x1="90"
              x2="576"
              y1={28 + i * 63}
              y2={28 + i * 63}
              stroke="currentColor"
              opacity="0.12"
            />
            <text x="78" textAnchor="end" y={37 + i * 63} fontSize="28" fill="currentColor">
              {new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(Math.round(max * (1 - i / 2)))}
            </text>
          </g>
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {data.length === 1 && (
          <circle
            cx="90"
            cy={154 - (data[0][field] * 126) / max}
            r="4"
            fill="currentColor"
          />
        )}
      </svg>
      <div className="mt-1 flex justify-between gap-3 text-xs tabular-nums text-muted-foreground"><span>{data[0]?.day}</span><span>{data.at(-1)?.day}</span></div>
      <details>
        <summary className="flex min-h-11 items-center text-xs font-semibold text-primary">
          Xem dữ liệu theo ngày
        </summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr>
                <th className="py-2">Ngày</th>
                <th>Số lượng</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr className="border-t" key={p.day}>
                  <td className="py-2">{p.day}</td>
                  <td>{p[field]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
export default async function Overview({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const filters = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== "" && v !== undefined),
  );
  const data = await adminOverview((await requireHost()).id, filters);
  const m = data.metrics;
  const count = (status: string) =>
    Number(data.distribution.find((d) => d.status === status)?.total || 0);
  const cards = [
    {
      label: "Người dùng đã đăng ký",
      value: m.users,
      icon: Users,
      href: "/admin/users",
      note: "Tài khoản đăng nhập, không tính hồ sơ khách",
    },
    {
      label: "Host quản lý CLB",
      value: m.hosts,
      icon: UserRoundCog,
      href: "/admin/hosts",
      note: "Chủ sở hữu hoặc đồng quản lý ít nhất 1 CLB",
    },
    {
      label: "Host có hoạt động",
      value: m.active_hosts,
      icon: Activity,
      href: "/admin/hosts",
      note: "Có thao tác CLB được ghi nhận trong khoảng chọn",
    },
    {
      label: "Câu lạc bộ",
      value: m.clubs,
      icon: Building2,
      href: "/admin/clubs",
      note: "Tất cả CLB hiện còn trên nền tảng",
    },
    {
      label: "Tổng buổi chơi",
      value: m.sessions,
      icon: CalendarDays,
      href: "/admin/sessions",
      note: "Bao gồm các trạng thái hiện có",
    },
    {
      label: "Tạo trong 30 ngày",
      value: m.sessions_30d,
      icon: TrendingUp,
      href: "/admin/sessions",
      note: "Chỉ tính bản ghi có ngày tạo đáng tin cậy",
    },
    {
      label: "Gói trả phí đã xác minh",
      value: m.active_paid,
      icon: CircleCheck,
      href: "/admin/subscriptions?status=PRO",
      note: "Pro còn hạn và khớp kỳ payOS đã xác minh",
    },
    {
      label: "Đang dùng thử",
      value: count("TRIAL"),
      icon: Clock,
      href: "/admin/subscriptions?status=TRIAL",
      note: "Trial còn hạn, chưa có Pro còn hạn",
    },
    {
      label: "Gói đã hết hạn",
      value: count("EXPIRED"),
      icon: CircleX,
      href: "/admin/subscriptions?status=EXPIRED",
      note: "CLB vẫn giữ nguyên dữ liệu và gói Cơ bản",
    },
    {
      label: "MRR quy đổi 30 ngày",
      value: money(m.mrr),
      icon: CreditCard,
      href: "/admin/subscriptions",
      note: "Chuẩn hóa 30 ngày; không phải số tiền đã thu",
    },
  ];
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-widest text-primary">
            NỀN TẢNG SPORTHOST
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Tổng quan nền tảng
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Theo dõi hoạt động, người dùng và gói đăng ký.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-semibold"
          href="/admin/platform-ledger"
        >
          Sổ thu chi nền tảng
          <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 text-sm font-semibold" href="/admin/onboarding">Hiệu quả bắt đầu của host<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
      </div>
      <div className="my-6 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Khoảng thời gian" className="flex flex-wrap gap-2">
          {[7, 30, 90].map((days) => {
            const from = new Date(Date.parse(today) - (days - 1) * 86400000)
              .toISOString()
              .slice(0, 10);
            const selected = data.from === from && data.to === today;
            return (
              <Link
                key={days}
                href={`/admin?from=${from}&to=${today}`}
                aria-current={selected ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold ${selected ? "border-primary bg-primary text-white" : "bg-background"}`}
              >
                {days} ngày qua
              </Link>
            );
          })}
        </nav>
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold">
            Từ ngày
            <input
              className="mt-1 block min-h-11 rounded-lg border bg-background px-3"
              type="date"
              name="from"
              defaultValue={data.from}
              required
            />
          </label>
          <label className="text-xs font-semibold">
            Đến ngày
            <input
              className="mt-1 block min-h-11 rounded-lg border bg-background px-3"
              type="date"
              name="to"
              defaultValue={data.to}
              required
            />
          </label>
          <button className="min-h-11 rounded-lg border bg-background px-4 text-sm font-semibold">
            Áp dụng
          </button>
        </form>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, href, note }) => (
          <Link
            key={label}
            href={href}
            className="group rounded-xl border bg-background p-5 transition-colors hover:border-primary"
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {label}
              </p>
              <Icon
                aria-hidden="true"
                className="size-4 shrink-0 text-primary"
              />
            </div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">
              {typeof value === "number"
                ? value.toLocaleString("vi-VN")
                : value}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {note}
            </p>
          </Link>
        ))}
      </div>
      <p className="my-5 rounded-lg border bg-background p-4 text-xs leading-relaxed text-muted-foreground">
        Ngày tạo lịch sử chưa được ghi nhận cho {m.users_unknown} tài khoản và{" "}
        {m.sessions_unknown} buổi chơi. Biểu đồ chỉ phản ánh dữ liệu được ghi từ
        khi bật theo dõi; không suy đoán ngày đăng ký. Số Host hoạt động phụ
        thuộc nhật ký thao tác, không đại diện lượt đăng nhập.
      </p>
      <div className="grid gap-4 xl:grid-cols-3">
        <GrowthChart
          data={data.growth}
          field="users"
          title="Đăng ký người dùng"
        />
        <GrowthChart
          data={data.growth}
          field="hosts"
          title="Host bắt đầu quản lý CLB"
        />
        <GrowthChart
          data={data.growth}
          field="sessions"
          title="Buổi chơi được tạo"
        />
      </div>
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1fr_1.5fr]">
        <section className="rounded-xl border bg-background p-5">
          <h2 className="text-lg font-bold">Phân bố gói đăng ký</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Trạng thái hiện tại · theo CLB
          </p>
          <div className="mt-6 space-y-5">
            {["PRO", "TRIAL", "EXPIRED", "FREE"].map((status) => (
              <div key={status}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{states[status]}</span>
                  <span className="font-semibold tabular-nums">
                    {count(status)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${m.clubs ? (count(status) / m.clubs) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t pt-5">
            <p className="text-xs text-muted-foreground">
              Đã thu qua payOS trong khoảng chọn
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {money(m.collected)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Chỉ đơn PAID có xác minh. Ảnh chuyển khoản và gia hạn hỗ trợ không
              được tính. MRR chỉ lấy một kỳ đã xác minh đang khớp hạn Pro của
              mỗi CLB; CLB thiếu chứng cứ kỳ trả phí được loại khỏi MRR.
            </p>
          </div>
        </section>
        <section className="rounded-xl border bg-background p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Hoạt động gần đây</h2>
            <Link
              className="flex min-h-11 items-center text-xs font-semibold text-primary"
              href="/admin/audit-logs"
            >
              Nhật ký quản trị ↗
            </Link>
          </div>
          <ul className="divide-y">
            {data.recent.map((a) => (
              <li key={`${a.source}-${a.id}`} className="flex gap-3 py-4">
                <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Activity
                    aria-hidden="true"
                    className="size-4 text-primary"
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{a.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {valueText(a.created_at, "created_at")}
                    {a.actor_id ? ` · Tài khoản #${a.actor_id}` : ""}
                  </p>
                  {a.source === "admin" && (
                    <Link
                      href={`/admin/audit-logs/${a.id}`}
                      className="inline-flex min-h-11 items-center text-xs text-primary"
                    >
                      Xem thay đổi
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!data.recent.length && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Chưa có hoạt động được ghi nhận.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
