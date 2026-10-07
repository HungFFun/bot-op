# 03 — Database (PostgreSQL 16, Drizzle)

Quy ước: PK `id uuid default gen_random_uuid()`; mọi bảng có `created_at timestamptz default now()`, bảng có sửa có `updated_at`. Tiền = `bigint` (đồng). Số lượng = `numeric(12,3)`.

## Tổ chức & người dùng
**branches**: id, code (unique, vd `Q1`), name, address, active
**users**: id, username (unique, lowercase), name, phone (nullable, chỉ để liên hệ), role (`staff|manager|accountant|owner`), branch_id (null cho owner/accountant = mọi chi nhánh; bắt buộc với staff/manager), password_hash, failed_attempts int default 0, locked_until, zalo_uid (nullable, map người gửi tin group → nhân viên), active
**sessions**: id, user_id, token_hash (unique), device, expires_at, last_seen_at
**push_subscriptions**: id, user_id, endpoint (unique), p256dh, auth

## Danh mục
**suppliers**: id, name, phone, zalo_contact, address, payment_terms, note, active
**ingredient_categories**: id, name, sort_order
**ingredients**: id, code (unique, vd `RAU-012`), name, unit (`kg|g|l|chai|thùng|bó|cái|...`), category_id, default_supplier_id, min_order_qty, active, note
**ingredient_suppliers**: id, ingredient_id, supplier_id (unique cặp) — NCC khác ngoài NCC mặc định; gợi ý đầu tiên khi đổi NCC lúc order
**ingredient_prices**: id, ingredient_id, supplier_id, unit_price bigint, source (`po_receipt|manual|import`), po_item_id nullable, recorded_by, recorded_at
  - index (ingredient_id, recorded_at desc)

**View `v_latest_price`**:
```sql
SELECT DISTINCT ON (ingredient_id) ingredient_id, supplier_id, unit_price, recorded_at
FROM ingredient_prices ORDER BY ingredient_id, recorded_at DESC;
```
Thêm `v_latest_price_by_supplier` (DISTINCT ON ingredient_id, supplier_id) cho so sánh NCC.

## Order
**order_batches**: id, branch_id, created_by, note, needed_date
**purchase_orders**: id, code (unique, `PO-YYMMDD-NNNN`), batch_id, branch_id, supplier_id, status (`submitted|approved|rejected|ordered|received|cancelled`), needed_date, note, reject_reason, created_by, approved_by, approved_at, ordered_at, received_by, received_at
**po_items**: id, po_id, ingredient_id, qty_ordered, est_unit_price bigint (snapshot giá gần nhất của NCC của PO lúc đặt), qty_received nullable, actual_unit_price nullable, note (ghi chú từng món, gửi kèm tin đặt hàng)

## Chi tiêu
**expense_categories**: id, name, parent_id nullable, active
**expenses**: id, token (unique), type (`expense|advance|refund`), amount bigint, category_id, description, branch_id, payment_method (`cash|transfer|card`), status (`pending|approved|rejected|paid`), po_id nullable, created_by, approved_by, approved_at, reject_reason, paid_by, paid_at
  - index lower(token), index (branch_id, created_at)

**attachments**: id, owner_type (`expense|po|group_message`), owner_id, file_path, mime, size_bytes, uploaded_by
  - File lưu ở volume `/data/uploads/YYYY/MM/`, không lưu blob trong DB.

## Zalo & AI
**zalo_groups**: id, zalo_group_id (unique), name, branch_id nullable, role (`monitor|report|ignore`), created_at
  - Group mới agent thấy → tự insert với role=`ignore`, owner bật lên `monitor` trên web.
**group_messages**: id, group_id, zalo_msg_id (unique), sender_uid, sender_name, msg_type (`text|image|file|sticker|other`), content text, sent_at, raw jsonb, processed_at nullable
  - index (group_id, sent_at), GIN full-text trên content (config `simple` + unaccent)
**message_insights**: id, message_id, category (`incident|announcement|report|request|other`), severity (`critical|high|normal|low`), summary, branch_id nullable, needs_action bool, model, prompt_version, created_at
**incidents**: id, insight_id, branch_id, title, status (`open|in_progress|resolved`), assignee_id nullable, resolved_by, resolved_at, note
**reports**: id, type (`alert|midday|daily|weekly`), period_start, period_end, content text, items jsonb (mỗi ý + source_message_ids), status (`draft|queued|sent|failed`), attempts int, error, zalo_msg_id, sent_at
**agent_health**: singleton row — session_status (`ok|logged_out|error`), last_message_at, last_send_at, last_heartbeat_at, error

## Khác
**audit_logs**: id, user_id, action, entity, entity_id, diff jsonb, at
**settings**: key (pk), value jsonb — vd giờ báo cáo, ngưỡng cảnh báo giá, từ khoá khẩn

## Seed ban đầu
- 1 admin role owner (`SEED_OWNER_USERNAME` / `SEED_OWNER_PASSWORD` từ `.env`), chi nhánh mẫu, hạng mục chi mặc định: Nguyên liệu, Gas/chất đốt, Điện nước, Sửa chữa, Vật dụng, Lương/thưởng, Vận chuyển, Khác.
- Script import Excel/CSV cho ingredients + suppliers + giá ban đầu (`source=import`).
