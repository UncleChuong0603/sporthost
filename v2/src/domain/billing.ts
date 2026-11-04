import { createHash } from "node:crypto";

// Matches Python json.dumps(ensure_ascii=False, sort_keys=True, separators=(',', ':')).
export function encode(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(encode).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${encode((value as Record<string, unknown>)[key])}`).join(",")}}`;
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Non-JSON billing value");
  return result;
}
export const fingerprint = (value: unknown) => createHash("sha256").update(encode(value), "utf8").digest("hex");
export type BillingPerson = {
  participant_id: number; booking_id: number; name: string; payer_name: string; payer_participant_id: number | null;
  attendance: string; arrived_at: string | null; left_at: string | null; unit_price: number; discount: number;
  adjustment_reason: string; exempt: boolean; explanation: string; amount: number; base?: number;
};
export type BillingSnapshot = {
  fee_mode: string; no_show_policy: string; monthly_policy: string; people: BillingPerson[];
  expenses: { id: number; title: string; amount: number; category: string; allocated: boolean; note: string; created_by: number | null; created_at: string | null }[];
  total_expenses: number; allocated_expenses: number; excluded_expenses: number; total_due: number; billable_count: number;
  unmarked: number; payment: { qr_key: string | null; bank_name: string; account_holder: string; account_number: string; payment_note: string };
  rounding: "EXACT_VND_STABLE_ID"; unallocated_cost: number; advances: { booking_id: number; name: string; amount: number }[]; total_advanced: number;
};
export function allocate(people: BillingPerson[], allocated: number, feeMode: string) {
  const eligible = people.filter(person => !person.exempt).sort((a, b) => a.participant_id - b.participant_id);
  const quotient = eligible.length ? Math.floor(allocated / eligible.length) : 0;
  const remainder = eligible.length ? allocated % eligible.length : 0;
  eligible.forEach((person, index) => {
    person.base = feeMode === "COST_SHARING" ? quotient + Number(index < remainder) : person.unit_price;
    person.amount = Math.max(0, person.base - person.discount);
    if (!Number.isSafeInteger(person.amount) || person.amount > 100_000_000) throw new Error("Invalid calculated VND amount");
    person.explanation = feeMode === "COST_SHARING" ? "Chia đều tới 1đ; thứ tự ID nhận phần dư" : "Đơn giá đã công bố";
    if (person.left_at || person.arrived_at) person.explanation += "; đến muộn/về sớm không tự giảm phí";
  });
  return eligible.length;
}
