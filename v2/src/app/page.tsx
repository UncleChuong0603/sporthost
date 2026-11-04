import Link from "next/link";
import { Activity, ArrowRight, CalendarDays, UsersRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";
export default function Home() {
  return <>
    <header className="border-b bg-white"><nav aria-label="Điều hướng chính" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4"><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-xl font-bold"><Activity className="text-primary" aria-hidden="true" />SportHost</Link><Link href="/login" className="inline-flex min-h-11 items-center px-3 font-semibold text-primary">Đăng nhập host</Link></nav></header>
    <main id="main" className="mx-auto max-w-6xl px-5 py-10 sm:py-16">
      <section className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div><p className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">Hẹn sân dễ dàng, thu chi rõ ràng</p><h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Giữ nhịp câu lạc bộ.<br /><span className="text-primary">Dành giờ cho cuộc chơi.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Từ lịch hẹn, đăng ký và điểm danh đến từng khoản đóng. Host và người chơi cùng theo dõi trong một nơi.</p><Button asChild className="mt-7"><Link href="/signup">Bắt đầu tổ chức CLB<ArrowRight aria-hidden="true" /></Link></Button></div>
        <section aria-label="Không gian người chơi" className="rounded-2xl border bg-white p-6 sm:p-8"><UsersRound className="mb-4 size-8 text-primary" aria-hidden="true" /><h2 className="text-2xl font-bold">Bạn đến để chơi?</h2><p className="my-4 leading-7 text-muted-foreground">Xem lời mời, đăng ký buổi chơi trong CLB đã liên kết và theo dõi khoản đóng của mình.</p><Button asChild variant="outline" className="w-full"><Link href="/me/login">Vào không gian người chơi<ArrowRight aria-hidden="true" /></Link></Button><Link href="/me/signup" className="mt-3 flex min-h-11 items-center justify-center text-sm font-semibold text-primary">Tạo tài khoản người chơi</Link><p className="mt-4 border-t pt-4 text-sm leading-6 text-muted-foreground">Có liên kết buổi chơi từ host? Mở trực tiếp liên kết để đăng ký, không cần tài khoản.</p></section>
      </section>
      <section aria-label="Từ buổi đầu đến thanh toán" className="mt-12 grid gap-5 sm:grid-cols-3">{[
        { Icon: CalendarDays, title: "1. Lên lịch & mời người", text: "Tạo CLB, chọn giờ và sân, gửi liên kết đăng ký hoặc lời mời cho thành viên." },
        { Icon: UsersRound, title: "2. Đăng ký & ra sân", text: "Quản lý cả nhóm, chờ chỗ, xác nhận tham gia và điểm danh từng người." },
        { Icon: Wallet, title: "3. Thanh toán rõ ràng", text: "Xem phí, chuyển khoản theo thông tin CLB và gửi biên nhận. Host đối soát tiền thực nhận." },
      ].map(({ Icon, title, text }) => <article key={title} className="rounded-2xl border bg-white p-6"><Icon aria-hidden="true" className="mb-4 size-6 text-primary" /><h2 className="font-bold">{title}</h2><p className="mt-3 text-sm leading-7 text-muted-foreground">{text}</p></article>)}</section>
      <section className="mt-10 rounded-2xl border p-6"><h2 className="font-bold">Kết nối với CLB của bạn</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">Người chơi tạo tài khoản và xác minh email, sau đó gửi email cho chủ CLB để liên kết hồ sơ. Bạn sẽ thấy lịch tham gia và thanh toán của mình sau khi host xác nhận.</p></section>
    </main><footer className="mx-auto max-w-6xl px-5 pb-8 text-sm text-muted-foreground">SportHost · Dành thêm thời gian cho những trận đấu.</footer>
  </>;
}
