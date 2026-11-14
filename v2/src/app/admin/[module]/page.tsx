import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { adminList, moduleSchema } from "@/server/modules/admin/service";
import { AdminFilters } from "@/features/admin/filters";
import { DataTable } from "@/features/admin/table";
const titles: Record<string, string> = {
  users: "Người dùng",
  hosts: "Host",
  clubs: "Câu lạc bộ",
  sessions: "Buổi chơi",
  subscriptions: "Gói đăng ký",
  "audit-logs": "Nhật ký quản trị",
};
const columns: Record<string, string[]> = {
  users: [
    "id",
    "name",
    "email",
    "role",
    "status",
    "created_at",
    "last_activity",
    "clubs",
  ],
  hosts: [
    "id",
    "email",
    "clubs",
    "sessions",
    "subscription",
    "trial_ends_at",
    "last_activity",
  ],
  clubs: ["id", "name", "host", "members", "sessions", "created_at", "status"],
  sessions: [
    "id",
    "title",
    "club",
    "host",
    "starts_at",
    "participants",
    "status",
    "created_at",
  ],
  subscriptions: [
    "id",
    "name",
    "host",
    "status",
    "plan",
    "trial_started_at",
    "trial_ends_at",
    "billing_period_start",
    "billing_period_end",
    "expires_at",
    "payment_verification",
  ],
  "audit-logs": [
    "id",
    "actor_id",
    "action",
    "target_type",
    "target_id",
    "created_at",
    "reason",
  ],
};
export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { module } = await params;
  if (!moduleSchema.safeParse(module).success) notFound();
  const query = await searchParams;
  const filters = Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== "" && v !== undefined),
  );
  const data = await adminList((await requireHost()).id, module, filters);
  const link = (page: number) => {
    const p = new URLSearchParams(
      Object.entries(query).filter(([, v]) => typeof v === "string") as [
        string,
        string,
      ][],
    );
    p.set("page", String(page));
    return `/admin/${module}?${p}`;
  };
  return (
    <>
      <p className="mb-2 text-xs font-semibold tracking-widest text-primary">
        NỀN TẢNG SPORTHOST
      </p>
      <h1 className="text-3xl font-bold tracking-tight">{titles[module]}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {data.total.toLocaleString("vi-VN")} bản ghi · Dữ liệu trực tiếp từ hệ
        thống
      </p>
      {module === "subscriptions" && (
        <p className="mt-4 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
          Gói đăng ký tính theo CLB. Pro được kích hoạt qua payOS sau xác minh;
          gia hạn hỗ trợ không được tính là doanh thu đã thu.
        </p>
      )}
      <AdminFilters module={module} />
      <DataTable
        rows={data.rows}
        columns={columns[module]}
        base={`/admin/${module}`}
      />
      <nav
        aria-label="Phân trang"
        className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
      >
        <span>
          Trang {data.page} / {data.pages} · 25 bản ghi mỗi trang
        </span>
        <div className="flex gap-3">
          {data.page > 1 && (
            <Link
              className="flex min-h-11 items-center rounded-lg border bg-background px-4"
              href={link(data.page - 1)}
            >
              ← Trang trước
            </Link>
          )}
          {data.page < data.pages && (
            <Link
              className="flex min-h-11 items-center rounded-lg border bg-background px-4"
              href={link(data.page + 1)}
            >
              Trang sau →
            </Link>
          )}
        </div>
      </nav>
    </>
  );
}
