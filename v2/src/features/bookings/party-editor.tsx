"use client";
import { useState } from "react";
import { ActionForm } from "@/features/shared/action-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { genderLabels } from "@/domain/catalog";
import type { FormState } from "@/features/clubs/settings-form";
export function PartyEditor({ action, csrf, initial }: { action: (s: FormState, f: FormData) => Promise<FormState>; csrf: string; initial: { name: string; gender: string; level: string }[] }) {
  const [party, setParty] = useState(initial.map((person, i) => ({ ...person, key: i })));
  const [next, setNext] = useState(initial.length);
  return <ActionForm action={action} csrf={csrf} label="Lưu nhóm đăng ký" variant="default"><p className="text-sm text-muted-foreground">Người liên hệ được giữ nguyên. Thay đổi nhóm phải còn trong thời hạn và chưa có điểm danh/giao dịch.</p>{party.map((person, i) => <div key={person.key} className="rounded-xl border bg-muted p-4"><label className="block space-y-2 text-sm font-semibold"><span className="block">Người đi cùng {i + 1}</span><Input name="companion_name" defaultValue={person.name} maxLength={100} /></label><div className="mt-3 flex gap-3"><select name="companion_gender" aria-label={`Giới tính người đi cùng ${i + 1}`} defaultValue={person.gender} className="h-12 min-w-0 rounded-lg border bg-white px-2 text-sm">{Object.entries(genderLabels).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select><Input name="companion_level" aria-label={`Trình độ người đi cùng ${i + 1}`} defaultValue={person.level} maxLength={40} /></div><Button type="button" variant="ghost" className="mt-2" onClick={() => setParty(party.filter(p => p.key !== person.key))}>Bỏ người này</Button></div>)}<Button type="button" variant="outline" disabled={party.length >= 19} onClick={() => { setParty([...party, { key: next, name: "", gender: "unspecified", level: "" }]); setNext(next + 1); }}>Thêm người đi cùng</Button><p className="text-sm font-semibold">Tổng cộng {party.length + 1} người</p></ActionForm>;
}
