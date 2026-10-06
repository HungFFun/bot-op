# 01 — Tổng quan & kiến trúc

## Bối cảnh
Nhà hàng vận hành qua nhiều group Zalo (bếp, quản lý, từng chi nhánh). Cần:
- Một nơi chuẩn để nhân viên order nguyên liệu, có sẵn giá nhập gần nhất và nhà cung cấp.
- Một cách truy vết mọi khoản chi bằng mã ngắn.
- Nắm tình hình vận hành, sự cố, thông báo mà không phải đọc hết các group.

## Ràng buộc Zalo (quan trọng)
- Zalo Bot Platform chính thức (bot.zaloplatforms.com) chỉ hỗ trợ hội thoại 1:1; bot không thêm được vào group. Zalo OA cũng không vào group.
- Vì vậy dùng **tài khoản Zalo cá nhân phụ** + thư viện `zca-js` để đọc group và gửi vào group report.
- Đây là cách không chính thức, vi phạm điều khoản Zalo, có rủi ro bị khoá tài khoản. Biện pháp giảm rủi ro:
  - SIM riêng, tên hiển thị rõ ràng "Bot Vận Hành", không dùng tài khoản của chủ/quản lý.
  - Chủ yếu đọc thụ động; chỉ gửi vào MỘT group report, vài tin/ngày.
  - Không gửi tin cho người lạ, không kết bạn hàng loạt, không spam.
  - Chạy chế độ chỉ đọc ~1 tuần trước khi bật gửi.
  - Kiến trúc cô lập: agent chết không ảnh hưởng web.

## Kiến trúc
```
   NHÂN VIÊN                              ZALO
      │                       Group Bếp ─┐  Group QL ─┐  Group Report
      │ trình duyệt                      ▼            ▼       ▲
      ▼                              ┌──────────────────────────┴──┐
 ┌─────────────┐                     │ zalo-agent (zca-js, TK phụ) │
 │ Web App PWA │                     │  • nghe tin  • gửi báo cáo  │
 │ order / chi │                     └──────────┬──────────────────┘
 └──────┬──────┘                                │
        ▼                                       ▼
 ┌──────────────────────────────────────────────────────┐
 │ API (Fastify) ── PostgreSQL ── Worker (pg-boss + AI) │
 └──────────────────────────────────────────────────────┘
          Laptop Ubuntu Server · Cloudflare Tunnel cho web
```

Hai khối gần như độc lập:
- **Khối Web**: `web` + `api` → order, token chi, quản trị, xem báo cáo.
- **Khối Zalo**: `zalo-agent` + `worker` → đọc tin, AI, gửi báo cáo.
Hai khối chỉ gặp nhau ở DB (báo cáo ngày kèm số liệu order/chi).

## Vai trò người dùng
| Role | Quyền |
|---|---|
| `staff` | Order, nhận hàng, tạo khoản chi, xem token của mình |
| `manager` | + duyệt order, duyệt chi, xem dashboard vận hành chi nhánh mình |
| `accountant` | + đánh dấu đã chi, xuất báo cáo chi tất cả chi nhánh |
| `owner` | Tất cả, quản trị user/chi nhánh/group Zalo |
