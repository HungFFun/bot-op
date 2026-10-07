# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# bot-op — Hệ thống quản lý vận hành nhà hàng BamThai

Đọc file này trước mỗi phiên làm việc. Chi tiết nằm trong `docs/`.

## Dự án làm gì

1. **Web order nguyên liệu**: nhân viên chọn nguyên liệu (mã, giá nhập gần nhất, nhà cung cấp) và gửi order; quản lý duyệt; nhận hàng cập nhật giá.
2. **Token chi tiêu**: mỗi khoản chi có một mã ngắn duy nhất (vd `C-251006-7KXF`) gắn với nội dung chi, người chi, người duyệt, ảnh hoá đơn.
3. **Zalo agent + AI**: một tài khoản Zalo phụ (thư viện `zca-js`) đọc tin nhắn các group vận hành, AI phân loại/tổng hợp, rồi gửi cảnh báo và báo cáo định kỳ vào **group report**.

Nhân viên KHÔNG chat 1:1 với bot. Mọi thao tác nghiệp vụ làm trên web. Bot chỉ đọc group và gửi báo cáo.

## Tài liệu

| File                           | Nội dung                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| `docs/01-overview.md`          | Bối cảnh, kiến trúc, ràng buộc Zalo                        |
| `docs/02-features.md`          | Luồng nghiệp vụ + wireframe 3 chức năng + template báo cáo |
| `docs/03-database.md`          | Schema PostgreSQL chi tiết                                 |
| `docs/04-code-architecture.md` | Monorepo, module, API, hợp đồng giữa các app               |
| `docs/05-ai-pipeline.md`       | Phân loại tin, báo cáo, prompt, chống bịa                  |
| `docs/06-infra.md`             | Laptop Ubuntu làm server, Docker, Tunnel, backup           |
| `docs/07-roadmap.md`           | Các giai đoạn + checklist + tiêu chí hoàn thành            |
| `docs/08-open-questions.md`    | Câu hỏi nghiệp vụ chưa chốt — hỏi lại thay vì tự đoán      |

## Stack

- Node.js 22 LTS + TypeScript (strict), pnpm workspaces
- API: Fastify + Zod; ORM: Drizzle; DB: PostgreSQL 16; Queue/cron: pg-boss
- Web: React + Vite + Tailwind, PWA (Web Push qua `web-push`, VAPID keys trong `.env`)
- Zalo: `zca-js` (không chính thức) trên tài khoản Zalo phụ
- AI: Anthropic API — model đặt qua `AI_MODEL_CLASSIFY` / `AI_MODEL_REPORT` trong `.env`
- Test: Vitest, DB test là Postgres thật qua docker — mỗi package một database riêng (`<db>_test` cho api, `<db>_test_worker` cho worker) vì `pnpm test` chạy song song; tạo + migrate bằng `prepareTestDatabase(suffix)` (`packages/db/src/testing.ts`)
- Deploy: Docker Compose + Cloudflare Tunnel trên laptop Ubuntu Server

## Kiến trúc tổng thể

Monorepo: `apps/{api,web,worker,zalo-agent}` + `packages/{db,shared,ai}` (cây thư mục đầy đủ ở `docs/04`).

Bốn process chỉ giao tiếp qua **PostgreSQL** (bảng + hàng đợi pg-boss), không gọi nhau trực tiếp:

```
Zalo groups ──► zalo-agent ──insert──► group_messages ──pg-boss 'classify-batch'──► worker
                    ▲                                                                │ AI (packages/ai)
                    │ poll mỗi 10s: reports status=queued                            ▼
                    └──────────────── reports ◄── message_insights / incidents / cron report-*
web ◄──► api ◄──► DB (order, PO, expense, giá, audit_logs)
```

- **zalo-agent**: nhận tin → upsert `zalo_groups` (group mới role=`ignore`) → bỏ qua nếu group `report` hoặc tin từ chính bot → insert `group_messages` (ON CONFLICT `zalo_msg_id` DO NOTHING) → nếu role=`monitor` thì `boss.send('classify-batch', {groupId}, {singletonKey: groupId, startAfter: 120})` để debounce. Gửi: lấy `reports` queued bằng `FOR UPDATE SKIP LOCKED`, giãn ≥3s giữa tin, chỉ gửi khi `AGENT_SEND_ENABLED=true` (mặc định false). Heartbeat 60s vào `agent_health` (singleton row).
- **worker**: `classify-batch` (lọc rule/từ khoá khẩn trước, ≤30 tin/lần gọi AI, set `processed_at`, tạo incident + report alert nếu khẩn, chống trùng 30'), `report-midday|daily|weekly` (cron theo `REPORT_*_CRON`), `agent-health`, `push`, `backup`.
- **api**: REST prefix `/api`; plugin `db, auth, rbac, audit, error`. RBAC theo role `staff|manager|accountant|owner` + phạm vi chi nhánh (manager chỉ thấy branch của mình; owner/accountant `branch_id = null` = mọi chi nhánh). Đăng nhập bằng tên đăng nhập + mật khẩu; tài khoản do admin (role `owner`) cấp qua `/api/users`, không tự đăng ký. Session lưu hash token.
- **Order**: một giỏ → một `order_batches` + nhiều `purchase_orders` tách theo NCC (`PO-YYMMDD-NNNN`). `po_items.est_unit_price` là snapshot giá lúc đặt; nhận hàng ghi `ingredient_prices` (source=`po_receipt`) và tự sinh expense. Giá gần nhất lấy từ view `v_latest_price`.

## AI — chống bịa (bắt buộc)

- AI luôn trả JSON, validate bằng Zod; lỗi parse → retry 1 lần → vẫn lỗi thì category=`other` + log.
- Mỗi prompt có `prompt_version`, lưu cùng insight/report.
- Báo cáo: AI trả `sections[].items[]` kèm `source_message_ids`; code loại ý có id không nằm trong input. Code (không phải AI) render JSON → text theo template ở `docs/02`.
- Mọi con số tiền/số lượng trong báo cáo lấy từ SQL; mục `orders_expenses` do code điền, không qua AI.

## Quy ước bắt buộc

- **Tiền**: lưu `bigint` đơn vị đồng. Không dùng float. Format hiển thị `1.250.000đ`. Số lượng: `numeric(12,3)`.
- **Thời gian**: DB lưu `timestamptz` (UTC). Hiển thị và mọi cron theo `Asia/Ho_Chi_Minh`.
- **Ngôn ngữ**: UI, báo cáo, thông báo lỗi cho người dùng bằng tiếng Việt. Code, tên biến, tên bảng, commit bằng tiếng Anh.
- **zalo-agent phải "ngu"**: chỉ nhận tin → ghi DB, và đọc hàng đợi `reports` → gửi. Không có logic nghiệp vụ, không gọi AI. Mọi logic nằm ở `worker`.
- Group có `role = 'report'` KHÔNG BAO GIỜ được đưa vào pipeline phân loại (tránh vòng lặp đọc lại báo cáo của chính bot).
- Nếu zalo-agent chết, web order và token chi vẫn phải chạy bình thường.
- Mọi thay đổi dữ liệu nghiệp vụ (PO, expense, giá) ghi `audit_logs`.
- Validate input bằng Zod ở API; chia sẻ schema với web qua `packages/shared`.
- DB: PK `uuid default gen_random_uuid()`, mọi bảng có `created_at`, bảng có sửa có `updated_at`. File upload lưu ở `/data/uploads/YYYY/MM/`, không lưu blob trong DB.
- Web mobile-first (nhân viên bếp dùng điện thoại); tìm nguyên liệu không dấu (`xa lach` khớp `Xà lách`); giỏ order lưu localStorage.
- Không commit secret. Dùng `.env` (mẫu ở `.env.example`). Session Zalo (cookie/imei) lưu ngoài repo, trong volume `zalo-session`.
- Mỗi migration qua `drizzle-kit generate`, không sửa migration đã chạy.

## Lệnh

```bash
pnpm install
pnpm db:up            # docker compose up -d postgres
pnpm db:generate      # drizzle-kit generate --name <tên> sau khi sửa schema
pnpm db:migrate
pnpm db:seed          # admin (owner) lấy từ SEED_OWNER_USERNAME/PASSWORD trong .env
pnpm dev              # api (API_PORT, local 3100) + web :5173 (proxy /api) + worker
pnpm dev:agent        # chạy zalo-agent riêng (cần quét QR lần đầu)
pnpm test
pnpm lint && pnpm typecheck
```

Chạy một test (Vitest): `pnpm --filter <package> exec vitest run <file> -t "<tên test>"`.

Ưu tiên test: sinh token (unique, format), tách PO theo NCC, giá gần nhất, RBAC, parse output AI, lọc rule tin nhắn, chống vòng lặp group report.

## Ghi chú code hiện có

- Package nội bộ export thẳng `src/index.ts` (không build); api chạy bằng `tsx`, web qua Vite. ESM + `moduleResolution: Bundler`, import không cần đuôi `.js`.
- Env: `loadRootEnv()` (`packages/db/src/env.ts`) đọc `.env` ở root nếu có; trong Docker lấy từ compose.
- API: `buildApp(config)` trong `apps/api/src/app.ts` (test dùng `app.inject`). Lỗi cho người dùng: `throw new AppError(status, code, 'thông báo tiếng Việt')`; `ZodError` tự thành 400 với message của issue đầu tiên. Route cần đăng nhập: `preHandler: app.requireAuth` / `app.requireRole('manager', 'owner')`; lấy user bằng `currentUser(req)`; lọc chi nhánh bằng `canAccessBranch`.
- Session: cookie `sid` httpOnly, DB lưu HMAC(`SESSION_SECRET`) của token, hạn 30 ngày trượt. Sai mật khẩu 5 lần → khoá 15 phút (HTTP 423). Admin khoá tài khoản hoặc đặt lại mật khẩu → xoá mọi session của người đó. Admin không tự khoá / tự hạ quyền được.
- Tiền trong JSON API là số nguyên đồng (`moneySchema`); cột DB `bigint` dùng `mode: 'number'`. Số lượng là chuỗi thập phân (`qtySchema`, numeric(12,3)).
- Ghi DB nghiệp vụ trong `app.db.transaction` + `writeAudit(tx, …)` (`apps/api/src/lib/audit.ts`). Lỗi Postgres trùng/FK: `isUniqueViolation` / `isForeignKeyViolation` → 409/400.
- Danh mục: sửa được bởi `CATALOG_EDITOR_ROLES` (manager, owner); import chỉ owner. Nguyên liệu và NCC không xoá cứng, chỉ `active=false`.
- Tìm không dấu: cột `ingredients.search_text = ingredientSearchText(code, name)` do app tự cập nhật mỗi khi ghi code/name (index `pg_trgm`); mỗi từ trong query phải khớp.
- Import (`modules/ingredients/import.ts`): validate hết trước, có dòng lỗi thì không ghi gì (trả `rowErrors`); NCC/hạng mục khớp tên không dấu; không thêm giá nếu trùng giá gần nhất của cùng NCC.
- Brand (nguồn: `../Bam-Thai-Brand-Book/README.md`, nằm ngoài repo): token màu trong `apps/web/src/index.css` (`elephant` Cam Voi, `chili` Đỏ Ớt, `bamboo`/`bamboo-dark` Xanh Tre/Đốt, `cream` Kem, `ink` Mực Than + biến thể `-soft/-strong/-muted` đã kiểm WCAG AA). Nút chính `bg-elephant text-ink` (không chữ trắng trên cam, không dùng cam làm màu chữ; chữ đỏ dùng `chili-strong`). Logo qua `<Logo>` (tự giữ bề ngang ≥140px + khoảng thở); file ở `apps/web/public/brand/`. Font Be Vietnam Pro (`@fontsource`); font tiêu đề CDA Independence chưa nhúng vì chưa rõ giấy phép.
- Order/PO (`modules/purchase-orders`): giỏ → 1 `order_batches` + 1 PO mỗi NCC. Mỗi dòng có thể đổi NCC (`items[].supplierId`, vd ra chợ mua) và có ghi chú riêng (`po_items.note`, gửi kèm tin đặt hàng); không đổi thì dùng NCC mặc định. Món chưa có NCC gom chung 1 PO (supplier null, không ghi giá khi nhận). NCC khác của món: `ingredient_suppliers` (gợi ý khi đổi NCC, cột "NCC khác" khi import — import chỉ thêm, không xoá). Mã `PO-YYMMDD-NNNN` theo ngày VN, cấp số bằng advisory lock (`nextPoCodes`). Chuyển trạng thái qua `transition()`: khoá dòng `FOR UPDATE`, sai trạng thái → 409, quyền tính ở `allowedActions()` và trả về client trong `PoDetail.actions` (UI không tự suy luận quyền). Người khác chi nhánh → 404. Duyệt/từ chối/đặt NCC: `PO_APPROVER_ROLES` (manager chi nhánh, owner); nhận hàng: bất kỳ ai trong chi nhánh; người tạo được huỷ khi còn `submitted`.
- Ảnh: upload trước `POST /api/attachments` (owner null) rồi gắn khi submit form (`attachmentIds`); file ở `UPLOAD_DIR/YYYY/MM/`, chỉ người upload hoặc chi nhánh của PO xem được.
- Ảnh món: `ingredients.image_id` → `attachments` (owner_type `ingredient`, ai đăng nhập cũng xem được). Web thu nhỏ ảnh trên máy trước khi upload (`lib/image.ts`, ≤800px JPEG); ảnh phục vụ với cache `immutable` vì id không đổi nội dung.
- Hàng đợi: `startQueue()` / `QUEUES` / kiểu job ở `packages/db/src/queue.ts` (pg-boss v12, tự quản schema `pgboss`). Api chỉ `app.queue.send(...)` (test truyền queue giả, xem `sentJobs` trong `apps/api/test/helpers.ts`); worker `boss.work(...)`. Gửi job sau khi đã ghi DB, lỗi queue chỉ log, không làm hỏng request.
- Web Push: job `push` {userIds,title,body,url,tag} → worker `jobs/push.ts` gửi mọi thiết bị của user, xoá subscription 404/410, chỉ throw (retry) khi mọi thiết bị lỗi tạm. VAPID trong `.env` (thiếu thì worker chỉ log). Service worker `apps/web/public/sw.js` (chỉ push, không cache offline). iPhone chỉ nhận push khi mở app từ màn hình chính (iOS 16.4+); push cần https (localhost được, IP LAN thì không).
- Giỏ order lưu localStorage theo user (`features/orders/cart.ts`, `useSyncExternalStore`).
- TypeScript ghim `~6.0` vì typescript-eslint chưa hỗ trợ TS 7.

## Trạng thái hiện tại

Giai đoạn 0, 1 xong; danh mục thật (160 NL sau khi gộp món trùng tên, 18 NCC) đã nhập từ `BAM_ORDER HÀNG.xlsx` sheet T10.26. Giai đoạn 2 xong (2026-10-07): order → duyệt → đặt NCC → nhận hàng, PWA + Web Push báo quản lý/admin khi có đơn mới. Tiếp theo: Giai đoạn 3 — Token chi (gồm tự sinh khoản chi khi nhận hàng). Mỗi giai đoạn xong: đánh dấu [x] trong roadmap và cập nhật mục này.
