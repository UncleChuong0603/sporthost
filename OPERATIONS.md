# Vận hành SportHost

## Biến môi trường

Giữ `SECRET_KEY` ổn định, không đưa credential vào Git. Runtime dùng pooled URL,
migration/backup dùng direct URL. Không đưa SSH/private key lên Vercel.

| Biến | Mục đích |
| --- | --- |
| APP_ENV | `staging` cho beta hoặc `production` |
| DATABASE_URL | PostgreSQL với TLS |
| DATABASE_MIGRATION_URL | Direct URL, chỉ trên máy operator |
| DB_SCHEMA | `clubhost` |
| SECRET_KEY | Chuỗi ngẫu nhiên 32+ ký tự |
| COOKIE_SECURE | `true` trên Vercel |
| BLOB_READ_WRITE_TOKEN | Private Blob integration cấp |
| PUBLIC_BASE_URL | `https://sporthost.vercel.app` |
| ADMIN_EMAILS | Email được cấp admin sau xác minh |
| SMTP_HOST, SMTP_PORT | 587 STARTTLS hoặc 465 TLS |
| SMTP_USER, SMTP_PASSWORD | Credential SMTP nếu yêu cầu |
| MAIL_FROM | Địa chỉ gửi hợp lệ |

SMTP chưa cấu hình thì giao diện báo email chưa sẵn sàng. Development/test ghi thư
vào `.vercel/mail-outbox`; đây không phải bằng chứng thư đã gửi tới hộp thư.
Sau cấu hình phải kiểm tra nhận thư thật và token dùng một lần bằng tài khoản thử.

## Admin và Pro trial

User chỉ định `lovetobangbang@gmail.com` làm admin. Cấp quyền cho **tài khoản đã có**
từ máy operator, với `ADMIN_EMAILS` chứa đúng email:

```powershell
python -m scripts.admin grant --email lovetobangbang@gmail.com
```

Không đổi mật khẩu hay giả lập xác minh email. Thu hồi bằng `revoke` sẽ thu hồi các
phiên đăng nhập cũ. Trang `/admin` gia hạn trial. Beta mở toàn bộ tính năng miễn phí;
không có QR thu phí SaaS hay tự động tính tiền.

## Backup và phục hồi

```powershell
python -m scripts.backup export --file .vercel/backup-YYYYMMDD.zip
python -m scripts.backup restore --file .vercel/backup-YYYYMMDD.zip --schema clubhost_restore_check
```

Backup đọc snapshot nhất quán của các bảng, kèm ảnh theo SHA-256. Giữ backup riêng tư,
mã hóa ở nơi lưu ngoài app vì có dữ liệu cá nhân. Tool từ chối ghi đè backup và không
phục hồi đè schema nguồn. Phiên đăng nhập/token cũ bị vô hiệu ở bản phục hồi.
**Chưa cài scheduler hằng ngày**; operator đặt lịch chạy export và kiểm tra kết quả.

Trước migration: backup, phục hồi thử schema riêng, đối chiếu dữ liệu rồi chạy
`python -m scripts.migrate`. Migration `0004_full_roadmap` thêm cột/bảng, giữ dữ liệu cũ.
Code cũ vẫn đọc được schema bổ sung; không downgrade phá hủy dữ liệu.

Sau deploy kiểm tra `/health`, `/ready`, CLB cũ, đăng ký khách, RSVP và ảnh test.
Readiness kiểm tra model Host, không thay thế kiểm thử mọi luồng.

## Ảnh và retention

Pillow kiểm tra và mã hóa lại PNG, bỏ metadata; ảnh lưu private Blob. QR tối đa 2 MB,
biên nhận tối đa 3 MB đầu vào. Token Blob chỉ có ở backend. Giữ QR cũ còn được tham chiếu.

```powershell
python -m scripts.retention --days 90
python -m scripts.retention --days 90 --apply
```

Lệnh đầu chỉ thống kê. Lệnh sau xóa ảnh **biên nhận bị từ chối** quá hạn và giữ audit;
không xóa QR, ảnh đang chờ/đã xác nhận. Tối thiểu 30 ngày. Chưa cài lịch tự động.

## Giới hạn beta

Không OTP số điện thoại; tra cứu trong CLB có rate limit theo IP. Ai có link RSVP/
thanh toán có thể thao tác cho người đó. Không tự chuyển tiền/hoàn tiền, không gửi
nhắc RSVP hàng loạt; host chia sẻ link. Theo dõi hạn mức Vercel/Neon khi số CLB tăng.
