import { SettingsForm } from "@/features/clubs/settings-form";
import { saveClub } from "../actions";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { PageHeader } from "@/components/ui/page-header";
export default async function NewClub() {
  return <><PageHeader eyebrow="Bước đầu tiên" title="Tạo câu lạc bộ" description="Đặt tên và chọn khu vực cho CLB. Các thiết lập mặc định giúp bạn tạo buổi chơi nhanh hơn; bạn có thể cập nhật sau." back={{ href: "/clubs", label: "Câu lạc bộ" }} /><section className="max-w-3xl rounded-2xl border bg-white p-5 sm:p-8"><SettingsForm action={saveClub.bind(null, null)} csrf={makeCsrf(await sessionCookie())} /></section></>;
}
