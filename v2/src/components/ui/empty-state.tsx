import { Inbox } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <section className="rounded-2xl border bg-white px-5 py-10 text-center sm:py-14">
    <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted text-primary"><Inbox className="size-6" aria-hidden="true" /></span>
    <h2 className="text-lg font-bold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{description}</p>
    {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
  </section>;
}
