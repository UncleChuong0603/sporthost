# Sprint 4 — tính phí và đối soát thủ công

## Phạm vi thực hiện

- Session nhận mặc định FIXED_PRICE/COST_SHARING từ CLB, được chọn riêng trước đăng ký.
  Công khai chính sách vắng mặt (miễn hoặc tính đầy đủ), phí tháng (miễn tháng đã đóng
  hoặc thu riêng), đến muộn/về sớm không tự giảm. Không đổi policy sau khi đã có đăng ký.
- Dùng bảng expenses hiện hữu, thêm loại sân/dụng cụ/khác, ghi chú, người nhập, thời điểm
  và lựa chọn phân bổ hoặc CLB tự chịu. Ghi chi cùng transaction/audit và khóa session.
- Bản nháp hiển thị số người tính phí, miễn/giảm có lý do, khoản đã thu trước phát hành,
  tổng chi, phải thu và chênh lệch. Chia đều chính xác tới 1 VND, phần dư phân theo ID
  participant tăng dần; không dùng float. Miễn loại khỏi mẫu số, giảm sau phân bổ do CLB bù.
- MonthlyDue đã xác nhận đúng tháng + member fixed được miễn khi policy EXEMPT_PAID.
  Companion vẫn là khách riêng; không miễn theo người liên hệ. No-show dựa policy đã nhận.
- Phát hành chỉ sau PLAY_FINISHED và tất cả confirmed được điểm danh; hash bản nháp
  chặn phát hành nội dung cũ. Double-click/retry/concurrent issue chỉ một batch/session.
- Mỗi participant có đúng một charge; GROUP gom nghĩa vụ vào người liên hệ hoặc SPLIT
  tạo nghĩa vụ riêng từng người. Guest/finance chọn trước phát hành, sau đó khóa.
- Snapshot giá/cách tính/điểm danh/chi phí/payer/QR và thông tin ngân hàng cùng phiên bản.
  Đổi QR CLB sau này không đổi QR hoặc tài khoản của khoản đã phát hành.
- Các lần thực nhận/hoàn tiền/hoàn tác là dòng ledger riêng, có actor, thời điểm, kênh
  BANK_TRANSFER/CASH/OTHER, reference, lý do và request key. Thiếu/đủ/thừa/công nợ được
  tính từ charges và tổng tiền, không lấy ảnh hoặc boolean làm nguồn sự thật.
- Nhiều biên nhận cho cùng booking; chặn ảnh trùng bằng hash trong đúng booking. Ảnh chỉ
  REPORTED. Finance nhập số thực nhận khi đối chiếu, có thể khác số khách báo. Review/retry
  không tạo tiền trùng; từ chối không tạo dòng tiền. Hoàn chỉ ghi khoản đã hoàn thủ công.
- Guest copy số còn thiếu và nội dung chuyển khoản, xem breakdown nhóm mình. Sổ thu chi,
  dashboard và metrics buổi lấy net receipts/công nợ từ ledger cho session đã phát hành.

## Tương thích và giả định

Giữ nguyên stack, PostgreSQL đã cấu hình và schema clubhost. Session cũ vẫn FIXED_PRICE,
không ép CLB cũ đã chọn COST_SHARING vào engine mới. Chưa phát hành thì luồng legacy
giá cố định/dues vẫn dùng xác nhận cũ; khi phát hành, khoản paid đã được host xác nhận
được nhập đúng một lần làm số dư đầu kỳ với giá trị gốc, actor phát hành và chú thích
không biết thời điểm giao dịch gốc. Không suy diễn tiền từ biên nhận. Muốn thu một phần
phải phát hành rồi dùng ledger. Phí tháng giữ nghĩa vụ riêng, chưa chuyển sang ledger
thu nhiều lần trong sprint này. Trước phát hành chia đều không được dùng nút paid legacy.

GROUP có tiền đã thu trước phát hành giữ GROUP để không tự phân bổ khoản đã thu sang nhiều
người. SPLIT có thể chọn trước khi thu, từng người có khoản nợ riêng dưới cùng link quản lý
nhóm; chưa thêm liên kết cá nhân ngoài nhóm. Đến muộn/về sớm chỉ ảnh hưởng tiền khi host
miễn/giảm có lý do. Phí sân âm không được nhập. Không auto-transfer, API ngân hàng hay VietQR.

## Files và migration

Mới: `app/finance_models.py`, `finance_service.py`, `finance_routes.py`, templates
`billing.html`, `participant_billing.html`, migration `0008_manual_billing.py`, tests
`test_billing.py`, `test_billing_browser.py` và báo cáo này.

Sửa: `main.py`, `models_extra.py`, `booking_service.py`, `payments.py`, `workspace.py`;
templates `game`, `join`, `participant`, `payment_review`, `session_policy_fields`;
scripts `check_group_concurrency`, `smoke_group_release`; README/CHANGELOG/test docs.

Migration thêm charge_batches/charges/money_movements; mở rộng bảng game/booking/participant/
expense/proof. FKs, indexes, unique keys chống issue/request/proof/reversal trùng và constraints
tiền/chế độ. Không viết lại paid/fees/dues cũ. Downgrade destructive bị chặn; giữ bằng chứng
tài chính, rollback ứng dụng cần bản tương thích ledger và kiểm tra backup riêng.

## Kiểm chứng và release

- 9 tests backend tài chính mới pass: AA phần dư, stale draft, khóa cơ sở, nhiều lần thu,
  thiếu/thừa/hoàn/hoàn tác, payer, monthly/no-show, proof giả/duplicate/review và tenant.
- PostgreSQL schema ngẫu nhiên: 8 kịch bản race (3 capacity, 2 attendance, 3 billing) pass.
- Snapshot 17 bảng production revision 0007; restore schema riêng và migrate 0008,
  đối chiếu mọi cột dữ liệu cũ không đổi, dọn schema thử.
- Full regression với browser: **100 passed, 1 skipped in 179.91s**. Sau rà soát số chính thức
  trong bảng/CSV và tổng đối ứng hoàn tác, chạy lại 9 test billing: **9 passed in 18.63s**.
- Edge mobile 375px pass luồng phát hành → ảnh báo 70k → host xác nhận thực nhận 30k →
  khách còn nợ 40k → thu tiền mặt 40k → đã thu đủ. Không tràn ngang/không lỗi JS.
- Compileall và diff whitespace check pass. Production migration 0008 đã áp dụng sau
  kiểm tra backup/hash/restore; deployment và smoke cập nhật khi chạy hoàn tất.

## Còn lại

Sprint 5: chốt sổ còn nợ, điều chỉnh khoản phải thu sau phát hành có phiên bản/audit,
quyền co-host chi tiết và platform ledger riêng. Sprint 6: E2E 15 người, hardening, hướng dẫn
host/guest và vận hành tunnel/staging. Chưa tuyên bố beta hoàn chỉnh khi các phần này chưa pass.
