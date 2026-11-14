import Link from "next/link";
import { Activity } from "lucide-react";
export function PublicNavigation() {
  return <header className="border-b bg-white"><nav aria-label="Điều hướng chính" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4"><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-xl font-bold"><Activity className="text-primary" aria-hidden="true" />SportHost</Link><div className="flex flex-wrap items-center gap-1 sm:gap-3"><Link href="/tinh-nang" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold">Tính năng</Link><Link href="/bang-gia" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold">Free & Pro</Link><Link href="/login" className="inline-flex min-h-11 items-center px-3 font-semibold text-primary">Đăng nhập</Link></div></nav></header>;
}
export function PublicFooter() {
  return <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-sm text-muted-foreground"><span>SportHost · Bớt việc quản lý, thêm giờ ra sân.</span><Link className="inline-flex min-h-11 items-center underline" href="/tinh-nang">Tính năng</Link><Link className="inline-flex min-h-11 items-center underline" href="/bang-gia">Bảng giá Free & Pro</Link><Link className="inline-flex min-h-11 items-center underline" href="/me/login">Dành cho người chơi</Link></footer>;
}
