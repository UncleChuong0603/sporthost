# SportHost — gap analysis theo action plan 01/11/2026

**Cập nhật triển khai:** phần bảng dưới là baseline trước thay đổi. Sprint 1–5 đã được
triển khai/kiểm chứng và release theo các `SPORT_HOST_SPRINT_*_REPORT.md`; Sprint 6 bổ sung
E2E 15 người, privacy lookup, upload/DB-failure hardening, snapshot QR phí tháng và backup ảnh.
Xem [báo cáo cuối](SPORT_HOST_SPRINT_6_REPORT.md) và [vận hành beta](SPORT_HOST_BETA_OPERATIONS.md)
để phân biệt trạng thái thực chạy với những thiếu sót tại baseline.

## Phạm vi và bằng chứng

Đặc tả: `SPORT_HOST_CODEX_ACTION_PLAN.md` v1.0 do người dùng cung cấp. Đây là nâng cấp
repo hiện có, không tạo app mới. Audit source trên nhánh đang làm việc ngày 01/11/2026;
README cũ không được dùng làm bằng chứng một tính năng đã hoàn chỉnh theo đặc tả mới.

Đã đọc README, BUILD_PLAN, CODEX_PROMPT, SPRINT_0_1, FULL_ROADMAP, OPERATIONS,
DEPLOY_VERCEL, design system và UX audit 31/10; kiểm tra models, route handlers,
templates, JavaScript/CSS, migrations 0001–0004, scripts vận hành, cấu hình mẫu và tests.
Inventory chi tiết: [SPORT_HOST_CODEBASE_INVENTORY.md](SPORT_HOST_CODEBASE_INVENTORY.md).
Các tài liệu/ảnh UX audit đã có trong thư mục `docs/` được giữ nguyên.

**Baseline trước sửa:** `.venv\Scripts\python.exe -m pytest -q` → **46 passed in 49.05s**.
Chưa kết nối database triển khai, chưa chạy migration online, chưa deploy.

Stack thực tế: FastAPI + Jinja2 + plain JavaScript/CSS + SQLAlchemy + Alembic;
PostgreSQL/psycopg cho staging/production, SQLite tạm cho unit/route regression.
Giữ nguyên stack và namespace `clubhost` để tương thích dữ liệu. Không đổi schema sang
`sporthost` chỉ vì đổi tên thương hiệu; `DB_SCHEMA` vẫn phải là schema riêng được cấp.

## Ma trận tính năng tại baseline

| Phần đặc tả | Hiện trạng | Thay đổi tối thiểu / sprint |
| --- | --- | --- |
| Host đăng nhập, CSRF, phiên có version | Có rồi | Giữ hashing/cookie và tests cũ; hardening ở S6 |
| CLB, thành viên cố định, vãng lai | Có rồi | Mở rộng `clubs`; giữ `members` và khóa điện thoại theo CLB |
| Môn thể thao, mặc định vận hành CLB | Chưa có | S1 thêm sport code/catalog, trình độ, capacity, approval/fee defaults, policies |
| Responsive workspace, sidebar, lịch, thành viên | Có nhưng thiếu | Tái sử dụng CSS/macros; thao tác bảng tại sân cần cải thiện S3/S6 |
| Trang public, đăng ký không tài khoản | Có nhưng thiếu | Giữ URL và guest flow; S2 bổ sung thông tin kèo, nhóm và thời hạn |
| Tra điện thoại rồi kiểm tra hồ sơ | Có nhưng thiếu | Hiện trả tên/trình độ/giới tính khi biết số; cần đánh giá lộ PII ở S2/S6 |
| Booking nhóm / người liên hệ / payer | Chưa có | S2 thêm participants gắn booking cũ, không tạo booking trùng theo từng người |
| Duyệt thủ công, waitlist, giới hạn nam/nữ | Có nhưng thiếu | S2 đếm participants, AUTO/MANUAL, cả nhóm đủ chỗ; giữ khóa hàng session |
| Atomic capacity PostgreSQL | Có nhưng thiếu | Có `FOR UPDATE` ở duyệt/RSVP/join; chưa có integration concurrency; kiểm tra mọi đường thay đổi S2 |
| Link guest riêng và quay lại bằng cookie | Cần refactor | `access_key` plaintext, không hạn/thu hồi/rate limit; S2 thêm digest + expire/revoke, mapping link cũ có kiểm soát |
| Lịch lặp, RSVP member, không sinh trùng | Có rồi | Giữ rules + occurrence unique; cập nhật snapshot khi thêm domain mới |
| Điểm danh | Có nhưng thiếu | `Booking.attended` boolean, không no-show/check-out/thay người/walk-in; S3 chuyển theo participant |
| Vòng đời session | Chưa có | Hai boolean open/cancelled không thay được OPEN/IN_PROGRESS/PLAY_FINISHED/SETTLED; S3/S5 |
| Phí cố định, phí nam/nữ, phí tháng | Có nhưng thiếu | Giữ integer VND và `fee_amount`; S4 tránh thu trùng monthly/session |
| Chia đều, expenses có loại, draft/issue/snapshot | Chưa có | S4 mở rộng `expenses`, thêm batch/charges; không diễn giải lại khoản đã thu |
| Upload QR tĩnh, private proof, duyệt thủ công | Có rồi | Giữ storage/routes; proof không tự ghi paid |
| Phiên bản QR + text ngân hàng | Cần refactor | QR được snapshot nhưng text đọc từ club hiện tại (UX-01); S4 snapshot cùng phiên bản |
| Partial/overpay/refund, nhiều lần trả | Chưa có | `paid/payment_status` không đủ; S4 thêm money movements, đối soát từ ledger |
| Chốt sổ còn nợ, điều chỉnh có lý do | Chưa có | S5 khóa snapshot, giữ ledger thu sau chốt và adjustment |
| Quyền owner/manager/finance | Có nhưng thiếu | S1 giữ owner-only settings; S5 quyền granular. Các trang game/dashboard/settings logs còn có thể hiện số tài chính cho manager; cần chặn cả read backend |
| Audit trail | Có nhưng thiếu | Helper cũ cắt 500 ký tự, một số thao tác chưa log; S1 log settings đầy đủ, S3–5 bổ sung phần tiền |
| Platform admin | Có nhưng thiếu | Có cấp trial, chưa có platform ledger tách biệt; S5 thêm riêng |
| SMTP, backup/restore, retention | Có nhưng thiếu | Có code/scripts, không có bằng chứng vận hành mới; S6 kiểm chứng môi trường riêng |

## Model và quyền: nguồn sự thật cần giữ

- `Host` → `Club.owner_id`; đồng quản lý qua `ClubAccess` (`manager`, `finance`).
- `Member` có `kind=fixed/guest`, giới tính tùy chọn; không bắt khách có Host account.
- `GameSession` → `Booking(session_id, member_id)` unique; mỗi booking hiện là một người.
- `Booking.fee_amount` giữ giá lịch sử; `paid/payment_status` là mô hình cũ, chưa phải ledger.
- `MonthlyDue(member_id, period)` unique là nghĩa vụ tháng riêng.
- `Expense` đang có title/amount; không thêm bảng trùng `session_expenses`.
- `PaymentProof` gắn booking hoặc due, ảnh qua `StoredAsset` thuộc CLB; không tạo proof entity thứ hai.
- `RecurringRule`, `AuditLog`, `EmailToken`, `SubscriptionRequest`, `RequestLimit` giữ nguyên.

| Hành động | Owner | manager | finance | Guest |
| --- | --- | --- | --- | --- |
| Đọc CLB, game, members | Có | Có | Có | Không |
| Sửa thông tin/mặc định CLB, cấp quyền | Có | Không | Không | Không |
| Lịch, đăng ký, điểm danh | Có | Có | Không | Chỉ đăng ký của mình bằng link riêng |
| QR, proof, xác nhận thu | Có | Không | Có | Gửi proof qua link; không duyệt |
| Admin trial | Chỉ platform admin | Chỉ platform admin | Chỉ platform admin | Không |

Quyền read tài chính chưa được cô lập triệt để trong các trang tổng hợp (gap ở trên).
Không coi bảng quyền này là chứng nhận toàn bộ yêu cầu S5 đã đạt.

## Migration theo thứ tự, không thay bảng hiện hữu

1. **S1 / 0005_club_settings:** thêm 7 cột + 3 check constraints chỉ vào `DB_SCHEMA.clubs`.
   `sport_type=badminton` cho CLB cũ vì README/BUILD_PLAN xác nhận domain cũ chỉ cầu lông.
   `default_capacity=20`, `MANUAL_APPROVE`, `FIXED_PRICE` giữ mặc định/giá cũ; policy để trống,
   không bịa chính sách hủy. Không cập nhật booking/member/session/payment/dues.
2. **S2:** thêm booking participants; mỗi booking cũ backfill đúng 1 participant và giữ ID
   booking/fee/proof. Bỏ giả định một booking bằng một chỗ ở mọi query. Thêm liên hệ/payer,
   policy snapshot và digest token; kế hoạch hỗ trợ link cũ không được phá guest đang dùng.
3. **S3:** participant attendance với actor/time; backfill attended=true thành CHECKED_IN,
   false thành NOT_MARKED (không được tự suy ra NO_SHOW). Session cũ chỉ suy ra open/cancelled;
   không suy ra đã kết thúc/chốt sổ nếu thiếu bằng chứng.
4. **S4:** tận dụng `expenses`, `payment_proofs`; thêm charge batches/charges/movements.
   Khoản `paid=true` cũ chỉ map một receipt lịch sử theo nghĩa vụ, không cộng lại qua cả ledger
   và boolean. `paid=false` không chứng minh chưa từng nhận/hoàn tiền; cần đối chiếu legacy audit.
   Chụp giá/QR/bank text/payer theo phiên bản; không double bill booking và participant.
5. **S5:** snapshots chốt sổ, adjustments, permission flags và platform ledger riêng.
6. **S6:** chứng minh migration/backup/restore trên staging qua tunnel trước khi xin chạy prod.

Migrations lịch sử được giữ nguyên. `0005` dùng server defaults để backfill additive trong
transaction Alembic; tránh UPDATE không tenant/schema scope. Không drop/truncate hay đổi
search_path. Downgrade phá dữ liệu bị chặn theo pattern repo: rollback code có thể giữ cột
mới; khôi phục schema từ backup đã kiểm tra nếu cần bỏ dữ liệu mới. Không dùng `stamp`
để giả lập migration đã chạy. Backup script chọn theo ORM mới nên cần backup bằng bản code
cũ/trước triển khai hoặc `pg_dump --schema` nếu DB chưa lên 0005.

## Giả định triển khai S1

- Danh mục môn là cấu hình code tại `app/sports.py`, không phải enum PostgreSQL. Thêm môn
  tại một nơi; category tài chính vẫn tổng quát. Chưa có màn quản trị danh mục (ngoài phạm vi).
- Quyền sửa settings giữ owner-only. Granular co-host permission được làm ở S5.
- Giới hạn người dùng làm giá trị ban đầu trong form tạo buổi; host được đổi cho từng buổi.
- Approval mode, fee mode và cancellation policy được lưu ở CLB trong S1. **Chưa thay thuật
  toán duyệt (S2), chưa thực thi hủy theo hạn (S2), chưa tính COST_SHARING (S4).** Không coi
  các lựa chọn này là engine đã hoạt động; trạng thái public hiện tiếp tục nói host duyệt.
- Chỉnh CLB không thay phí/sức chứa/trạng thái của buổi đã tạo. Session-level snapshot và
  override thuộc S2/S4; lựa chọn sport mới thay nhãn CLB hiện tại, chưa có sport snapshot buổi.
- Không thêm marketplace, API ngân hàng/VietQR, account bắt buộc cho khách, hoặc nhà cung cấp DB.

## Môi trường và cổng kiểm chứng còn thiếu

Không có `DATABASE_URL` PostgreSQL test được cấp trong process hiện tại; `.env.local` chỉ có
tên biến xác thực Vercel, không chứa cấu hình DB ứng dụng. Không đọc/in giá trị secrets,
không dùng remote production, không thay SSH/key/credentials. Không thấy postgres/psql/docker
trên PATH. Tài liệu deploy cũ nói Neon/Vercel, nhưng đặc tả mới yêu cầu PostgreSQL sẵn có
qua tunnel: ưu tiên đặc tả; không tạo/chuyển dịch vụ DB theo tài liệu cũ.

Default tests ép SQLite tạm, ảnh tạm, tắt cloud Blob/SMTP trong process test. Bổ sung test
PostgreSQL opt-in dùng URL test riêng và schema ngẫu nhiên; không fallback sang DATABASE_URL.
Đọc [SPORT_HOST_TESTING.md](SPORT_HOST_TESTING.md) để cấu hình riêng ngoài chat.

**Cổng trước Sprint 2:** migration 0005 giữ dữ liệu trên PostgreSQL staging/test phải được
kiểm chứng. Offline SQL + SQLite không chứng minh được backfill/constraints/concurrency thật.
Chưa đạt cổng này thì S1 chỉ hoàn tất code/local validation, chưa đạt toàn bộ Definition of Done.
Các sprint 2–6 và happy path 15 người chưa được đánh dấu hoàn tất.
