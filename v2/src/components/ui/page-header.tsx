import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({ title, description, eyebrow, back, action }: { title: string; description?: string; eyebrow?: string; back?: { href: string; label: string }; action?: React.ReactNode }) {
  return <header className="mb-7 sm:mb-8">
    {back && <Link href={back.href} className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"><ChevronLeft className="size-4" aria-hidden="true" />{back.label}</Link>}
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1">
      {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</p>}
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">{description}</p>}
    </div>{action && <div className="shrink-0">{action}</div>}</div>
  </header>;
}
