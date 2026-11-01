# SportHost — các tình huống nghiệm thu bắt buộc

Nguồn: mục F của action plan 01/11/2026. Trạng thái dưới đây là **điều kiện nghiệm thu**,
không phải khẳng định đã chạy. Chỉ dùng tài khoản/ảnh/dữ liệu thử và DB/schema riêng.
Xem test commands và bằng chứng thực chạy trong SPORT_HOST_TESTING / SPRINT_REPORT.

## F-01: buổi cầu lông 15 người

1. Host tạo CLB cầu lông, chọn môn, tải QR tĩnh, MANUAL_APPROVE, AA hoặc giá cố định.
2. Tạo 8 thành viên cố định và buổi tối thứ Sáu, sức chứa 15; chia sẻ public link Facebook.
3. Có 10 vãng lai đăng ký không tài khoản; ít nhất một booking gồm 3 người. Host nhận đúng
   7 người, 3 người còn lại vào danh sách chờ. Đếm theo người, tổng confirmed không vượt 15.
4. Một khách hủy; host nhận từ waitlist. Không overbook, không tách nhóm ngầm, trạng thái khách rõ.
5. Bắt đầu buổi: một NO_SHOW, một walk-in, một người về sớm. Điểm danh riêng từng người;
   tổng thực đến được cập nhật, mọi override sức chứa phải có quyền/lý do/audit.
6. Kết thúc đánh khác chốt sổ. Nhập tiền sân/tiền cầu; draft phân bổ minh bạch, member đóng
   tháng không bị thu trùng. Phát hành charges đúng một lần và giữ calculation snapshot.
7. Khách A trả đủ chuyển khoản, B tiền mặt, C trả thiếu, D chỉ upload ảnh chưa có tiền.
   Chỉ khoản thực nhận được host tài chính xác nhận. D vẫn còn nợ; không có false paid.
8. Chốt sổ khi còn công nợ; tổng chi/phải thu/đã thu/còn nợ/chênh lệch khớp. Khách chỉ xem
   nghĩa vụ của mình qua link riêng; host tiếp tục thu nợ sau chốt.

## Ma trận mở rộng

| ID | Tình huống / bước | Kết quả phải đạt | Sprint |
| --- | --- | --- | --- |
| F-02 | Hai connection PostgreSQL tranh 1 chỗ cùng lúc | Chỉ 1 người confirmed, slot không âm; test SQLite không thay thế | 2 |
| F-03 | Nhóm 3 người khi chỉ còn 2 chỗ | Toàn nhóm chờ/không nhận, không duyệt ngầm 2/3 | 2 |
| F-04 | Booking đã duyệt tăng 2→3, có/không còn chỗ | Kiểm tra capacity + tái duyệt; tên từng người và payer không trùng | 2 |
| F-05 | Hủy trước hạn và sát hạn | Theo policy snapshot đã công bố, trả chỗ đúng một lần | 2 |
| F-06 | Host đổi giờ/sân hoặc hủy cả buổi | Link khách phản ánh thông tin mới; tiền đã thu được giữ và hoàn thủ công có log | 2/4 |
| F-07 | Đăng ký 3, chỉ 2 đến; thay người; về sớm | Attendance per participant, no-show khác NOT_MARKED, log cơ sở tính phí | 3 |
| F-08 | Host thêm walk-in hoặc 2 co-host cùng điểm danh | Kiểm tra sức chứa/quyền, cập nhật không ghi đè mất dữ liệu | 3 |
| F-09 | Vắng mặt nhưng policy có/không thu | Không tự chia đều cho mọi booking; chính sách đã công bố được giữ | 4 |
| F-10 | AA chi phí không chia hết, có miễn giảm | Quy tắc làm tròn rõ, số dư được ghi nhận, tổng đối soát không mất VND | 4 |
| F-11 | Fixed price với chi phí cao hơn tổng phải thu | Hiển thị lỗ chính xác, tách expected revenue và thực thu | 4 |
| F-12 | Member đóng tháng và khách cùng buổi | Nghĩa vụ tháng riêng, không thu hai lần phần đã được bao gồm | 4 |
| F-13 | Nhóm 3 trả chung / tách từng người | Chỉ một cách ghi nghĩa vụ, không cộng cả booking và participants | 4 |
| F-14 | Bank + cash nhiều lần, thiếu/đủ/thừa | Balance tính từ charges và movements; từng receipt có actor/time/source | 4 |
| F-15 | Ảnh giả, nhầm ngân hàng, gửi lại sau từ chối | Chỉ REPORTED; host duyệt/từ chối rõ, proof private | 4 |
| F-16 | Double upload/review/issue, retry khi mất mạng | Không nhân charges/receipts/chỗ; transaction rollback khi lỗi | 2/4/6 |
| F-17 | Refund/reversal sau overpay | Hoàn thủ công có log, không tự chuyển khoản và không xóa receipt cũ | 4 |
| F-18 | Thay attendance/expense sau issue hoặc settle | Bị khóa hoặc adjustment có lý do/phiên bản, không đổi tiền ngầm | 3/4/5 |
| F-19 | Chốt sổ còn nợ, thu sau chốt | Snapshot không đổi; outstanding giảm theo khoản thực nhận | 5 |
| F-20 | Host A GET/POST tài nguyên CLB B (IDs giả) | Backend từ chối mọi route, upload/download/export; không lộ PII/tài chính | 1–6 |
| F-21 | User/guest A thử proof/link quản lý B | Không lấy link bằng ID/điện thoại; token sai/hết hạn/thu hồi bị từ chối | 2/6 |
| F-22 | Co-host thiếu quyền duyệt/điểm danh/thu chi/settings | Backend chặn, UI hiển thị tương ứng; platform admin không mặc nhiên sửa CLB | 5 |
| F-23 | Mất DB/SSH tunnel giữa transaction rồi retry | Lỗi an toàn không lộ credentials, không tạo chỗ/giao dịch trùng | 2/4/6 |
| F-24 | Đổi QR/tài khoản host sau phát hành khoản thu | Ảnh QR và bank text cùng phiên bản cho booking/phí tháng | 4 |
| F-25 | Guest mở lại từ Facebook browser / trình duyệt mới | Có cách lưu link/khôi phục có xác thực; không trả link chỉ theo điện thoại | 2/6 |
| F-26 | Club cũ migrate 0004→0005, chạy upgrade lại | Giữ IDs/sport cầu lông/phí/booking/dues, không sửa schema khác | 1 |
| F-27 | Tạo/sửa CLB các môn, form cũ, invalid input | Tiếng Việt, nhãn tiền cầu chỉ cầu lông, không xóa settings khi form thiếu field mới | 1 |
| F-28 | Màn hình 375px, ngang 812px, desktop; keyboard | Tạo/sửa/duyệt/điểm danh/thu/chốt dễ thao tác, không tràn trang, có trạng thái lỗi | 1/3/6 |
| F-29 | UTC lưu trữ, giờ Việt Nam, tiền VND | Asia/Ho_Chi_Minh, format dễ đọc, integer VND, không sai ngày khi qua nửa đêm | 6 |
| F-30 | Backup/restore DB + ảnh vào schema test khác | Dữ liệu/số dư/hash ảnh khớp; không ghi đè production hoặc schema khác | 6 |

## Mức bao phủ hiện tại

- Baseline 46 tests: booking đơn, host CRUD/isolation, RSVP/waitlist/quota, QR/proof manual,
  gender pricing snapshot, monthly dues, auth/reset và deployment config.
- S1 bổ sung: `test_club_settings.py`, `test_postgres_migrations.py`,
  `test_club_settings_browser.py`; trạng thái thực chạy ghi trong báo cáo sprint.
- F-01 đầy đủ và các case nhóm, ledger, chốt sổ vẫn pending theo dependencies; không
  dùng sự tồn tại của test checklist làm bằng chứng feature đã implement.
