"use client";
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { lookupPublic, joinPublic } from "@/app/(guest)/actions";
import { genderLabels } from "@/domain/catalog";

type Fields = { name: string; phone: string; gender: "male" | "female" | "unspecified"; level: string; lookup_token: string; channel: "facebook_link" | "direct"; companions: { name: string; gender: "male" | "female" | "unspecified"; level: string }[] };
export function GuestForm({ publicId, csrf, facebook }: { publicId: string; csrf: string; facebook: boolean }) {
  const [step, setStep] = useState(1), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { register, control, handleSubmit, getValues, setValue } = useForm<Fields>({ defaultValues: { name: "", phone: "", gender: "unspecified", level: "", lookup_token: "", channel: facebook ? "facebook_link" : "direct", companions: [] } });
  const { fields, append, remove } = useFieldArray({ control, name: "companions" });
  return <form onSubmit={handleSubmit(async value => {
    setBusy(true); setError("");
    try {
      if (step === 1) {
        const result = await lookupPublic(publicId, value.phone, csrf);
        if (result.error || !result.review) { setError(result.error); return; }
        setValue("lookup_token", result.review.token); setValue("phone", result.review.phone);
        setValue("name", result.review.name); setValue("gender", result.review.gender as Fields["gender"]); setValue("level", result.review.level); setStep(2);
      } else { const result = await joinPublic(publicId, value, csrf); if (result?.error) setError(result.error); }
    } catch { setError("Chưa gửi được yêu cầu. Vui lòng kiểm tra đăng ký trước khi thử lại."); }
    finally { setBusy(false); }
  })} className="space-y-5">
    <input type="hidden" name="csrf" value={csrf} />
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-destructive">{error}</p>}
    <label className="block space-y-2 text-sm font-semibold"><span className="block">Số điện thoại</span><Input type="tel" autoComplete="tel" required readOnly={step === 2} {...register("phone")} /></label>
    {step === 2 && <><button type="button" className="min-h-11 text-sm font-semibold text-primary" onClick={() => { setStep(1); setValue("lookup_token", ""); }}>Đổi số điện thoại</button><label className="block space-y-2 text-sm font-semibold"><span className="block">Họ tên</span><Input autoComplete="name" required maxLength={100} {...register("name")} /></label><div className="grid grid-cols-2 gap-4"><label className="space-y-2 text-sm font-semibold"><span className="block">Giới tính</span><select className="h-12 w-full rounded-lg border bg-white px-3" {...register("gender")}>{Object.entries(genderLabels).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></label><label className="space-y-2 text-sm font-semibold"><span className="block">Trình độ</span><Input maxLength={40} {...register("level")} /></label></div>
      <details><summary className="flex min-h-11 items-center text-sm font-semibold">Đăng ký hộ người đi cùng (tùy chọn)</summary><div className="mt-3 space-y-4">{fields.map((field, i) => <fieldset className="rounded-xl border bg-muted p-4" key={field.id}><legend className="text-sm font-semibold">Người đi cùng {i + 1}</legend><label className="block space-y-2 text-sm"><span className="block">Tên người đi cùng {i + 1}</span><Input {...register(`companions.${i}.name`)} required maxLength={100} /></label><div className="mt-3 grid grid-cols-2 gap-3"><select aria-label={`Giới tính người đi cùng ${i + 1}`} className="h-12 min-w-0 rounded-lg border bg-white px-2 text-sm" {...register(`companions.${i}.gender`)}>{Object.entries(genderLabels).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select><Input aria-label={`Trình độ người đi cùng ${i + 1}`} placeholder="Trình độ" {...register(`companions.${i}.level`)} /></div><Button type="button" variant="ghost" className="mt-2" onClick={() => remove(i)}><Trash2 aria-hidden="true" />Bỏ người này</Button></fieldset>)}<Button type="button" variant="outline" disabled={fields.length >= 19} onClick={() => append({ name: "", gender: "unspecified", level: "" })}><Plus aria-hidden="true" />Thêm người đi cùng</Button><p className="text-sm text-muted-foreground">Tổng cộng {fields.length + 1} người. Cả nhóm sẽ được duyệt cùng nhau.</p></div></details></>}
    <Button type="submit" className="w-full" disabled={busy}>{busy ? "Đang xử lý…" : step === 1 ? "Tiếp tục" : "Xác nhận gửi yêu cầu"}</Button>
  </form>;
}
