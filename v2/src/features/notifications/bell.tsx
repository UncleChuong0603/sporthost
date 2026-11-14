import Link from "next/link";
import { Bell } from "lucide-react";
import { unreadCount } from "@/server/modules/notifications/service";
export async function NotificationBell({ accountId }: { accountId: number }) {
  const count = await unreadCount(accountId);
  return <Link href="/me/notifications" aria-label={`Thông báo${count ? `, ${count} chưa đọc` : ""}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold"><Bell className="size-5" aria-hidden="true" /><span className="hidden sm:inline">Thông báo</span>{count > 0 && <span aria-hidden="true" className="rounded-full bg-primary px-2 py-0.5 text-xs text-white">{count > 99 ? "99+" : count}</span>}</Link>;
}
