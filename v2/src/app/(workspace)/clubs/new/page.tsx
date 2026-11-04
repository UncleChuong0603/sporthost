import { SettingsForm } from "@/features/clubs/settings-form";
import { saveClub } from "../actions";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
export default async function NewClub() {
  return <><h1 className="text-3xl font-bold">Tạo câu lạc bộ</h1><p className="mb-8 mt-2 text-muted-foreground">Thiết lập cách tổ chức buổi chơi. Bạn có thể thay đổi sau.</p><section className="max-w-3xl rounded-2xl border bg-white p-5 sm:p-8"><SettingsForm action={saveClub.bind(null, null)} csrf={makeCsrf(await sessionCookie())} /></section></>;
}
