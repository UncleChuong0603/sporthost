"use client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main id="main" className="mx-auto max-w-lg px-6 py-16"><section aria-label="Lỗi tải trang" role="alert" className="rounded-2xl border bg-white p-6"><h1 className="text-2xl font-bold">Tạm thời chưa tải được thông tin</h1><p className="my-5 text-muted-foreground">Vui lòng kiểm tra lại trạng thái trước khi gửi lại thao tác. Dữ liệu vừa thay đổi có thể cần một lúc để hiển thị.</p><div className="flex flex-wrap gap-3"><Button onClick={reset}>Thử tải lại</Button><Button asChild variant="outline"><Link href="/">Về trang chủ</Link></Button></div></section></main>;
}
