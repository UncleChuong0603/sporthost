import Link from "next/link";
import type { AdminRow } from "@/server/modules/admin/service";
export const labels: Record<string, string> = {
  id: "ID",
  email: "Email",
  name: "Tên",
  role: "Vai trò",
  status: "Trạng thái",
  created_at: "Ngày tạo",
  last_activity: "Hoạt động ghi nhận",
  clubs: "CLB quản lý",
  sessions: "Buổi chơi",
  subscription: "Subscription",
  trial_ends_at: "Hết trial",
  pro_ends_at: "Hết Pro",
  host: "Host",
  owner_id: "Host ID",
  members: "Thành viên",
  title: "Buổi chơi",
  club: "CLB",
  club_id: "CLB ID",
  starts_at: "Lịch chơi",
  participants: "Người đã xác nhận",
  attended: "Đã điểm danh",
  paid_booking_fees: "Phí booking đã đánh dấu thu (đ)",
  actor_id: "Admin ID",
  action: "Hành động",
  target_type: "Đối tượng",
  target_id: "ID đối tượng",
  reason: "Lý do",
  relationship: "Quan hệ",
  order_code: "Mã đơn",
  amount: "Số tiền (đ)",
  period_days: "Chu kỳ (ngày)",
  paid_at: "Đã xác minh lúc",
  activated_until: "Đã kích hoạt tới",
  payment_status: "Thanh toán",
  registrations: "Đăng ký",
  plan: "Gói",
  trial_started_at: "Bắt đầu trial",
  billing_period_start: "Bắt đầu kỳ đã xác minh",
  billing_period_end: "Kết thúc kỳ đã xác minh",
  payment_verification: "Đơn thanh toán gần nhất",
  order_created_at: "Ngày tạo đơn",
  expires_at: "Ngày hết hạn",
  net_recorded: "Thu ròng ghi sổ (đ)",
  participant_registrations: "Buổi có đăng ký",
  participant_attended: "Lượt tham gia có điểm danh",
  attendance_locked: "Khóa điểm danh",
  is_open: "Mở đăng ký",
  changes: "Thay đổi trước / sau",
};
export function valueText(v: unknown, key = ""): string {
  if (v === null || v === undefined || v === "") return "Chưa ghi nhận";
  if (v instanceof Date)
    return v.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  if (
    key.endsWith("_at") ||
    ["activated_until", "billing_period_start", "billing_period_end"].includes(
      key,
    )
  ) {
    const text = String(v);
    const date = new Date(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) ? text + ":00+07:00" : text,
    );
    if (!Number.isNaN(date.valueOf()))
      return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  }
  if (typeof v === "boolean") return v ? "Có" : "Không";
  return String(v);
}
export function DataTable({
  rows,
  columns,
  base,
}: {
  rows: AdminRow[];
  columns: string[];
  base?: string;
}) {
  return (
    <div className="relative overflow-x-auto rounded-xl border bg-background">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-muted-foreground"
              >
                {labels[c] || c}
              </th>
            ))}
            {base && (
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Chi tiết</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={String(row.id || i)} className="hover:bg-muted/50">
              {columns.map((c) => (
                <td key={c} className="max-w-80 px-4 py-4 align-top">
                  <span
                    className={
                      c === "status" || c === "role"
                        ? "inline-block rounded-md border bg-muted px-2 py-1 text-xs font-semibold"
                        : "break-words"
                    }
                  >
                    {valueText(row[c], c)}
                  </span>
                </td>
              ))}
              {base && (
                <td className="px-4">
                  <Link
                    className="inline-flex min-h-11 items-center whitespace-nowrap font-semibold text-primary"
                    href={`${base}/${row.id}`}
                  >
                    Chi tiết ↗<span className="sr-only"> #{row.id}</span>
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="px-6 py-16 text-center">
          <p className="font-semibold">Không có bản ghi phù hợp</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Thử thay đổi bộ lọc hoặc quay lại sau.
          </p>
        </div>
      )}
    </div>
  );
}
