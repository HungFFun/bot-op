# 07 — Lộ trình

Mỗi giai đoạn xong phải đạt "Tiêu chí hoàn thành" rồi mới sang giai đoạn sau. Đánh dấu [x] khi xong và cập nhật mục "Trạng thái hiện tại" trong CLAUDE.md.

## Giai đoạn 0 — Nền tảng (tuần 1)
- [x] Khởi tạo pnpm workspace, TS strict, ESLint + Prettier, Vitest
- [x] `docker-compose.yml` với postgres; `.env.example`
- [x] `packages/db`: Drizzle config, schema nhóm Tổ chức & người dùng, migration đầu, seed owner
- [x] `packages/shared`: format tiền/ngày VN, Zod base
- [x] `apps/api`: Fastify, plugin db/auth/rbac/error, `/api/health`, login PIN + session
- [x] `apps/web`: Vite + Tailwind + router, trang login, layout mobile
**Tiêu chí**: chạy `pnpm dev`, đăng nhập bằng owner seed, gọi `/api/auth/me` thành công.

## Giai đoạn 1 — Danh mục (tuần 2)
- [ ] Schema danh mục + giá + view latest price
- [ ] API CRUD NL/NCC/hạng mục, import CSV/XLSX
- [ ] Web admin danh mục, tìm không dấu
**Tiêu chí**: import file danh mục thật, màn danh sách NL hiện đúng giá gần nhất + NCC.

## Giai đoạn 2 — Order (tuần 3–4)
- [ ] Schema order; API tạo giỏ → batch + PO theo NCC
- [ ] Duyệt/từ chối, mark ordered, tin đặt hàng copy được
- [ ] Nhận hàng: SL + giá thực + ảnh → ghi ingredient_prices
- [ ] Web: order, giỏ (localStorage), PO list, duyệt, nhận hàng, lịch sử giá
- [ ] PWA + Web Push cho manager khi có PO mới
- [ ] Audit log
**Tiêu chí**: một order thật đi hết vòng submitted → received, giá gần nhất cập nhật.

## Giai đoạn 3 — Token chi (tuần 5)
- [ ] Sinh token + test unique/format
- [ ] Form chi, upload ảnh, trang token, tra cứu
- [ ] Duyệt / từ chối / paid; tự sinh expense khi PO received
- [ ] Báo cáo chi + xuất Excel
**Tiêu chí**: tạo, duyệt, paid một khoản chi; tra lại được bằng 4 ký tự cuối.

## Giai đoạn 4 — Zalo agent (tuần 6)
- [ ] Đăng nhập zca-js bằng QR, lưu session vào volume, tự reconnect
- [ ] Lắng nghe group → upsert zalo_groups, lưu group_messages, tải ảnh
- [ ] Web admin: đổi role group (monitor/report/ignore), xem agent_health
- [ ] Sender đọc reports queued (bật bằng cờ `AGENT_SEND_ENABLED`, mặc định false)
- [ ] Heartbeat + job agent-health + Web Push
- [ ] **Chạy chỉ đọc ~1 tuần** để thu dữ liệu thật
**Tiêu chí**: tin từ các group monitor xuất hiện trong DB < 5s; gửi thử 1 tin vào group report thành công.

## Giai đoạn 5 — AI báo cáo (tuần 7)
- [ ] `packages/ai`: client, prompt classify v1, Zod output
- [ ] Job classify-batch + lọc rule + từ khoá khẩn + incident + alert (chống trùng 30')
- [ ] Cron midday/daily/weekly, render template, validate source ids
- [ ] Web: dashboard vận hành, incidents, trang báo cáo xem tin gốc, tìm full-text
**Tiêu chí**: chạy lại trên dữ liệu 1 tuần thu được, quản lý đánh giá báo cáo ngày đúng & đủ.

## Giai đoạn 6 — Ổn định (tuần 8)
- [ ] backup.sh / restore.sh + thử khôi phục
- [ ] Healthcheck, giám sát disk/nhiệt
- [ ] Cloudflare Tunnel production, (tuỳ chọn) Cloudflare Access cho /admin
- [ ] Tinh chỉnh prompt theo phản hồi, bật `AGENT_SEND_ENABLED=true`
**Tiêu chí**: hệ thống chạy 7 ngày liên tục không can thiệp tay.
