"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isVietnamProvince, searchProvinces, vietnamProvinces } from "@/domain/vietnam-provinces";

export function ProvinceSelect({ defaultValue = "", disabled = false }: { defaultValue?: string; disabled?: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = searchProvinces(query);
  const legacy = Boolean(value && !isVietnamProvince(value));

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active, query]);

  function expand() {
    setQuery("");
    setActive(Math.max(0, vietnamProvinces.findIndex(province => province === value)));
    setOpen(true);
  }

  function choose(province: string) {
    setValue(province);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) expand();
      else setActive(index => options.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : 0);
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") setOpen(false);
  }

  return <div className="min-w-0 space-y-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <label htmlFor={id} className="block text-sm font-semibold">Khu vực</label>
    <input type="hidden" name="location" value={value} disabled={disabled} />
    <div className="relative">
      <div className="relative">
        <MapPin aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-primary" />
        <Input ref={input} id={id} role="combobox" autoComplete="off" spellCheck={false}
          aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
          aria-activedescendant={open && options[active] ? `${id}-option-${active}` : undefined}
          aria-describedby={`${id}-hint`} disabled={disabled}
          value={open ? query : value} placeholder={open ? "Tìm tỉnh/thành phố…" : "Chọn tỉnh/thành phố"}
          className={cn("pl-11 pr-12 font-normal placeholder:text-muted-foreground", open && "border-primary ring-2 ring-primary/15")}
          onFocus={expand} onClick={() => { if (!open) expand(); }}
          onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }} onKeyDown={onKeyDown} />
        <button type="button" tabIndex={-1} disabled={disabled} aria-label={open ? "Đóng danh sách khu vực" : "Mở danh sách khu vực"}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted-foreground hover:text-primary disabled:opacity-50"
          onMouseDown={event => event.preventDefault()} onClick={() => {
            if (open) setOpen(false);
            else { input.current?.focus(); expand(); }
          }}>
          <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-150", open && "rotate-180")} />
        </button>
      </div>
      {open && <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border bg-background shadow-lg shadow-foreground/10">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-3.5 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">Tỉnh / thành phố</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{options.length} / {vietnamProvinces.length}</span>
        </div>
        <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Tỉnh/thành phố Việt Nam" className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
          {options.map((province, index) => <li key={province} id={`${id}-option-${index}`} role="option" aria-selected={value === province}
            className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150", index === active && "bg-muted", value === province && "bg-primary/10 font-semibold text-primary")}
            onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => choose(province)}>
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">{province}</span>
            {value === province && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
          </li>)}
        </ul>
        {!options.length && <div role="status" className="px-4 pb-5 pt-2 text-center">
          <Search aria-hidden="true" className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-sm font-semibold">Không tìm thấy tỉnh/thành phố</p>
          <p className="mt-1 text-xs text-muted-foreground">Thử tên khác hoặc gõ không dấu.</p>
          <button type="button" className="mt-2 min-h-11 rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10"
            onMouseDown={event => event.preventDefault()} onClick={() => { setQuery(""); setActive(0); input.current?.focus(); }}>Xóa tìm kiếm</button>
        </div>}
      </div>}
    </div>
    <p id={`${id}-hint`} className="text-xs font-normal text-muted-foreground">{legacy ? "Khu vực đã lưu trước đây. Chọn tỉnh/thành phố để cập nhật." : "Chọn 1 trong 34 tỉnh/thành phố · Tìm có dấu hoặc không dấu"}</p>
  </div>;
}
