// Shared, serializable contracts only. Authority and evidence live on the server.
export type TourCapability = "owner" | "manage_session" | "manage_bookings" | "check_in" | "manage_finance";
export type TourContext = { clubId: number | null; sessionId: number | null; shareSessionId: number | null; billingSessionId: number | null };
type Mission = {
  id: string; title: string; copy: string; target: string; group: "setup" | "advanced";
  capability: TourCapability; pro?: boolean; prerequisites: readonly string[];
  trigger: "saved-record" | "share-success"; completion: string;
  route: (context: TourContext) => string;
};
const clubRoute = (c: TourContext) => c.clubId ? `/clubs/${c.clubId}` : "/clubs/new";
const sessionRoute = (c: TourContext) => c.sessionId ? `/games/${c.sessionId}` : `/schedule/new?club_id=${c.clubId ?? ""}`;
const billingRoute = (c: TourContext) => c.billingSessionId ? `/games/${c.billingSessionId}/billing` : sessionRoute(c);
export const missions = [
  { id: "club", title: "Tạo CLB của bạn", copy: "Đặt tên, chọn môn và khu vực rồi lưu CLB thật. Bạn có thể sửa các thiết lập sau.", target: "club-name", group: "setup", capability: "owner", prerequisites: [], trigger: "saved-record", completion: "club", route: clubRoute },
  { id: "session", title: "Tạo buổi chơi đầu tiên", copy: "Nhập tên, giờ và sức chứa cho buổi chơi sắp tổ chức. Kiểm tra phí rồi bấm Tạo buổi chơi. Buổi lẻ dùng được trên Free.", target: "session-title", group: "setup", capability: "manage_session", prerequisites: ["club"], trigger: "saved-record", completion: "session", route: (c: TourContext) => `/schedule/new?club_id=${c.clubId ?? ""}` },
  { id: "share", title: "Sẵn sàng mời người chơi", copy: "Sao chép liên kết hoặc chia sẻ lời mời rồi gửi vào nhóm của CLB. Chỉ ghi nhận khi sao chép/chia sẻ thành công; người chơi không cần tài khoản.", target: "session-share", group: "setup", capability: "manage_bookings", prerequisites: ["session"], trigger: "share-success", completion: "share", route: (c: TourContext) => c.shareSessionId ? `/games/${c.shareSessionId}` : sessionRoute(c) },
  { id: "members", title: "Quản lý thành viên", copy: "Thêm một người chơi thật với số điện thoại chính xác. Chọn Cố định hoặc Vãng lai; mở từng hồ sơ để sửa thông tin.", target: "member-name", group: "advanced", capability: "manage_bookings", prerequisites: ["club"], trigger: "saved-record", completion: "members", route: (c: TourContext) => `/members?club_id=${c.clubId}` },
  { id: "payment", title: "Thiết lập nhận tiền", copy: "Lưu ngân hàng, số tài khoản và chủ tài khoản hoặc tải QR của CLB. Đăng ký mới dùng thiết lập mới; khoản cũ giữ thông tin đã nhận.", target: "club-payment", group: "advanced", capability: "manage_finance", prerequisites: ["club"], trigger: "saved-record", completion: "payment", route: (c: TourContext) => `${clubRoute(c)}#payment` },
  { id: "invitations", title: "Mời thành viên cố định", copy: "Khi đã có thành viên cố định và buổi đang mở, tạo link RSVP để họ phản hồi. Chỉ gửi lời mời cho người thực sự tham gia CLB.", target: "session-invitations", group: "advanced", capability: "manage_bookings", prerequisites: ["members", "session"], trigger: "saved-record", completion: "invitations", route: (c: TourContext) => c.shareSessionId ? `/games/${c.shareSessionId}` : sessionRoute(c) },
  { id: "bookings", title: "Quản lý đăng ký", copy: "Theo dõi người đăng ký thật, duyệt nhóm hoặc danh sách chờ theo sức chứa. Liên kết riêng dành cho đúng người chơi; có thể cấp lại hoặc thu hồi.", target: "session-roster", group: "advanced", capability: "manage_bookings", prerequisites: ["session"], trigger: "saved-record", completion: "bookings", route: sessionRoute },
  { id: "attendance", title: "Điểm danh tại sân", copy: "Đánh dấu Có mặt hoặc Vắng mặt theo thực tế. Có thể ghi người về sớm hoặc thay người với lý do. Không điểm danh thử để hoàn thành nhiệm vụ.", target: "session-roster", group: "advanced", capability: "check_in", prerequisites: ["session"], trigger: "saved-record", completion: "attendance", route: sessionRoute },
  { id: "billing", title: "Phát hành tiền cần đóng", copy: "Sau buổi thật, kiểm tra điểm danh, chi phí và miễn giảm trước khi phát hành. Phát hành khóa bản nháp; điều chỉnh sau đó cần lý do. Chưa phát sinh thì để nhiệm vụ này lại.", target: "session-billing", group: "advanced", capability: "manage_finance", prerequisites: ["session"], trigger: "saved-record", completion: "billing", route: billingRoute },
  { id: "receipt", title: "Ghi nhận khoản thực nhận", copy: "Chỉ ghi khi CLB thực sự nhận tiền. Biên nhận người chơi gửi chưa phải tiền đã nhận. Hoàn hoặc đảo giao dịch cần đối soát; chốt sổ vẫn có thể còn nợ.", target: "session-billing", group: "advanced", capability: "manage_finance", prerequisites: ["billing"], trigger: "saved-record", completion: "receipt", route: billingRoute },
  { id: "monthly", title: "Theo dõi phí tháng", copy: "Tạo phí tháng đúng thành viên, kỳ và số tiền thực tế. Xem khoản còn thu và xuất Excel khi cần. Nếu CLB không thu phí tháng, bạn có thể bỏ qua.", target: "club-ledger", group: "advanced", capability: "manage_finance", prerequisites: ["members"], trigger: "saved-record", completion: "monthly", route: (c: TourContext) => `/finance?club_id=${c.clubId}` },
  { id: "proofs", title: "Đối soát biên nhận", copy: "Mở biên nhận thật, kiểm tra ngân hàng rồi xác nhận hoặc từ chối kèm ghi chú. Không xác nhận chỉ để thử hướng dẫn.", target: "proof-review", group: "advanced", capability: "manage_finance", prerequisites: ["club"], trigger: "saved-record", completion: "proofs", route: (c: TourContext) => `/payments/review?club_id=${c.clubId}` },
  { id: "connections", title: "Kết nối tài khoản người chơi", copy: "Chia sẻ lời mời kết nối, kiểm tra yêu cầu rồi chọn đúng hồ sơ thành viên. Người chơi cần xác minh email; hệ thống không tự ghép người cùng tên.", target: "club-connections", group: "advanced", capability: "owner", prerequisites: ["members"], trigger: "saved-record", completion: "connections", route: (c: TourContext) => `/clubs/${c.clubId}/connections` },
  { id: "recurrence", title: "Tạo lịch hàng tuần", copy: "Mở Lặp lịch hàng tuần, chọn số tuần phù hợp rồi tạo lịch thật. Quản lý gia hạn hoặc dừng từ Lịch chơi; dừng giữ các buổi đã tạo.", target: "session-recurrence", group: "advanced", capability: "manage_session", pro: true, prerequisites: ["club"], trigger: "saved-record", completion: "recurrence", route: (c: TourContext) => `/schedule/new?club_id=${c.clubId}` },
  { id: "access", title: "Mời đồng quản lý", copy: "Nhập email đúng người và chỉ cấp các quyền cần thiết. Bạn có thể thu hồi tại đây. Nhiệm vụ chỉ hoàn tất khi có đồng quản lý thật.", target: "club-access", group: "advanced", capability: "owner", pro: true, prerequisites: ["club"], trigger: "saved-record", completion: "access", route: (c: TourContext) => `/clubs/${c.clubId}/access` },
  { id: "reminders", title: "Bật nhắc việc phù hợp", copy: "Chọn nhắc RSVP, nợ buổi hoặc phí tháng rồi lưu. Phí tháng có ngày bắt đầu và khoảng cách nhắc riêng. Chỉ thông báo trong ứng dụng cho người đã đồng ý nhận loại nhắc đó.", target: "club-reminders", group: "advanced", capability: "owner", pro: true, prerequisites: ["club"], trigger: "saved-record", completion: "reminders", route: (c: TourContext) => `/clubs/${c.clubId}/reminders` },
] as const satisfies readonly Mission[];
export type MissionId = typeof missions[number]["id"];
export type MissionProgress = { id: MissionId; done: boolean; skipped: boolean; available: boolean; reason: string | null };
export type TourSnapshot = {
  revision: number; status: "new" | "active" | "paused" | "dismissed"; missionId: MissionId | null;
  context: TourContext; clubs: { id: number; name: string }[]; progress: MissionProgress[];
};
export function missionById(id: string) { return missions.find(m => m.id === id); }
export function nextSetup(snapshot: TourSnapshot) {
  return missions.find(m => m.group === "setup" && snapshot.progress.some(p => p.id === m.id && !p.done && !p.skipped && p.available));
}
export function setupComplete(snapshot: TourSnapshot) {
  return missions.filter(m => m.group === "setup").every(m => snapshot.progress.some(p => p.id === m.id && p.done));
}
