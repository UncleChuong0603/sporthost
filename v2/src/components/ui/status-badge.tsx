import { cn } from "@/lib/utils";
import { bookingLabels, lifecycleLabels } from "@/domain/status";

const tones: Record<string, string> = {
  confirmed: "border-teal-200 bg-teal-50 text-primary", OPEN: "border-teal-200 bg-teal-50 text-primary", SETTLED: "border-teal-200 bg-teal-50 text-primary",
  pending: "border-amber-200 bg-amber-50 text-amber-900", reported: "border-amber-200 bg-amber-50 text-amber-900", waitlist: "border-amber-200 bg-amber-50 text-amber-900",
  invited: "border-blue-200 bg-blue-50 text-blue-800", IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-800",
  rejected: "border-red-200 bg-red-50 text-destructive", cancelled: "border-slate-200 bg-muted text-muted-foreground", CANCELLED: "border-slate-200 bg-muted text-muted-foreground",
};
export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", tones[status] || "border-border bg-muted text-muted-foreground", className)}><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />{label || bookingLabels[status] || lifecycleLabels[status] || status}</span>;
}
