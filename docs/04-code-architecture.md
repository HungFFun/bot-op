# 04 — Kiến trúc code

## Monorepo (pnpm workspaces)
```
bot-op/
├── apps/
│   ├── api/            # Fastify REST
│   │   └── src/
│   │       ├── modules/{auth,users,branches,suppliers,ingredients,prices,
│   │       │            orders,expenses,attachments,ops,reports,admin}
│   │       ├── plugins/{db,auth,rbac,audit,error}
│   │       └── server.ts
│   ├── web/            # React + Vite + Tailwind, PWA
│   │   └── src/{pages,components,features,lib/api}
│   ├── worker/         # pg-boss: jobs + cron
│   │   └── src/jobs/{classify-batch,alert,report-midday,report-daily,
│   │                 report-weekly,agent-health,backup,push}
│   └── zalo-agent/     # zca-js: listen + send, không có logic nghiệp vụ
│       └── src/{login,listener,sender,health}.ts
├── packages/
│   ├── db/             # Drizzle schema, migrations, seed, import scripts
│   ├── shared/         # Zod schemas, types, token gen, format tiền/ngày VN
│   └── ai/             # client Anthropic, prompts có version, parse JSON
├── docker/             # Dockerfile từng app
├── ops/                # backup.sh, restore.sh, healthcheck
├── docker-compose.yml
├── .env.example
└── CLAUDE.md
```

## API (REST, prefix `/api`)
| Method | Path | Role |
|---|---|---|
| POST | /auth/login · /auth/logout · GET /auth/me | public / any |
| GET | /ingredients?q=&category= (kèm giá gần nhất + NCC) | staff+ |
| CRUD | /ingredients · /suppliers · /categories | manager+ |
| POST | /ingredients/import (multipart CSV/XLSX) | owner |
| GET | /ingredients/:id/prices | staff+ |
| POST | /orders (giỏ → batch + nhiều PO) | staff+ |
| GET | /purchase-orders?status=&branch= | staff+ |
| POST | /purchase-orders/:id/approve · /reject · /mark-ordered · /receive | theo role |
| GET | /purchase-orders/:id/supplier-message | staff+ |
| POST | /expenses · GET /expenses?filters · GET /expenses/:token | staff+ |
| POST | /expenses/:id/approve · /reject · /pay | manager+ / accountant |
| GET | /expenses/export.xlsx | accountant+ |
| POST | /attachments (upload ảnh) | staff+ |
| GET | /ops/feed · /ops/search?q= · /incidents · PATCH /incidents/:id | manager+ |
| GET | /reports · /reports/:id (kèm tin nguồn) | manager+ |
| GET/PATCH | /zalo-groups (đổi role) · GET /agent-health | owner |
| POST | /push/subscribe | any |

RBAC: plugin kiểm tra role + phạm vi branch (manager chỉ thấy chi nhánh mình).

## Hợp đồng zalo-agent ↔ hệ thống (chỉ qua DB)
**Nhận tin** (agent làm):
1. Tin đến → upsert `zalo_groups` (group mới role=`ignore`).
2. Nếu role=`report` hoặc tin từ chính tài khoản bot → bỏ qua.
3. Insert `group_messages` (ON CONFLICT zalo_msg_id DO NOTHING). Ảnh: tải về `/data/uploads`, tạo attachment.
4. Nếu role=`monitor` → `boss.send('classify-batch', {groupId}, {singletonKey: groupId, startAfter: 120})` (debounce).

**Gửi** (agent làm):
- Mỗi 10s: lấy `reports` status=`queued` (SELECT … FOR UPDATE SKIP LOCKED), gửi vào group role=`report`, cập nhật `sent`/`failed`. Giãn cách tối thiểu 3s giữa các tin.
- Nếu không có group report nào → ghi lỗi vào agent_health, không gửi.

**Heartbeat**: mỗi 60s cập nhật `agent_health.last_heartbeat_at`, `session_status`.

## Worker
- `classify-batch`: lấy tin `processed_at IS NULL` của group → lọc rule → gọi AI theo lô (≤ 30 tin/lần) → insert insights → set processed_at → nếu khẩn: tạo incident + report alert (status=queued).
- `report-*`: cron theo `Asia/Ho_Chi_Minh`, gom insights + số liệu order/chi trong kỳ → AI viết báo cáo → validate source ids → insert report queued.
- `agent-health`: mỗi 15 phút; trong giờ làm (7h–23h) mà không có tin > 3h hoặc heartbeat > 5 phút hoặc report failed → Web Push cho owner.
- `push`: gửi Web Push (thư viện `web-push`, VAPID keys trong .env).
- `backup`: 03:00 hằng ngày gọi `ops/backup.sh`.

## Web — các trang
`/login` · `/order` · `/cart` · `/po` (danh sách, duyệt, nhận hàng) · `/expenses/new` · `/expenses` · `/expenses/:token` · `/ops` (dashboard) · `/reports` · `/admin/{ingredients,suppliers,users,groups,settings}`
- Mobile-first, chữ to, nút to (nhân viên bếp dùng điện thoại, tay ướt).
- Tìm NL không dấu (`xa lach` khớp `Xà lách`).
- Giỏ order lưu localStorage để không mất khi mạng chập chờn.

## Testing
- Vitest. Ưu tiên test: sinh token (unique, format), tách PO theo NCC, tính giá gần nhất, RBAC, parse output AI, lọc rule tin nhắn, chống vòng lặp group report.
- Test DB dùng Postgres thật qua docker (schema riêng cho test).
