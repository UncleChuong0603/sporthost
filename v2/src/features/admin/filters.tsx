"use client";
import { useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
export function AdminFilters({ module }: { module: string }) {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname(),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const input = "min-h-11 rounded-lg border bg-background px-3 text-sm";
  const states =
    module === "users"
      ? ["ACTIVE", "SUSPENDED"]
      : module === "sessions"
        ? [
            "DRAFT",
            "OPEN",
            "IN_PROGRESS",
            "PLAY_FINISHED",
            "SETTLED",
            "CANCELLED",
          ]
        : module === "audit-logs"
          ? [
              "suspend",
              "reactivate",
              "extend_trial",
              "extend_pro",
              "expire",
              "grant_admin",
              "revoke_admin",
              "verify_payment",
            ]
          : ["PRO", "TRIAL", "EXPIRED", "FREE"];
  return (
    <form
      className="my-6 flex flex-wrap items-end gap-3"
      action={path}
      onSubmit={() => {
        if (timer.current) clearTimeout(timer.current);
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold">
        Tìm kiếm
        <input
          className={input}
          name="q"
          defaultValue={params.get("q") || ""}
          placeholder="Tên, email hoặc nội dung…"
          maxLength={160}
          onChange={(e) => {
            const value = e.target.value;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              const p = new URLSearchParams(params);
              p.set("q", value);
              p.delete("page");
              router.replace(path + "?" + p.toString());
            }, 450);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        {module === "audit-logs" ? "Hành động" : "Trạng thái"}
        <select
          className={input}
          name="status"
          defaultValue={params.get("status") || ""}
        >
          <option value="">Tất cả</option>
          {states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {module === "users" && (
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Vai trò
          <select
            className={input}
            name="role"
            defaultValue={params.get("role") || ""}
          >
            <option value="">Tất cả</option>
            {["ADMIN", "HOST", "MEMBER"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Từ ngày
        <input
          className={input}
          name="from"
          type="date"
          defaultValue={params.get("from") || ""}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Đến ngày
        <input
          className={input}
          name="to"
          type="date"
          defaultValue={params.get("to") || ""}
        />
      </label>
      {module === "audit-logs" && (
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Admin ID
          <input
            className={input + " w-28"}
            name="actor"
            type="number"
            min={1}
            defaultValue={params.get("actor") || ""}
          />
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs font-semibold">
        Sắp xếp
        <select
          name="sort"
          className={input}
          defaultValue={params.get("sort") || "newest"}
        >
          <option value="newest">Mới nhất</option>
          <option value="oldest">Cũ nhất</option>
        </select>
      </label>
      {["club", "host", "user"].map(
        (key) =>
          params.get(key) && (
            <input
              key={key}
              type="hidden"
              name={key}
              value={params.get(key)!}
            />
          ),
      )}
      <button className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white">
        Áp dụng
      </button>
      <a
        className="flex min-h-11 items-center px-2 text-sm text-primary"
        href={path}
      >
        Xóa lọc
      </a>
    </form>
  );
}
