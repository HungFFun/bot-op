import { z } from 'zod';
import { moneySchema, qtySchema } from './catalog';
import { uuidSchema, type BranchRef, type UserRole } from './schemas';

export const PO_STATUSES = [
  'submitted',
  'approved',
  'rejected',
  'ordered',
  'received',
  'cancelled',
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  submitted: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  ordered: 'Đã đặt NCC',
  received: 'Đã nhận hàng',
  cancelled: 'Đã huỷ',
};

/** Roles that approve/reject purchase orders and place them with suppliers (managers: own branch only). */
export const PO_APPROVER_ROLES = ['manager', 'owner'] as const satisfies readonly UserRole[];

export type PoAction = 'approve' | 'reject' | 'mark_ordered' | 'receive' | 'cancel';

/** "2.5" → 2500n. Quantities have at most 3 decimals (numeric(12,3)). */
export function qtyToMilli(qty: string): bigint {
  const [int = '0', frac = ''] = qty.split('.');
  return BigInt(int) * 1000n + BigInt(frac.padEnd(3, '0').slice(0, 3) || '0');
}

/** qty × unit price in đồng, rounded half up. Integer math only. */
export function lineTotal(qty: string, unitPrice: number): number {
  return Number((qtyToMilli(qty) * BigInt(unitPrice) + 500n) / 1000n);
}

/** "2.500" → "2,5"; "3.000" → "3"; "1000" → "1.000" (Vietnamese: dot thousands, comma decimals). */
export function formatQty(qty: string): string {
  const trimmed = qty.includes('.') ? qty.replace(/\.?0+$/, '') : qty;
  const [int = '0', frac] = trimmed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${grouped},${frac}` : grouped;
}

/** "2026-10-06" → "06/10". */
export const formatDateOnly = (isoDate: string) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;

/** The message staff copy and send to the supplier (Zalo/SMS). Plain text, no markdown. */
export function supplierMessage(po: {
  code: string;
  branchName: string;
  neededDate: string;
  note: string | null;
  items: { name: string; qty: string; unit: string; note?: string | null }[];
}): string {
  const note = po.note ? ` (${po.note})` : '';
  return [
    `${po.branchName} đặt hàng ngày ${formatDateOnly(po.neededDate)}${note}:`,
    ...po.items.map(
      (i) => `- ${i.name}: ${formatQty(i.qty)} ${i.unit}${i.note ? ` (${i.note})` : ''}`,
    ),
    `Mã đơn: ${po.code}. Cảm ơn anh/chị!`,
  ].join('\n');
}

export const dateOnlySchema = z
  .string({ error: 'Vui lòng chọn ngày' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Ngày không hợp lệ' })
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), { error: 'Ngày không hợp lệ' });

const positiveQty = qtySchema.refine((v) => qtyToMilli(v) > 0n, {
  error: 'Số lượng phải lớn hơn 0',
});

const optionalNote = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullish();

export const orderCreateSchema = z
  .object({
    /** Required for owner/accountant (no home branch); ignored for staff/manager. */
    branchId: uuidSchema.nullish(),
    neededDate: dateOnlySchema,
    note: optionalNote,
    items: z
      .array(
        z.object({
          ingredientId: uuidSchema,
          qty: positiveQty,
          /** Buy this line from another supplier than the ingredient's default (e.g. small quantity → market). */
          supplierId: uuidSchema.nullish(),
          note: optionalNote,
        }),
      )
      .min(1, { error: 'Giỏ order đang trống' })
      .max(300),
  })
  .refine((v) => new Set(v.items.map((i) => i.ingredientId)).size === v.items.length, {
    error: 'Một nguyên liệu xuất hiện hai lần trong giỏ',
    path: ['items'],
  });
export type OrderCreateInput = z.input<typeof orderCreateSchema>;

export const poApproveSchema = z.object({
  /** Optional quantity edits made by the approver. */
  items: z.array(z.object({ id: uuidSchema, qtyOrdered: positiveQty })).optional(),
});

export const poRejectSchema = z.object({
  reason: z
    .string({ error: 'Vui lòng nhập lý do từ chối' })
    .trim()
    .min(1, { error: 'Vui lòng nhập lý do từ chối' })
    .max(500),
});

export const poCancelSchema = z.object({ reason: optionalNote });

export const poReceiveSchema = z.object({
  items: z
    .array(
      z
        .object({
          id: uuidSchema,
          /** 0 = not delivered. */
          qtyReceived: qtySchema,
          actualUnitPrice: moneySchema.nullish(),
        })
        .superRefine((v, ctx) => {
          if (
            qtyToMilli(v.qtyReceived) > 0n &&
            (v.actualUnitPrice === null || v.actualUnitPrice === undefined)
          ) {
            ctx.addIssue({
              code: 'custom',
              path: ['actualUnitPrice'],
              message: 'Vui lòng nhập đơn giá thực tế',
            });
          }
        }),
    )
    .min(1),
  attachmentIds: z.array(uuidSchema).max(10).default([]),
});
export type PoReceiveInput = z.input<typeof poReceiveSchema>;

export const poListQuerySchema = z.object({
  status: z.enum(PO_STATUSES).optional(),
  branch: uuidSchema.optional(),
});

type PersonRef = { id: string; name: string };

export type PoListItem = {
  id: string;
  code: string;
  status: PoStatus;
  branch: BranchRef;
  supplier: { id: string; name: string } | null;
  neededDate: string;
  note: string | null;
  itemCount: number;
  /** Sum of qty × last known price; lines without a price are not counted (see itemsWithoutPrice). */
  estTotal: number;
  itemsWithoutPrice: number;
  createdAt: string;
  createdBy: PersonRef;
};

export type PoItem = {
  id: string;
  ingredientId: string;
  code: string;
  name: string;
  unit: string;
  qtyOrdered: string;
  estUnitPrice: number | null;
  qtyReceived: string | null;
  actualUnitPrice: number | null;
  note: string | null;
};

export type PoDetail = PoListItem & {
  items: PoItem[];
  rejectReason: string | null;
  approvedBy: PersonRef | null;
  approvedAt: string | null;
  orderedAt: string | null;
  receivedBy: PersonRef | null;
  receivedAt: string | null;
  /** Sum of qty received × actual price, once received. */
  actualTotal: number | null;
  attachments: { id: string; mime: string }[];
  /** What the current user may do now — computed by the server so the UI does not duplicate the rules. */
  actions: PoAction[];
};

export type OrderCreateResult = { batchId: string; purchaseOrders: PoListItem[] };
