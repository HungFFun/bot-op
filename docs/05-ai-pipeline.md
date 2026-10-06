# 05 — AI pipeline

## Nguyên tắc
- AI chỉ được dùng thông tin có trong tin nhắn/số liệu được cung cấp. Không suy đoán.
- Output luôn là JSON, validate bằng Zod; parse lỗi → retry 1 lần → vẫn lỗi thì đánh dấu insight category=`other`, log lại.
- Mỗi prompt có `prompt_version`, lưu vào insight/report để so sánh khi chỉnh prompt.
- Model nhỏ cho `classify-batch`; model lớn hơn cho `daily`/`weekly`. Tên model đặt trong `.env`.
- Chi phí: lọc rule trước khi gọi AI; gom lô theo group; cache kết quả theo zalo_msg_id.

## Prompt phân loại (v1)
System:
```
Bạn phân loại tin nhắn trong các group Zalo vận hành của nhà hàng BamThai.
Chi nhánh hợp lệ: {branch_codes}. Group này thuộc chi nhánh: {group_branch | "không rõ"}.
Với MỖI tin nhắn, trả về đúng 1 object. Chỉ dựa vào nội dung tin, không suy đoán.
category:
- incident: sự cố thiết bị, an toàn, thiếu người, hết hàng, khách phàn nàn, mất điện/nước
- announcement: thông báo, quy định, thay đổi lịch/giờ/giá từ quản lý
- report: báo cáo tình hình (doanh thu, lượng khách, tồn kho, kết thúc ca)
- request: nhờ việc, xin duyệt, hỏi ý kiến
- other: còn lại (chào hỏi, xác nhận, nói chuyện)
severity: critical (nguy hiểm/ngừng phục vụ) | high (ảnh hưởng vận hành ngay) | normal | low
summary: tiếng Việt, tối đa 20 từ, giữ tên người, số liệu, thời gian.
Chỉ trả JSON: {"items":[{"message_id","category","severity","summary","branch","needs_action"}]}
```
User: danh sách tin `[message_id] HH:mm Tên: nội dung` (kèm 5 tin trước đó làm ngữ cảnh, đánh dấu `context-only`).

## Prompt báo cáo ngày (v1)
Input: insights trong kỳ (id, giờ, group, người, category, severity, summary), incidents còn mở, số liệu order/chi (tính sẵn bằng SQL, AI không tự tính).
Yêu cầu output:
```json
{"sections":[{"key":"incidents|announcements|status|orders_expenses|follow_up",
  "items":[{"text":"...","source_message_ids":["..."]}]}]}
```
- Code render JSON → text theo template ở `docs/02-features.md` (AI không tự format emoji/tiêu đề).
- Mục `orders_expenses` do code điền từ SQL, không qua AI.

## Chống bịa
1. Mọi `source_message_ids` phải tồn tại trong input; ý nào không có nguồn hợp lệ → loại.
2. Số tiền/số lượng trong báo cáo chỉ đến từ SQL.
3. Trang web Báo cáo hiển thị tin gốc cho từng ý.
4. Lưu prompt + response thô 30 ngày để debug.

## Từ khoá khẩn (settings, sửa được trên web)
cháy, khói, chập điện, rò gas, mùi gas, ngộ độc, đau bụng (khách), cấp cứu, té ngã, bỏng, mất điện, cúp nước, hết hàng, hết món, nghỉ đột xuất, không đến, khách phàn nàn, đánh nhau, công an, kiểm tra (vệ sinh/thuế)
