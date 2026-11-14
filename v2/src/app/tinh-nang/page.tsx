import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PublicNavigation, PublicFooter } from "@/features/marketing/public-navigation";
import { publicMetadata } from "@/server/seo";
export const dynamic = "force-dynamic";
export function generateMetadata() { return publicMetadata("/tinh-nang", "Tính năng quản lý câu lạc bộ thể thao | SportHost", "Tổ chức lịch chơi, đăng ký nhóm, danh sách chờ, điểm danh và đối soát thu chi CLB. Người chơi theo dõi lịch và khoản đóng trong SportHost."); }
const features = [
  ["Lịch chơi và đăng ký nhóm", "Tạo buổi chơi với giờ, địa điểm, sức chứa và chính sách rõ ràng. Chia sẻ liên kết để người chơi đăng ký cả nhóm; host duyệt và quản lý danh sách chờ."],
  ["Kết nối đúng thành viên", "Người chơi xác minh email, gửi yêu cầu kết nối và được chủ CLB liên kết với hồ sơ phù hợp. Sau đó, lịch tham gia và khoản đóng của họ xuất hiện trong không gian người chơi."],
  ["Điểm danh từng người", "Theo dõi người có mặt và vắng mặt trong mỗi nhóm. Áp dụng chính sách phí đã công bố khi tính tiền, miễn giảm và ghi nhận điều chỉnh có lý do."],
  ["Thu chi có đối soát", "Công bố khoản cần đóng, theo dõi tiền nhận, tiền hoàn và số còn thiếu. Người chơi sao chép thông tin chuyển khoản, gửi biên nhận để host kiểm tra với tiền thực nhận."],
  ["Thông báo trong ứng dụng", "Người chơi đã kết nối nhận cập nhật khi host xử lý đăng ký, có chỗ từ danh sách chờ, đổi hoặc hủy buổi chơi và đối soát biên nhận."],
  ["Pro cho CLB tổ chức thường xuyên", "Tạo lịch lặp, phân công cohost và bật nhắc việc trong ứng dụng cho người chơi đồng ý nhận. Kiểm tra phạm vi và giá gói tại trang Free & Pro."],
];
export default function Features() {
  return <><PublicNavigation /><main id="main" className="mx-auto max-w-6xl px-5 py-12 sm:py-16"><p className="font-semibold text-primary">Dành cho host và người chơi</p><h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">Quản lý câu lạc bộ thể thao từ lịch hẹn đến khoản đóng</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">SportHost tập trung công việc tổ chức vào một nơi để mỗi buổi chơi có danh sách rõ ràng, chính sách dễ xem và khoản thu có thể kiểm tra.</p><section aria-label="Các tính năng SportHost" className="mt-10 grid gap-5 sm:grid-cols-2">{features.map(([title, text]) => <article className="rounded-2xl border bg-white p-6" key={title}><h2 className="text-xl font-bold">{title}</h2><p className="mt-3 leading-7 text-muted-foreground">{text}</p></article>)}</section><section className="mt-10 rounded-2xl bg-sidebar p-6 text-white sm:p-8"><h2 className="text-2xl font-bold">Bắt đầu từ buổi chơi đầu tiên</h2><p className="my-4 leading-7">Tạo tài khoản host, tạo CLB rồi chia sẻ liên kết đăng ký. Người chơi có thể mở liên kết của host mà chưa cần tài khoản.</p><div className="flex flex-wrap gap-3"><Button asChild><Link href="/signup">Tạo CLB</Link></Button><Button variant="outline" asChild className="text-foreground"><Link href="/bang-gia">Xem Free & Pro</Link></Button></div></section></main><PublicFooter /></>;
}
