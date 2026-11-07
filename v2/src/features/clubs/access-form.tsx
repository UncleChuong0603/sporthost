"use client";
import { ActionForm } from "@/features/shared/action-form";
import { Input } from "@/components/ui/input";
import type { FormState } from "./settings-form";

const rights = { manage_session: "Quản lý buổi chơi", manage_bookings: "Quản lý người chơi", check_in: "Điểm danh tại sân", manage_finance: "Quản lý thu chi", edit_club_settings: "Sửa cài đặt CLB" };
export function AccessForm({ action, csrf, remove = false }: { action: (s: FormState, f: FormData) => Promise<FormState>; csrf: string; remove?: boolean }) {
  return <ActionForm action={action} csrf={csrf} label={remove ? "Thu hồi quyền" : "Lưu quyền đồng quản lý"} variant={remove ? "outline" : "default"} confirmation={remove ? "Tài khoản này sẽ mất quyền đồng quản lý CLB ngay sau khi xác nhận. Lịch sử thao tác trước đây được giữ nguyên." : undefined} className="space-y-4">{!remove && <><label className="block space-y-2 text-sm font-semibold"><span className="block">Email đồng quản lý</span><Input type="email" name="email" required /></label><label className="block space-y-2 text-sm font-semibold"><span className="block">Vai trò</span><select name="role" className="h-12 w-full rounded-lg border bg-white px-3"><option value="manager">Quản lý buổi và người chơi</option><option value="finance">Quản lý thu chi</option><option value="custom">Tùy chỉnh quyền</option></select></label><details><summary className="flex min-h-11 items-center text-sm font-semibold">Chọn quyền khi dùng vai trò tùy chỉnh</summary><div className="grid gap-2">{Object.entries(rights).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="permissions" value={key} className="size-5" />{label}</label>)}</div></details></>}</ActionForm>;
}
