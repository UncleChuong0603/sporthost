"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { ActionForm } from "@/features/shared/action-form";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/features/clubs/settings-form";

type Defaults = { proActive: boolean; proOwner: boolean; id: number; name: string; fixed_fee: number; fixed_fee_male: number | null; fixed_fee_female: number | null; default_capacity: number; default_approval_mode: string; default_fee_mode: string; skill_guidance: string; cancellation_policy: string; venue_instructions: string };
const select = "h-12 w-full rounded-lg border bg-white px-3";
const field = "block space-y-2 text-sm font-semibold";

export function SessionForm({ action, csrf, clubs }: { action: (s: FormState, f: FormData) => Promise<FormState>; csrf: string; clubs: Defaults[] }) {
  const [clubId, setClubId] = useState(clubs[0].id);
  const first = clubs.find(club => club.id === clubId)!;
  const [feeMode, setFeeMode] = useState(first.default_fee_mode || "FIXED_PRICE");
  const dirty = useRef(new Set<string>());
  function changeClub(event: ChangeEvent<HTMLSelectElement>) {
    const id = Number(event.target.value), next = clubs.find(club => club.id === id)!;
    const defaults: Record<string, string | number> = { capacity: next.default_capacity, approval_mode: next.default_approval_mode || "MANUAL_APPROVE", fixed_fee: next.fixed_fee, fixed_fee_male: next.fixed_fee_male ?? "", fixed_fee_female: next.fixed_fee_female ?? "", skill_guidance: next.skill_guidance, cancellation_policy: next.cancellation_policy, venue_instructions: next.venue_instructions };
    for (const [name, value] of Object.entries(defaults)) {
      const input = event.currentTarget.form?.elements.namedItem(name);
      if (!dirty.current.has(name) && (input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement)) input.value = String(value || (value === 0 ? 0 : ""));
    }
    if (!dirty.current.has("fee_mode")) setFeeMode(next.default_fee_mode || "FIXED_PRICE");
    setClubId(id);
  }
  return <ActionForm action={action} csrf={csrf} label="Tạo buổi chơi" variant="default" className="space-y-6" onChange={event => {
    const input = event.target;
    if ((input instanceof HTMLInputElement || input instanceof HTMLSelectElement || input instanceof HTMLTextAreaElement) && input.name && input.name !== "club_id") dirty.current.add(input.name);
  }}>
    <fieldset className="space-y-4"><legend className="mb-4 text-lg font-bold">Thông tin buổi chơi</legend>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={field}><span className="block">Câu lạc bộ</span><select className={select} name="club_id" value={clubId} onChange={changeClub}>{clubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}</select></label>
        <label className={field}><span className="block">Tên buổi chơi</span><Input data-tour="session-title" name="title" maxLength={150} required /></label>
        <label className={field}><span className="block">Địa điểm</span><Input name="venue" maxLength={180} /></label>
        <label className={field}><span className="block">Giờ bắt đầu</span><Input type="datetime-local" name="starts_at" required /></label>
        <label className={field}><span className="block">Sức chứa</span><Input type="number" name="capacity" min={1} max={200} defaultValue={first.default_capacity} required /></label>
        <label className={field}><span className="block">Cách duyệt</span><select className={select} name="approval_mode" defaultValue={first.default_approval_mode || "MANUAL_APPROVE"}><option value="MANUAL_APPROVE">Host duyệt đăng ký</option><option value="AUTO_APPROVE">Tự động nhận khi đủ chỗ</option></select></label>
      </div>
    </fieldset>
    <p className="text-sm text-muted-foreground">Đổi CLB giữ nội dung bạn đã nhập; các mục chưa sửa dùng mặc định của CLB được chọn. Hãy kiểm tra mức phí trước khi tạo buổi.</p>
    <fieldset className="space-y-4 rounded-xl border p-4"><legend className="px-1 font-bold">Giá và cách tính phí</legend>
      <label className={field}><span className="block">Cách tính phí</span><select className={select} name="fee_mode" value={feeMode} onChange={event => setFeeMode(event.target.value)} aria-describedby="fee-mode-help"><option value="FIXED_PRICE">Giá cố định / người</option><option value="COST_SHARING">Chia đều chi phí</option></select></label>
      <p id="fee-mode-help" className="text-sm leading-6 text-muted-foreground">{feeMode === "COST_SHARING" ? "Khoản mỗi người cần đóng được tính sau buổi chơi, từ chi phí và danh sách điểm danh. Các đơn giá bên dưới không phải số tiền phải đóng khi chia chi phí." : "Người chơi được áp dụng đơn giá khi đăng ký. Nhập 0 nếu miễn phí."}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={field}><span className="block">Phí vãng lai / người</span><Input type="number" name="guest_fee" min={0} max={100000000} defaultValue={0} /></label>
        <label className={field}><span className="block">Phí thành viên cố định / người</span><Input type="number" name="fixed_fee" min={0} max={100000000} defaultValue={first.fixed_fee} /></label>
      </div>
      <details className="border-t pt-2"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">Mức phí riêng và chính sách thu</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{([
          ["fixed_fee_male", "Phí thành viên nam", first.fixed_fee_male], ["fixed_fee_female", "Phí thành viên nữ", first.fixed_fee_female], ["guest_fee_male", "Phí vãng lai nam", null], ["guest_fee_female", "Phí vãng lai nữ", null],
        ] as const).map(([name, label, value]) => <label key={name} className={field}><span className="block">{label}</span><Input type="number" name={name} min={0} max={100000000} defaultValue={value ?? ""} /></label>)}
          <label className={field}><span className="block">Phí vắng mặt</span><select name="no_show_policy" className={select}><option value="FREE">Miễn phí người vắng</option><option value="FULL">Thu đủ theo chính sách</option></select></label>
          <label className={field}><span className="block">Phí tháng và phí buổi</span><select name="monthly_policy" className={select}><option value="SESSION_FEE">Thu phí buổi</option><option value="EXEMPT_PAID">Miễn người đã đóng tháng</option></select></label>
        </div><p className="mt-3 text-sm text-muted-foreground">Mức nam/nữ để trống dùng mức chung; nhập 0 nếu miễn phí.</p>
      </details>
    </fieldset>
    <details className="rounded-xl border p-4"><summary data-tour="session-recurrence" className="min-h-11 cursor-pointer content-center font-semibold">Lặp lịch hàng tuần · Pro</summary>
      <p className="my-3 text-sm text-muted-foreground">Tạo trước nhiều tuần với cùng giờ và chính sách. Buổi lẻ luôn miễn phí.{!first.proActive && (first.proOwner ? <> <Link href={`/clubs/${first.id}/subscription`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">Nâng cấp Pro</Link></> : " Liên hệ chủ CLB để kích hoạt Pro.")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={field}><span className="block">Số tuần (1 là buổi lẻ)</span><Input type="number" name="weeks" min={1} max={first.proActive ? 12 : 1} defaultValue={1} /></label>
        <label className={field}><span className="block">Ưu tiên RSVP trước bao nhiêu giờ</span><Input type="number" name="rsvp_hours" min={0} max={168} defaultValue={24} /></label>
      </div>
    </details>
    <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer content-center font-semibold">Giới hạn và chính sách tham gia</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {[["capacity_male", "Giới hạn nam"], ["capacity_female", "Giới hạn nữ"]].map(([name, label]) => <label key={name} className={field}><span className="block">{label}</span><Input type="number" name={name} min={0} max={200} /></label>)}
        <label className={field}><span className="block">Liên kết Google Maps</span><Input name="maps_url" type="url" maxLength={500} /></label>
        {[["registration_deadline", "Hạn đăng ký"], ["cancellation_deadline", "Hạn tự sửa/hủy"]].map(([name, label]) => <label key={name} className={field}><span className="block">{label}</span><Input name={name} type="datetime-local" /></label>)}
      </div>
      {[["skill_guidance", "Trình độ phù hợp", first.skill_guidance], ["participation_conditions", "Điều kiện tham gia", ""], ["cancellation_policy", "Chính sách hủy", first.cancellation_policy], ["venue_instructions", "Hướng dẫn đến sân", first.venue_instructions]].map(([name, label, value]) => <label key={name} className={`mt-4 ${field}`}><span className="block">{label}</span><textarea name={name} defaultValue={value || ""} rows={3} className="w-full rounded-lg border bg-white p-3" maxLength={name === "skill_guidance" ? 500 : 2000} /></label>)}
    </details>
  </ActionForm>;
}
