import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() { return <main id="main" className="mx-auto max-w-lg px-6 py-20"><p className="text-sm font-semibold text-primary">404</p><h1 className="my-4 text-2xl font-bold">Không tìm thấy trang này</h1><p className="mb-6 text-muted-foreground">Link có thể chưa đúng, đã hết hạn hoặc bạn chưa có quyền truy cập. Kiểm tra lại liên kết từ host nếu bạn đang tìm buổi chơi.</p><Button asChild><Link href="/">Về trang chủ</Link></Button></main>; }
