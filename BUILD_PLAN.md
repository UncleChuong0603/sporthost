# ClubHost — Roadmap host-first từ Alpha đến Launch (v0.2)

**Cập nhật:** 27/10/2026 · PostgreSQL đã được xác nhận  
**Quyết định đã chốt:** Bỏ khảo sát bổ sung. Build sản phẩm cho host quản lý CLB có member cố định + khách vãng lai. **Không tích hợp VietQR hay cổng thanh toán.** Mỗi host tự tải lên ảnh QR nhận chuyển khoản. **Dùng PostgreSQL sẵn có qua kết nối SSH tunnel**, không tự tạo một dịch vụ database mới.

> Lưu ý: README/source Alpha v0.1 hiện chỉ hỗ trợ SQLite mặc định, đánh dấu paid thủ công, **chưa triển khai upload QR hay kết nối DB qua SSH**. Roadmap này là yêu cầu cho các sprint tiếp theo, không phải báo cáo chức năng đã có.

## 1. Scope sản phẩm

### Luồng cốt lõi
1. Host tạo CLB, thêm member cố định và phân quyền co-host.
2. Host đặt lịch lặp hằng tuần; member xác nhận tham gia trước hạn.
3. Khi còn chỗ, host mở link công khai tuyển vãng lai; khách đăng ký không cần tạo tài khoản.
4. Host duyệt khách và quản lý danh sách chờ/giới hạn chỗ.
5. Khách/member xem **ảnh QR do host upload**, tên chủ tài khoản/ngân hàng nếu host cung cấp, **số tiền phải trả và nội dung chuyển khoản dạng văn bản**. QR tĩnh *không được giả định tự điền số tiền/nội dung*.
6. Người trả có thể gửi ảnh biên nhận; hệ thống đánh dấu `payment_reported`, **không tự xác nhận đã thu**.
7. Host đối chiếu với ngân hàng thực tế rồi xác nhận `payment_confirmed`; đánh dấu tham gia và cập nhật sổ thu chi.

### Không làm ở MVP
- VietQR tự sinh, kết nối API ngân hàng, đối soát ngân hàng tự động, ví nội bộ hoặc giữ tiền.
- Crawl Facebook, marketplace tìm kèo toàn thành phố, chatbot, AI ghép cặp, mobile native.

## 2. Kế hoạch 6 sprint từ hôm nay đến Beta Launch

| Sprint | Nội dung ưu tiên | Bàn giao / điều kiện qua sprint |
|---|---|---|
| **0 — Technical audit / DB (1–2 ngày)** | Xác minh PostgreSQL version và thông số DB sẵn có, SSH jump host, private DB host:port, tài khoản và quyền ghi schema riêng; dựng SSH tunnel local; test kết nối **read-only** và backup trước migration. Kiểm tra tenant separation, migration strategy, staging vs production. | Kết nối DB an toàn từ local; kế hoạch schema/migration được chốt mà không tác động bảng ngoài sản phẩm. |
| **1 — Foundation (3–5 ngày)** | Cấu hình `DATABASE_URL` qua env; psycopg PostgreSQL driver, Alembic migration; bỏ `create_all` khi production; bảng host/club/member, auth, tenant isolation; chuẩn hoá logs và health check. | Host tạo CLB + member trên DB sẵn có qua tunnel, test isolation và migration chạy trong schema được cấp. |
| **2 — Schedule & RSVP (5–7 ngày)** | Lịch định kỳ theo thứ/ngày giờ; sinh buổi idempotent; hạn xác nhận member cố định; quản lý sức chứa, huỷ và danh sách chờ; public guest registration. | Host quản lý được 4 tuần lịch, 20 member cố định + guest, không tạo trùng buổi và không vượt chỗ. |
| **3 — Static QR & Payments (5–7 ngày)** | Trang **Cài đặt thanh toán CLB**: upload/thay/xóa ảnh QR PNG/JPEG/WebP, giới hạn kích thước và xác minh nội dung file; tùy chọn tên ngân hàng/chủ TK/thông tin chuyển khoản; lưu *đường dẫn file* + metadata trong DB, **không lưu ảnh dạng BLOB trong DB**. Hiện QR của đúng CLB trên trang đóng phí. Cho người chơi upload proof riêng tư. Payment states `unpaid` → `reported` → `confirmed` / `rejected` với log ai duyệt, lúc nào. Không tự nhận tiền. | Host A chỉ sửa QR của CLB A; khách xem được QR đúng CLB, chỉ host được xem proof, và không thể xác nhận thanh toán trùng. |
| **4 — Finance & Reliability (4–6 ngày)** | Phí tháng cho fixed member, phí từng buổi cho guest, ghi chi phí sân/cầu, công nợ, tổng kết và export CSV. Transaction/locking, test cạnh tranh slot, CSRF/rate-limit, reset password, cookie HTTPS, validation upload, retention và backup/restore DB + file QR/proof. | Mọi booking gắn đúng nghĩa vụ thanh toán; giao dịch/chi phí lên báo cáo chính xác; phục hồi được từ backup. |
| **5 — Private Beta → Launch (7–14 ngày)** | Deploy app + SSH tunnel service ổn định, HTTPS/domain, giám sát, logging; onboard 3 host đầu tiên, sửa lỗi workflow rồi mở 10–15 host; trial 30 ngày, gói Pro 99k/CLB/tháng (thu phí SaaS tách biệt với QR nhận tiền kèo). | Không có blocker bảo mật, host chạy buổi đánh thật, backup/restore được, tunnel tự khôi phục; bắt đầu beta công khai có kiểm soát. |

**Thời gian kỳ vọng:** khoảng 5–8 tuần với một solo developer dùng coding assistant; đây là ước lượng để lập kế hoạch, không phải cam kết tiến độ.

## 3. Phân ranh ba luồng tiền

| Luồng | Tiền đi đâu? | Cách xác nhận |
|---|---|---|
| **Member cố định đóng phí CLB** | Chuyển thẳng vào tài khoản của host theo ảnh QR host cài | Host xem sao kê và bấm xác nhận thủ công |
| **Vãng lai đóng tiền buổi đánh** | Chuyển thẳng vào tài khoản host | Host đối chiếu và xác nhận thủ công |
| **Host trả phí phần mềm 99k/tháng** | Chuyển đến đơn vị vận hành SaaS, **không dùng QR của host** | Quy trình billing riêng; có thể thu thủ công giai đoạn đầu |

Hệ thống không nắm giữ tiền; ảnh chuyển khoản là **bằng chứng do người chơi cung cấp**, không phải xác thực ngân hàng. Không ghi `paid/confirmed` chỉ nhờ có ảnh upload.

## 4. Kiến trúc database và kết nối SSH

```
[Developer local] --(SSH -L, encrypted)--> [SSH jump host / server]
                                            |
                                            +-- TCP internal --> [Existing DB]
[ClubHost app server] --(SSH tunnel/service nếu khác mạng)---^ 
```

- SSH tunnel chuyển tiếp **cổng TCP**; ứng dụng vẫn cần driver + `DATABASE_URL` cho engine thật. SSH **không phải** loại database.
- **Engine đã chốt: PostgreSQL**. Còn cần xác minh version, database name, schema và quyền role trước khi chạy migration.
- Chỉ sử dụng **schema riêng** (`clubhost` trên PostgreSQL) hoặc **prefix bảng** (`clubhost_...`) / database namespace được chủ DB cấp; tuyệt đối không sửa bảng ứng dụng đang chạy.
- Tạo account ứng dụng **least privilege**; tài khoản migration riêng nếu cần. Mọi schema changes qua Alembic migration, test staging trước, có backup và phương án rollback.
- Không mở port DB ra Internet; tunnel bind `127.0.0.1`, SSH key, strict host-key checking, không commit file `.env`/SSH key.
- Prod: nếu app và DB nằm chung trusted private network, ưu tiên kết nối DB qua mạng nội bộ; nếu bắt buộc SSH, vận hành tunnel như service được theo dõi/khởi động lại, có health checks.
- Tách database truy cập local/test và production; không chạy pytest ghi/xóa trên DB sản xuất.

### Ví dụ SSH tunnel cho Windows PowerShell (PostgreSQL, chỉ khi engine thực tế đúng là PostgreSQL)

```powershell
ssh -N -L 127.0.0.1:15432:DB_PRIVATE_HOST:5432 SSH_USER@SSH_SERVER
```

Sau khi tunnel hoạt động, trong một terminal khác:

```powershell
$env:DATABASE_URL = 'postgresql+psycopg://APP_USER:APP_PASSWORD@127.0.0.1:15432/EXISTING_DB'
```

- `DB_PRIVATE_HOST` là hostname/IP DB **nhìn từ SSH server**, không tự động là `localhost`.
- `EXISTING_DB` là tên database được cấp, không giả định được tạo database mới.
- Với MySQL/MariaDB cần port/driver/connection string tương ứng và kiểm thử migration khác.
- Không cung cấp credentials thật trong tài liệu/chat; cấu hình bằng secret manager / environment ở máy triển khai.

## 5. Static QR: yêu cầu chức năng và bảo mật

### Setting theo CLB
- `qr_image_path` / object key, `bank_name` (optional), `account_holder` (optional), `account_number` (optional), `payment_note_template` (optional), `updated_at`, `updated_by`.
- Chỉ `owner/co-host` có quyền payment config được upload/thay đổi.
- Giới hạn 2 MB ảnh QR (có thể điều chỉnh), chỉ PNG/JPEG/WebP; xác minh actual bytes, giải mã và re-encode ảnh để loại nội dung lạ. Không nhận SVG/PDF/executable.
- File QR và ảnh proof đặt ngoài vùng source/repo; sử dụng private storage hoặc upload directory có backup; định danh ngẫu nhiên; không dùng tên file đầu vào; tránh path traversal.
- QR có thể xuất hiện với khách cần chuyển khoản nên QR được phục vụ qua route phù hợp, nhưng **proof chỉ host của CLB đó được quyền xem**.
- Không xóa QR cũ đang được dùng bởi nghĩa vụ thanh toán còn tồn tại mà không có quy tắc; lưu snapshot/version QR theo payment request nếu thực tế cần.

### Hiển thị cho người trả
- QR tĩnh do host upload + thông tin chuyển khoản dạng chữ để có thể copy.
- **Số tiền và mã/nội dung chuyển khoản hiển thị bên cạnh QR**, không giả định QR có encoding đúng hai trường này.
- Sau khi chuyển, người dùng nộp ảnh biên nhận (nếu chính sách CLB bắt buộc); host xác nhận với sao kê.
- Trạng thái gồm `unpaid`, `reported`, `confirmed`, `rejected`, `refunded` (nếu được hỗ trợ); audit log và xử lý resubmission.

## 6. Launch checklist (bắt buộc)

- [ ] DB staging qua SSH hoạt động ổn định; migrate an toàn; production backup + test restore thành công.
- [ ] Các bảng ClubHost không đụng vào bảng của app cũ; tài khoản DB giới hạn đúng quyền.
- [ ] Tenant isolation: host A không đọc/sửa được data hay QR/proof của CLB B.
- [ ] Có HTTPS, secure cookies, CSRF, rate limits, secret management, logs không lộ PII.
- [ ] Kiểm thử lỗi đăng ký đồng thời, huỷ giờ chót, waitlist và phí tháng/phí buổi.
- [ ] QR và proof upload có validation, giới hạn size, quyền truy cập, backup và retention.
- [ ] Host có thể xác nhận thu tiền **thủ công**; không mô tả là thanh toán tự động.
- [ ] Trang hướng dẫn sử dụng, điều khoản, chính sách bảo vệ dữ liệu và kênh hỗ trợ.
- [ ] Dùng thử 3 host thật trước khi mở 10–15 host, theo dõi lỗi và tỷ lệ hoàn thành workflow.

## 7. Chỉ số sau Beta
- Tỉ lệ host tạo CLB → tạo buổi đầu tiên.
- Số buổi đánh / CLB / tuần, tỉ lệ RSVP và guest approved.
- Tỉ lệ payment_reported → payment_confirmed, thời gian đối soát, chênh lệch quỹ.
- Host hoạt động tuần 2, tuần 4 và số host chuyển sang trả 99k sau trial.

## Trạng thái coding Sprint 0 / Sprint 1 (source, 27/10/2026)

- **Đã code:** cấu hình PostgreSQL `postgresql+psycopg://`, namespace riêng `DB_SCHEMA=clubhost`, Alembic revision `0001_initial`, script read-only `scripts/check_db.py`, `/ready`, chỉnh sửa CLB/member, test tenant isolation và test PostgreSQL DDL offline.
- **Đã test:** các bài test tự động chạy trên SQLite riêng cho test + offline SQL generation; xem output tại thời điểm bàn giao.
- **Chưa làm trên hạ tầng thật:** không có SSH endpoint/DB URL/role được cấp nên chưa xác minh đường hầm, chưa chạy Alembic trên PostgreSQL của người dùng. DB hiện có giữ nguyên.
- **Không thuộc sprint này:** host QR upload, upload proof, lịch lặp, co-host, production hardening.
- **Hướng dẫn thao tác:** `SPRINT_0_1.md` (ưu tiên hơn các ví dụ engine chung trong roadmap cũ).
