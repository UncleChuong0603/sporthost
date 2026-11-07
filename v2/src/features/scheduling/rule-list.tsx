import { dateTimeText } from "@/domain/format";
import { listRules } from "@/server/modules/scheduling/service";
import { makeCsrf, sessionCookie } from "@/server/auth/session";
import { ActionForm } from "@/features/shared/action-form";
import { Input } from "@/components/ui/input";
import { ruleCommand } from "@/app/(workspace)/schedule/actions";
export async function RuleList({ hostId, clubId }: { hostId: number; clubId?: number }) {
  const rules = await listRules(hostId, clubId); if (!rules.length) return null; const csrf = makeCsrf(await sessionCookie());
  return <section className="mt-8 rounded-2xl border bg-white p-5 sm:p-7"><h2 className="mb-4 text-xl font-bold">Lịch lặp hàng tuần</h2><ul className="divide-y">{rules.map(rule => <li key={rule.id} className="py-5"><h3 className="font-semibold">{rule.title}</h3><p className="my-2 text-sm text-muted-foreground">{rule.clubName} · từ {dateTimeText(rule.firstStart)} · {rule.weeks} tuần · {rule.active ? "Đang áp dụng" : "Đã dừng tạo mới"}</p>{rule.active && rule.canManage && <div className="mt-4 flex flex-wrap items-start gap-4"><ActionForm action={ruleCommand.bind(null, rule.id, "generate")} csrf={csrf} label="Kiểm tra / tạo các buổi còn thiếu" /><ActionForm action={ruleCommand.bind(null, rule.id, "extend")} csrf={csrf} label="Gia hạn lịch lặp"><label className="block space-y-2 text-sm font-semibold"><span className="block">Thêm tuần cho {rule.title}</span><Input name="weeks" type="number" min={1} max={Math.min(12, 52 - rule.weeks)} defaultValue={Math.min(4, 52 - rule.weeks)} required /></label></ActionForm><ActionForm action={ruleCommand.bind(null, rule.id, "stop")} csrf={csrf} label="Dừng lịch lặp" /></div>}</li>)}</ul><p className="mt-4 text-sm text-muted-foreground">Dừng lịch lặp giữ nguyên các buổi đã tạo và toàn bộ đăng ký, thu chi.</p></section>;
}
