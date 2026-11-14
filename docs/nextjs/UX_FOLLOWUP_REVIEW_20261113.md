# Rà soát sau đợt UX đầu — 13/11/2026

> Cập nhật triển khai đợt 2: đã sửa giữ bản nháp khi đổi CLB/lỗi server, theo dõi tiền thừa, giữ ngữ cảnh CLB và thêm yêu cầu kết nối người chơi trên Free. Chi tiết hành vi, migration và kiểm chứng được ghi trong [Club connection requests](CLUB_CONNECTIONS.md). Các mục còn lại bên dưới là backlog; phần kết luận “review chỉ thêm tài liệu” mô tả thời điểm review ban đầu.

Review mã nguồn đang có trong workspace và các luồng đã kiểm chứng ở đợt trước. Phần admin đang thay đổi song song không thuộc phạm vi này. Đây không phải báo cáo analytics, nghiên cứu người dùng hoặc kiểm tra production.

## Cần sửa trước khi mở rộng tính năng

| Ưu tiên | Phát hiện | Tác động và thay đổi đề xuất |
| --- | --- | --- |
| Cao | Form tạo buổi có `key={clubId}` trên toàn bộ ActionForm | Đổi CLB tạo lại form, xóa nội dung các trường chưa lưu. Giữ tên, sân, ngày giờ và phần người dùng đã nhập; cập nhật riêng các mặc định thuộc CLB và giải thích thay đổi mức phí. |
| Cao | ActionForm chưa có cơ chế giữ giá trị sau lỗi nghiệp vụ | Server action bắt lỗi rồi trả `{error}`, còn các trường phần lớn uncontrolled. Cần kiểm tra trường hợp server từ chối vì giới hạn nam/nữ vượt sức chứa hoặc hạn đăng ký sai; giữ nguyên bản nháp và đưa focus đến lỗi. Không chỉ thử trường hợp thiếu `required` do trình duyệt chặn. |
| Cao | Dashboard chưa theo dõi tiền thừa/cần hoàn | Balance đã tính `credit` và trang billing đã hiển thị, nhưng ledger/dashboard chỉ lấy tiền thực nhận và khoản còn thiếu. Thêm nhóm “Tiền thừa / cần xử lý” với người trả, buổi và số tiền; dẫn đến billing. Không tự quyết định hoàn hoặc tự ghi nhận hoàn tiền. |
| Vừa | Ngữ cảnh CLB bị mất ở trang buổi chơi | Navigation chỉ lấy CLB từ `/clubs/:id` hoặc `club_id`; danh sách mở `/games/:id` không mang bộ lọc và nút quay lại dùng `/schedule`. Cần giữ ngữ cảnh xuyên danh sách → chi tiết → quay lại; phần thu chi của buổi nên đánh dấu Thu chi. |
| Vừa | Luồng nâng cấp chưa đưa người dùng về tác vụ/bản nháp | Form dẫn sang subscription, checkout quay về subscription; chưa thấy lưu bản nháp hoặc return destination. Sau nâng cấp, quay về form/lịch cần gia hạn với dữ liệu đã nhập. Chỉ chấp nhận đường dẫn nội bộ hợp lệ. |
| Vừa | Dashboard/lịch còn đọc nhiều lịch sử và truy vấn theo từng buổi | `listSessions` đọc toàn bộ buổi rồi gọi seatCounts cho mỗi buổi; ledger đi qua lịch sử từng buổi, dashboard dựng nhiều nhóm chưa phân trang. Thêm giới hạn danh sách, “Xem tất cả”, tổng số độc lập và tổng hợp truy vấn. Đây là rủi ro khi dữ liệu tăng, chưa có đo đạc để kết luận bản live chậm. |

Nguồn:

- [Form tạo buổi](../../v2/src/features/scheduling/session-form.tsx), [ActionForm](../../v2/src/features/shared/action-form.tsx), [server action](../../v2/src/app/(workspace)/schedule/actions.ts), [validation](../../v2/src/domain/session-policy.ts).
- [Số dư theo người trả](../../v2/src/server/modules/finance/queries.ts), [ledger](../../v2/src/server/modules/finance/ledger.ts), [dashboard](../../v2/src/server/modules/clubs/dashboard.ts), [billing](../../v2/src/app/(workspace)/games/[gameId]/billing/page.tsx).
- [Điều hướng workspace](../../v2/src/features/clubs/workspace-navigation.tsx), [danh sách lịch](../../v2/src/app/(workspace)/schedule/page.tsx), [trang buổi](../../v2/src/app/(workspace)/games/[gameId]/page.tsx), [checkout actions](../../v2/src/app/(workspace)/clubs/[clubId]/subscription/actions.ts).
- [Truy vấn lịch](../../v2/src/server/modules/scheduling/service.ts).

React mô tả việc reset các trường uncontrolled sau action hoàn tất và cách giữ giá trị bằng state: [form actions](https://react.dev/reference/react-dom/components/form#preserving-form-values-after-an-action). Với trường hợp trả lỗi nghiệp vụ, nên có kiểm chứng trình duyệt riêng trước khi chọn cách sửa. Hướng dẫn UX cũng yêu cầu giữ đầu vào khi báo lỗi: [NN/g error-message rubric](https://www.nngroup.com/articles/error-messages-scoring-rubric/).

## Feature nên build tiếp

1. **Free — kết nối CLB bằng link mời hoặc yêu cầu trong app.** Người chơi xác minh email, gửi yêu cầu, chủ CLB xác nhận hồ sơ. Có trạng thái chờ/từ chối và hành động tiếp theo. Không tự ghép người theo số điện thoại hoặc tên. Đây vẫn là điểm nghẽn chính của onboarding trong `/me`.
2. **Free — thông báo trạng thái quan trọng.** Duyệt/từ chối đăng ký, được lên từ danh sách chờ, đổi giờ/hủy buổi, kết quả kiểm tra biên nhận. Một hộp thông báo trong app có liên kết đúng tài nguyên, đã đọc/chưa đọc; khách vẫn dùng liên kết riêng hiện tại.
3. **Pro — nhắc việc tự động.** MVP là nhắc xác nhận tham gia và khoản đã phát hành còn thiếu, dùng email cho tài khoản đã liên kết/xác minh và đồng ý nhận. Có xem trước đối tượng, cấu hình thời gian, tắt nhắc, lịch sử gửi, chống gửi trùng và kiểm tra lại trạng thái trước gửi. Chưa thu tiền thì mới nhắc; ảnh biên nhận không phải bằng chứng đã nhận tiền. Khách không có email được host gửi mẫu tin thủ công.
4. **Free — tiện ích thanh toán và lịch cá nhân.** Thêm sao chép số tài khoản/nội dung chuyển khoản, lưu một buổi vào lịch. Hiện trang thanh toán chủ yếu hiển thị thông tin và mở ảnh QR. Tải một sự kiện cần thời điểm kết thúc/thời lượng hợp lệ; feed đồng bộ lịch là phạm vi khác.
5. **Pro — sửa các buổi tương lai trong một chuỗi.** Đổi sân/giờ, bỏ ngày nghỉ, xem trước phạm vi ảnh hưởng; giữ lịch sử và thông tin phí đã được chấp nhận. Hiện lịch lặp tạo/gia hạn được, chưa có trải nghiệm sửa cả chuỗi. Làm sau MVP nhắc việc.

## Thiếu đo lường để chọn feature tiếp theo

Chưa thấy instrumentation cho hành vi sản phẩm trong source đã rà; audit nghiệp vụ hiện tại không thay thế hoàn toàn số liệu funnel. Nên đo:

- Tạo CLB → tạo buổi → nhận đăng ký đầu.
- Xác minh email → gửi yêu cầu kết nối → được duyệt.
- Mở tác vụ Pro → bắt đầu checkout → provider xác nhận → quay lại hoàn tất tác vụ.
- Sử dụng tính năng Pro hàng tuần và gia hạn kỳ trả phí kế tiếp.

Không gửi tên, email, điện thoại, ảnh hoặc link riêng vào analytics. Chưa cần đổi giá, giới hạn thành viên hay thêm gói mới khi chưa có baseline.

## Đề xuất đợt kế tiếp

**Giữ bản nháp khi đổi CLB/báo lỗi + theo dõi tiền thừa + giữ ngữ cảnh CLB**, sau đó **kết nối CLB trong app**. Tiếp theo triển khai thông báo và hạ tầng gửi bền vững trước nhắc việc Pro. Không cần thêm chat riêng, AI hoặc giải đấu để giải quyết các điểm nghẽn này.

Review chỉ thêm tài liệu; chưa sửa runtime code hoặc deploy. Các kết quả 214 test/build và trình duyệt trong review ngày 12/11 là bằng chứng của đợt UX trước, không phải kết quả chạy lại toàn bộ cây mã hiện đang thay đổi. Thử kiểm chứng form bằng standalone cục bộ dừng vì trang signup không tải xong trong 15 giây; chưa kiểm chứng runtime hai trường hợp mất bản nháp ở review này. Phát hiện đổi CLB dựa trên việc thay React key trong source; trường hợp lỗi action được giữ là rủi ro cần kiểm chứng, không báo là lỗi đã tái hiện.
