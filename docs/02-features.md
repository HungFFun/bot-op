# 02 — Chức năng & luồng nghiệp vụ

## 0. Đăng nhập web
- Tên đăng nhập + mật khẩu (tối thiểu 6 ký tự). Tên đăng nhập không phân biệt hoa thường. Phiên giữ 30 ngày (cookie httpOnly, secure, sameSite=lax).
- Không tự đăng ký: **admin (role `owner`) cấp tài khoản**, đặt lại mật khẩu, khoá tài khoản tại `/admin/users`. Đặt lại mật khẩu hoặc khoá → đăng xuất khỏi mọi thiết bị.
- Sai 5 lần → khoá 15 phút (admin đặt lại mật khẩu để mở khoá ngay).
- Mật khẩu hash bằng argon2. Số điện thoại chỉ là thông tin liên hệ.
- Web là PWA: "Thêm vào màn hình chính", nhận Web Push.

## 1. Order nguyên liệu

### Luồng
```
Đăng nhập ─▶ chọn NL + SL ─▶ Gửi (PO status=submitted, tự tách theo NCC)
 ─▶ Web Push cho manager chi nhánh ─▶ manager Duyệt/Sửa/Từ chối
 ─▶ approved ─▶ nút "Copy tin đặt hàng" cho từng NCC ─▶ đánh dấu ordered
 ─▶ hàng về: nhập SL thực nhận + đơn giá thực + ảnh hoá đơn ─▶ received
 ─▶ ghi ingredient_prices (source=po_receipt) ─▶ cập nhật "giá nhập gần nhất"
 ─▶ tự sinh expense (token) gắn po_id, status=pending
```
- "Giá nhập gần nhất" lấy từ lần NHẬN HÀNG thực tế, không phải lúc đặt.
- Một lần gửi giỏ có thể tạo nhiều PO (mỗi NCC một PO), cùng `order_batch_id`.
- Giá chênh > 10% so với lần trước → hiện badge ▲/▼ và ghi chú trong báo cáo tuần.

### Màn hình
```
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ ◀  Order nguyên liệu   CN Q1  │   │ ◀  Giỏ order (5 món)          │
├───────────────────────────────┤   ├───────────────────────────────┤
│ 🔍 Tìm tên / mã NL...         │   │ ▼ Rau Đà Lạt Xanh  (2 món)    │
│ [Tất cả][Rau][Thịt][Khô][Đá]  │   │   RAU-012 Xà lách   3 kg      │
├───────────────────────────────┤   │   RAU-020 Cà chua   5 kg      │
│ RAU-012  Xà lách lolo         │   │   Tạm tính: 215.000đ          │
│ 35.000đ/kg · Rau Đà Lạt Xanh  │   │ ▼ Thịt Sạch Bình An (1 món)   │
│ nhập 03/10 ▲+5%    [-] 3 [+]  │   │   THT-003 Ba chỉ    10 kg     │
├───────────────────────────────┤   │   Tạm tính: 1.450.000đ        │
│ THT-003  Ba chỉ heo           │   ├───────────────────────────────┤
│ 145.000đ/kg · Thịt Bình An    │   │ Ghi chú: [Giao trước 9h    ]  │
│ nhập 04/10         [-] 0 [+]  │   │ Ngày cần: [06/10 ▾]           │
├───────────────────────────────┤   │ Tổng dự kiến:  2.180.000đ     │
│ 🛒 5 món · 2.180.000đ  [Xem ▸]│   │      [ GỬI ORDER ]            │
└───────────────────────────────┘   └───────────────────────────────┘
```
Các màn khác:
- **Duyệt order** (manager): danh sách PO submitted, sửa SL, Duyệt / Từ chối (bắt buộc lý do).
- **Nhận hàng**: theo PO, nhập qty_received + actual_price từng dòng, chụp hoá đơn.
- **Quản trị danh mục**: CRUD nguyên liệu, NCC, hạng mục; import Excel/CSV.
- **Lịch sử giá**: biểu đồ giá 1 NL theo thời gian, so sánh giữa NCC.

### Mẫu "Copy tin đặt hàng"
```
BamThai CN Q1 đặt hàng ngày 06/10 (giao trước 9h):
- Xà lách lolo: 3 kg
- Cà chua: 5 kg
Mã đơn: PO-251006-0012. Cảm ơn anh/chị!
```

## 2. Token chi tiêu

### Định dạng
`{PREFIX}-{YYMMDD}-{4 ký tự}` ví dụ `C-251006-7KXF`
- PREFIX: `C` chi, `T` tạm ứng, `H` hoàn ứng.
- 4 ký tự Crockford Base32 (bỏ I, L, O, U). Ngẫu nhiên, unique toàn hệ thống (retry khi trùng).
- Tra cứu không phân biệt hoa thường; cho phép gõ chỉ 4 ký tự cuối nếu kết quả duy nhất.

### Trạng thái
`pending → approved → paid`, hoặc `pending → rejected`. Sửa số tiền sau khi approved → quay về pending + audit log.

### Luồng
```
Form chi ─▶ tạo token (pending) ─▶ hiển thị mã to + nút Copy
 ─▶ Web Push cho manager ─▶ Duyệt ─▶ accountant đánh dấu paid (hình thức, ngày)
Tra cứu: ô tìm token ở header, hoặc /expenses/:token
```

### Màn hình
```
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ ◀  Tạo khoản chi              │   │ ✅ Đã tạo khoản chi            │
├───────────────────────────────┤   ├───────────────────────────────┤
│ Số tiền    [ 350.000       ]đ │   │      C-251006-7KXF            │
│ Hạng mục   [ Gas / chất đốt ▾]│   │      [ Copy mã ]              │
│ Nội dung   [ Mua 2 bình gas  ]│   │ 350.000đ · Gas / chất đốt     │
│ Chi nhánh  [ CN Q1         ▾] │   │ Mua 2 bình gas · CN Q1        │
│ Hình thức  (•) Tiền mặt       │   │ Trạng thái: Chờ duyệt         │
│            ( ) Chuyển khoản   │   │ Ghi mã này lên hoá đơn hoặc   │
│ Hoá đơn    [ 📷 Chụp ảnh    ] │   │ nội dung chuyển khoản.        │
│        [ TẠO MÃ CHI ]         │   └───────────────────────────────┘
└───────────────────────────────┘
```
Báo cáo chi: lọc theo ngày, chi nhánh, hạng mục, người chi, trạng thái; xuất CSV/Excel.

## 3. Đọc group → AI → báo cáo vào group report

### Luồng
```
zalo-agent nhận tin từ group role='monitor'
  ─▶ lưu group_messages (raw) ─▶ enqueue job 'classify-batch' (debounce 2 phút/group)
worker 'classify-batch':
  ─▶ lọc rule (sticker, "ok", "dạ", <5 ký tự, chỉ emoji) → skip
  ─▶ từ khoá cứng (cháy, chập, rò gas, ngộ độc, hết hàng, nghỉ đột xuất, mất điện,
     cúp nước, khách phàn nàn) → ép severity >= high
  ─▶ gọi AI → message_insights
  ─▶ severity=critical|high & category=incident → tạo incident + report type=alert
     (chống trùng: cùng chi nhánh + tóm tắt tương tự trong 30 phút → gộp)
cron (Asia/Ho_Chi_Minh):
  14:00 midday · 22:00 daily · CN 22:00 weekly → report type tương ứng
zalo-agent poll reports(status='queued') mỗi 10s ─▶ gửi vào group role='report'
  ─▶ status='sent' + zalo_msg_id, hoặc 'failed' + error (retry tối đa 3 lần)
```

### Lịch báo cáo
| Loại | Khi nào | Nội dung |
|---|---|---|
| `alert` | Ngay | 1 sự cố, ngắn, ai báo, group nào |
| `midday` | 14:00 | Sự cố + thông báo buổi sáng |
| `daily` | 22:00 | Cả ngày + số liệu order/chi + việc còn tồn |
| `weekly` | CN 22:00 | Sự cố lặp lại, NL tăng giá, chi theo hạng mục |

### Mẫu tin
```
🚨 CẢNH BÁO · CN Q1 · 10:42
Máy rửa chén báo lỗi, không lên nhiệt
Báo bởi: Tuấn (Group Bếp Q1)
```
```
📋 BÁO CÁO NGÀY 05/10

🔴 SỰ CỐ (2)
• Q1 – Máy rửa chén lỗi nhiệt (10:42) – chưa thấy báo đã xử lý
• Q3 – Thiếu 1 phục vụ ca tối, đã gọi người thay

📢 THÔNG BÁO MỚI
• Từ 07/10 ca sáng bắt đầu 6h30 (chị Lan)

📊 TÌNH HÌNH
• Q1 báo khách đông giờ trưa, hết món cá kho lúc 12h45

🛒 ORDER & CHI
• 4 PO đã duyệt · dự kiến 6.200.000đ
• 7 khoản chi · 1.850.000đ · 2 khoản chờ duyệt

⏳ CẦN THEO DÕI
• Máy rửa chén Q1
```
- Zalo không render markdown → text thuần + emoji. Tin > 2000 ký tự → tách nhiều tin.
- Báo cáo tối ưu tiên đọc nhanh trên điện thoại: tối đa ~5 ý mỗi mục, còn lại "và N ý khác, xem web".

### Dashboard vận hành (web)
```
┌──────────────────────────────────────────────────┐
│ Vận hành hôm nay 05/10         [CN Q1 ▾][Hôm nay]│
├────────────┬────────────┬────────────┬───────────┤
│ 🔴 Sự cố 2 │ 📢 TB 5    │ 📊 BC 3    │ ⏳ Mở 1   │
├────────────┴────────────┴────────────┴───────────┤
│ 🔴 10:42 Group Bếp Q1 · Tuấn                     │
│    Máy rửa chén báo lỗi, không lên nhiệt         │
│    [Tin gốc] [Đã xử lý] [Giao cho ▾]             │
├──────────────────────────────────────────────────┤
│ 📢 09:15 Group Quản lý · Lan                     │
│    Từ 07/10 ca sáng bắt đầu 6h30                 │
├──────────────────────────────────────────────────┤
│ 🔍 Tìm trong tin nhắn group...                   │
└──────────────────────────────────────────────────┘
```
- Trang **Báo cáo**: danh sách report đã gửi; bấm từng ý → thấy tin nhắn gốc (source_message_ids).
- Incident có trạng thái `open → in_progress → resolved`.
