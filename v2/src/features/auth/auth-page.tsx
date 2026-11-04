import { CalendarDays, CircleDollarSign, UsersRound, Activity } from "lucide-react";
import { AuthForm } from "./auth-form";
import { sessionCookie, makeCsrf } from "@/server/auth/session";
import { currentHost } from "@/server/auth/service";
import { redirect } from "next/navigation";
import Link from "next/link";

export async function AuthPage({ mode, audience = "host", message }: { mode: "login" | "signup"; audience?: "host" | "member"; message?: string }) {
  if (await currentHost()) redirect(audience === "member" ? "/me" : "/dashboard");
  const csrf = makeCsrf(await sessionCookie());
  const notice = message === "reset" ? "Đã đặt lại mật khẩu. Đăng nhập bằng mật khẩu mới." : message === "verified" ? "Email đã được xác minh. Bạn có thể đăng nhập." : "";
  return <main id="main" className="grid min-h-dvh lg:grid-cols-2">
    <section className="relative flex flex-col justify-between overflow-hidden bg-[#142d35] px-6 py-8 text-white sm:px-12 lg:px-16 lg:py-12">
      <div className="flex items-center gap-3 text-xl font-bold tracking-tight"><span className="flex size-10 items-center justify-center rounded-xl bg-[#087f6b]"><Activity aria-hidden="true" className="size-6" /></span>SportHost</div>
      <div className="max-w-lg py-12 lg:py-20"><p className="mb-5 text-xs font-semibold uppercase tracking-[.2em] text-teal-200">{audience === "member" ? "Dành thời gian cho cuộc chơi" : "Dành cho người giữ nhịp cuộc chơi"}</p><h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{audience === "member" ? "Rõ lịch hẹn." : "Quản lý gọn hơn."}<br /><span className="text-teal-200">Chơi vui hơn.</span></h1><p className="mt-6 max-w-md text-base leading-7 text-slate-200">{audience === "member" ? "Xác nhận lời mời, theo dõi buổi chơi và khoản đóng của bạn — cùng một nơi, trong tầm tay." : "Lịch chơi, thành viên và thu chi câu lạc bộ — cùng một nơi, trong tầm tay."}</p>
        <div className="mt-10 hidden gap-6 sm:grid">{[[CalendarDays,audience === "member" ? "Lịch tham gia của riêng bạn" : "Rõ lịch, đủ người"],[UsersRound,audience === "member" ? "Trả lời lời mời từ CLB" : "Dễ quản lý thành viên"],[CircleDollarSign,audience === "member" ? "Theo dõi từng khoản thanh toán" : "Minh bạch từng khoản thu chi"]].map(([Icon, label], i) => { const Glyph = Icon as typeof CalendarDays; return <div key={i} className="flex items-center gap-3 text-sm text-slate-200"><Glyph className="size-5 text-teal-200" aria-hidden="true" /><span>{label as string}</span></div>; })}</div>
      </div><p className="hidden text-sm text-slate-300 lg:block">Dành thêm thời gian cho những trận đấu.</p>
    </section>
    <section className="flex items-center justify-center px-6 py-10 sm:px-12 lg:py-16"><div className="w-full max-w-sm"><p className="mb-3 text-xs font-bold uppercase tracking-widest text-primary">{audience === "member" ? "Không gian người chơi" : "Không gian của host"}</p><h2 className="text-3xl font-bold tracking-tight">{mode === "signup" ? audience === "member" ? "Hẹn bạn ở buổi chơi tới" : "Bắt đầu câu lạc bộ của bạn" : "Chào mừng trở lại"}</h2><p className="mb-8 mt-3 text-muted-foreground">{audience === "member" ? "Lịch tham gia, lời mời và thanh toán của bạn, cùng một nơi." : mode === "signup" ? "Tạo tài khoản để quản lý lịch chơi và thành viên." : "Đăng nhập để tiếp tục quản lý câu lạc bộ."}</p>{notice && <p role="status" className="mb-5 rounded-lg bg-teal-50 p-3 text-sm text-primary">{notice}</p>}<AuthForm mode={mode} csrf={csrf} audience={audience} /><Link className="mt-5 flex min-h-11 items-center justify-center text-sm font-semibold text-primary" href={audience === "member" ? "/login" : "/me/login"}>{audience === "member" ? "Tôi là host / chủ CLB" : "Tôi là người chơi"}</Link></div></section>
  </main>;
}
