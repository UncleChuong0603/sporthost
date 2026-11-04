"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "./settings-form";

const rights = { manage_session: "Quản lý buổi chơi", manage_bookings: "Quản lý người chơi", check_in: "Điểm danh tại sân", manage_finance: "Quản lý thu chi", edit_club_settings: "Sửa cài đặt CLB" };
export function AccessForm({ action, csrf, remove = false }: { action: (s: FormState, f: FormData) => Promise<FormState>; csrf: string; remove?: boolean }) {
  const [state, dispatch, pending] = useActionState(action, {});
  return <form action={dispatch} className="space-y-4"><input type="hidden" name="csrf" value={csrf} />{state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}{state.success && <p role="status" className="text-sm text-primary">{state.success}</p>}{!remove && <><label className="block space-y-2 text-sm font-semibold"><span className="block">Email đồng quản lý</span><Input type="email" name="email" required /></label><label className="block space-y-2 text-sm font-semibold"><span className="block">Vai trò</span><select name="role" className="h-12 w-full rounded-lg border bg-white px-3"><option value="manager">Quản lý buổi và người chơi</option><option value="finance">Quản lý thu chi</option><option value="custom">Tùy chỉnh quyền</option></select></label><details><summary className="flex min-h-11 items-center text-sm font-semibold">Chọn quyền khi dùng vai trò tùy chỉnh</summary><div className="grid gap-2">{Object.entries(rights).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="permissions" value={key} className="size-5" />{label}</label>)}</div></details></>}<Button disabled={pending} variant={remove ? "outline" : "default"}>{pending ? "Đang lưu…" : remove ? "Thu hồi quyền" : "Lưu quyền đồng quản lý"}</Button></form>;
}
