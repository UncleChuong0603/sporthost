# SportHost — bản beta đầy đủ

## Đã triển khai

- Sidebar host, tổng quan, lịch, thành viên, thu chi, CLB/cài đặt; menu mobile, tìm kiếm, bộ lọc và tab.
- Lịch lặp hằng tuần, tạo trước 2–12 tuần, gia hạn tối đa 52 tuần, dừng lặp; tạo lại không trùng buổi.
- Link RSVP riêng cho member, hạn RSVP, ưu tiên member trước vãng lai; tự đôn danh sách chờ khi có chỗ phù hợp.
- Phí chung và phí nam/nữ cho từng loại member; giới hạn tổng và giới hạn nam/nữ tùy chọn.
- Vãng lai nhập số điện thoại trước, tự điền trong đúng CLB, chờ xác nhận rồi host duyệt.
- QR ngân hàng do host upload, không gọi VietQR API. Giữ phiên bản ảnh cho booking/phí tháng.
- Biên nhận riêng tư, host duyệt/từ chối và người chơi gửi lại; upload không tự ghi nhận đã thu.
- Phí tháng hàng loạt theo giới tính, không trùng kỳ; chi phí, ghi nhận hoàn tiền và CSV.
- Đồng quản lý: vai trò điều hành hoặc thu chi; lịch sử các thao tác quan trọng.
- Đổi mật khẩu thu hồi phiên cũ; token xác minh/khôi phục mật khẩu dùng một lần, hết hạn 30 phút.
- Rate limit trong PostgreSQL dùng chung giữa các instance; CSRF và phân tách dữ liệu CLB.
- Trang quản trị, gia hạn Pro trial; beta mở miễn phí, không thu phí phần mềm.
- Backup/restore dữ liệu và ảnh, phục hồi vào schema riêng; công cụ retention biên nhận bị từ chối.

## Cấu hình và giới hạn

- Vercel + Neon Singapore, schema riêng `clubhost`, migration `0004_full_roadmap`; kho ảnh Vercel Blob **private**.
- Admin theo chỉ định: `lovetobangbang@gmail.com`. Operator cấp quyền cho tài khoản đã có bằng `scripts.admin`.
- **Email thật chưa bật:** cần SMTP và địa chỉ gửi hợp lệ. Đổi mật khẩu trong phiên đăng nhập vẫn dùng được.
- Chưa cài lịch backup/retention tự động, email nhắc RSVP hay kiểm thử tải lớn; xem [vận hành](OPERATIONS.md).
- Không sửa database/VPS của ứng dụng khác.

## Quy tắc sản phẩm

- Tổng chỗ được kiểm tra dưới khóa hàng buổi đánh. Giới hạn nam/nữ nằm trong tổng này; trống = không giới hạn riêng, 0 = không nhận nhóm đó.
- Nếu có giới hạn giới tính, host cần bổ sung giới tính cho hồ sơ chưa cập nhật trước khi xác nhận chỗ.
- Booking giữ phí và giới tính xếp chỗ. Sửa hồ sơ không đổi phí hay nhóm chỗ đã xác nhận; booking chưa xác nhận cập nhật nhóm theo hồ sơ.
- QR là ảnh tĩnh; số tiền/nội dung hiển thị riêng. Người chơi tự kiểm tra người nhận trong ứng dụng ngân hàng.
- Link RSVP/thanh toán là link riêng có mã ngẫu nhiên. Biết số điện thoại không lấy được link thanh toán của người khác.
- Hủy buổi/booking giữ khoản đã thu để đối soát. Nút hoàn tiền ghi nhận khoản host đã thực sự hoàn, không tự chuyển tiền.
- Dừng lịch lặp giữ các buổi đã tạo; host hủy từng buổi nếu cần.
- Pro trial mở toàn bộ tính năng, không khóa CLB khi hết ngày hiển thị; chưa có cổng thu phí SaaS.

## Kiểm chứng

46 bài kiểm thử tự động bao phủ luồng cũ/mới, phân quyền, hạn mức, RSVP, thanh toán và token tài khoản.
Kiểm thử riêng trên PostgreSQL thật, private Blob thật, backup/restore đối chiếu bản ghi và SHA-256;
Edge/Playwright desktop và mobile 375px kiểm tra sidebar, tab, bộ lọc và tràn ngang.
Số điện thoại chưa xác minh bằng OTP; đây chưa phải kiểm thử tải lớn.
