import Link from "next/link";
import { notFound } from "next/navigation";
import { requireHost } from "@/server/auth/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { adminDetail, moduleSchema } from "@/server/modules/admin/service";
import { DataTable, labels, valueText } from "@/features/admin/table";
import { CommandForm } from "@/features/admin/command-form";
export default async function DetailPage({
  params,
}: {
  params: Promise<{ module: string; id: string }>;
}) {
  const { module, id } = await params;
  if (!moduleSchema.safeParse(module).success) notFound();
  const actor = await requireHost();
  const data = await adminDetail(actor.id, module, id);
  const row = data.row;
  const user = module === "users" || module === "hosts";
  return (
    <>
      <Link
        href={`/admin/${module}`}
        className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
      >
        ← Quay lại danh sách
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">
        {row.name || row.title || row.email || row.action || "Chi tiết"}{" "}
        <span className="text-muted-foreground">#{id}</span>
      </h1>
      <div className="my-6 grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <section className="rounded-xl border bg-background p-5">
          <h2 className="mb-4 text-lg font-bold">Thông tin bản ghi</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries(row)
              .filter(([k]) => k !== "version")
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs font-semibold text-muted-foreground">
                    {labels[key] || key}
                  </dt>
                  <dd className="mt-1 break-words text-sm">
                    {valueText(value, key)}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
        {(user || module === "subscriptions") && (
          <CommandForm
            targetId={Number(id)}
            version={
              user
                ? String(row.version)
                : `${row.trial_ends_at || ""}|${row.pro_ends_at || ""}`
            }
            csrf={makeCsrf(await sessionCookie())}
            user={user}
            suspended={row.status === "SUSPENDED"}
            self={user && Number(id) === actor.id}
          />
        )}
      </div>
      {(user || module === "clubs" || module === "subscriptions") && (
        <div className="mb-6 flex flex-wrap gap-4">
          {user ? (
            <>
              <Link
                className="min-h-11 rounded-lg border bg-background px-4 py-3 text-sm font-semibold text-primary"
                href={`/admin/clubs?user=${id}`}
              >
                Xem CLB liên quan
              </Link>
              <Link
                className="min-h-11 rounded-lg border bg-background px-4 py-3 text-sm font-semibold text-primary"
                href={`/admin/sessions?host=${id}`}
              >
                Buổi chơi tại CLB sở hữu
              </Link>
              <Link
                className="min-h-11 rounded-lg border bg-background px-4 py-3 text-sm font-semibold text-primary"
                href={`/admin/subscriptions?host=${id}`}
              >
                Subscription của Host
              </Link>
            </>
          ) : (
            <>
              <Link
                className="min-h-11 rounded-lg border bg-background px-4 py-3 text-sm font-semibold text-primary"
                href={`/admin/sessions?club=${id}`}
              >
                Buổi chơi của CLB
              </Link>
              <Link
                className="min-h-11 rounded-lg border bg-background px-4 py-3 text-sm font-semibold text-primary"
                href={`/admin/${module === "clubs" ? "subscriptions" : "clubs"}/${id}`}
              >
                {module === "clubs" ? "Quản lý subscription" : "Chi tiết CLB"}
              </Link>
            </>
          )}
        </div>
      )}
      {data.related.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-bold">
            {user
              ? "CLB và quan hệ (25 gần nhất)"
              : module === "subscriptions"
                ? "Lịch sử thanh toán (30 gần nhất)"
                : module === "sessions"
                  ? "Trạng thái đăng ký và thanh toán"
                  : "Chi tiết thay đổi"}
          </h2>
          <DataTable
            rows={data.related}
            columns={Object.keys(data.related[0])}
            base={user ? "/admin/clubs" : undefined}
          />
        </section>
      )}
      <section className="rounded-xl border bg-background p-5">
        <h2 className="text-lg font-bold">Lịch sử quản trị · 30 gần nhất</h2>
        {!data.history.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            Chưa có thao tác quản trị được ghi nhận.
          </p>
        )}
        {data.history.map((h) => (
          <details key={h.id} className="mt-3 border-t pt-3">
            <summary className="min-h-11 text-sm font-semibold">
              {h.action} · {valueText(h.created_at)} · {h.reason}
            </summary>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-4 text-xs">
              {JSON.stringify(h.changes, null, 2)}
            </pre>
          </details>
        ))}
      </section>
      {user && (
        <section className="mt-6 rounded-xl border bg-background p-5">
          <h2 className="mb-3 text-lg font-bold">
            Hoạt động tài khoản · 30 gần nhất
          </h2>
          <DataTable rows={data.activity} columns={["action", "created_at"]} />
        </section>
      )}
    </>
  );
}
