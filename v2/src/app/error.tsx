"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main id="main" className="mx-auto max-w-lg px-6 py-20"><h1 className="text-2xl font-bold">Tạm thời chưa tải được thông tin</h1><p className="my-5 text-muted-foreground">Vui lòng kiểm tra lại trạng thái trước khi gửi lại thao tác. Dữ liệu vừa thay đổi có thể cần một lúc để hiển thị.</p><Button onClick={reset}>Thử tải lại</Button></main>;
}
