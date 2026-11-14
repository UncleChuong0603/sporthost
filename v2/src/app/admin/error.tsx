"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert" className="rounded-2xl border bg-background p-8">
      <h1 className="text-2xl font-bold">Chưa tải được dữ liệu</h1>
      <p className="my-4 text-muted-foreground">
        Kiểm tra kết nối và quyền truy cập, sau đó thử lại.
      </p>
      <button
        className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white"
        onClick={reset}
      >
        Thử lại
      </button>
    </section>
  );
}
