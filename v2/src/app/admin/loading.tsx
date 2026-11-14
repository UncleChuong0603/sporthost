export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Đang tải dữ liệu quản trị"
      className="space-y-5 animate-pulse"
    >
      <div className="h-10 w-60 rounded-lg bg-border" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl border bg-background" />
        ))}
      </div>
      <div className="h-96 rounded-2xl border bg-background" />
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
