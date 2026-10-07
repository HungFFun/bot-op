import {
  formatVnd,
  lineTotal,
  orderCreateSchema,
  type OrderCreateResult,
  type Supplier,
} from '@bot-op/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { QtyStepper } from '../../components/QtyStepper';
import {
  Button,
  Empty,
  ErrorText,
  Field,
  Input,
  PageHeader,
  Select,
  StickyActionBar,
} from '../../components/ui';
import { useSuppliers } from '../../features/catalog/queries';
import {
  lineSupplier,
  linePrice,
  normalizeQty,
  todayVn,
  useCart,
  type CartLine,
} from '../../features/orders/cart';
import { useCreateOrder } from '../../features/orders/queries';

const lineAmount = (l: CartLine) => {
  const qty = normalizeQty(l.qty);
  const price = linePrice(l);
  return qty && price ? lineTotal(qty, price) : 0;
};

export function CartPage() {
  const { cart, lines, setQty, setLineSupplier, setLineNote, setNote, setNeededDate, clear } =
    useCart();
  const suppliers = useSuppliers();
  const create = useCreateOrder();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  // Which line has its supplier/note editor open (kept by id, so it stays open when the line moves group).
  const [editing, setEditing] = useState<string | null>(null);

  if (!lines.length) {
    return (
      <div>
        <PageHeader title="Giỏ order" back="/order" />
        <Empty>
          Giỏ đang trống.{' '}
          <Link
            to="/order"
            className="font-semibold text-ink underline decoration-elephant decoration-2"
          >
            Chọn nguyên liệu
          </Link>
        </Empty>
      </div>
    );
  }

  // One group per supplier actually chosen — this is how the order will be split into POs.
  const groups = new Map<string, { name: string; lines: CartLine[] }>();
  for (const l of [...lines].sort((a, b) => a.code.localeCompare(b.code))) {
    const s = lineSupplier(l);
    const key = s?.id ?? '';
    const g = groups.get(key) ?? { name: s?.name ?? 'Chưa có NCC', lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0));

  const submit = () => {
    const parsed = orderCreateSchema.safeParse({
      neededDate: cart.neededDate,
      note: cart.note,
      items: lines.map((l) => ({
        ingredientId: l.ingredientId,
        qty: l.qty,
        supplierId: l.chosenSupplier?.id ?? null,
        note: l.note,
      })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const lineIdx = issue?.path[0] === 'items' ? Number(issue.path[1]) : NaN;
      setFormError(
        Number.isInteger(lineIdx)
          ? `${lines[lineIdx]?.name}: ${issue?.message}`
          : (issue?.message ?? 'Dữ liệu không hợp lệ'),
      );
      return;
    }
    setFormError(null);
    create.mutate(parsed.data, {
      onSuccess: (result: OrderCreateResult) => {
        clear();
        navigate('/order/sent', { replace: true, state: result });
      },
    });
  };

  return (
    <div>
      <PageHeader title={`Giỏ order (${lines.length} món)`} back="/order" />
      <div className="grid gap-3">
        {sortedGroups.map(([key, g]) => {
          const subtotal = g.lines.reduce((s, l) => s + lineAmount(l), 0);
          return (
            <section key={key} className="rounded-2xl border border-line">
              <h2 className="flex items-center justify-between rounded-t-2xl bg-cream px-3 py-2 font-semibold">
                <span>{g.name}</span>
                <span className="text-sm font-normal text-ink-muted">{g.lines.length} món</span>
              </h2>
              <ul className="divide-y divide-line px-3">
                {g.lines.map((l) => (
                  <CartLineRow
                    key={l.ingredientId}
                    line={l}
                    open={editing === l.ingredientId}
                    onToggle={() =>
                      setEditing((e) => (e === l.ingredientId ? null : l.ingredientId))
                    }
                    allSuppliers={suppliers.data ?? []}
                    onQty={(v) => setQty(l, v)}
                    onSupplier={(s) => setLineSupplier(l.ingredientId, s)}
                    onNote={(n) => setLineNote(l.ingredientId, n)}
                  />
                ))}
              </ul>
              {subtotal > 0 && (
                <div className="border-t border-line px-3 py-2 text-right text-sm">
                  Tạm tính: <b>{formatVnd(subtotal)}</b>
                </div>
              )}
            </section>
          );
        })}

        <Field label="Ngày cần hàng">
          <Input
            type="date"
            min={todayVn()}
            value={cart.neededDate}
            onChange={(e) => setNeededDate(e.target.value)}
          />
        </Field>
        <Field
          label="Ghi chú chung cho NCC"
          hint="Gửi kèm trong tin đặt hàng của mọi NCC, vd: giao trước 9h"
        >
          <Input
            value={cart.note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Không bắt buộc"
          />
        </Field>

        <ErrorText error={formError ? { message: formError } : create.error} />
      </div>
      <StickyActionBar>
        <Button onClick={submit} disabled={create.isPending} className="w-full py-3 text-lg">
          {create.isPending ? 'Đang gửi…' : 'GỬI ORDER'}
        </Button>
      </StickyActionBar>
    </div>
  );
}

function CartLineRow({
  line: l,
  open,
  onToggle,
  allSuppliers,
  onQty,
  onSupplier,
  onNote,
}: {
  line: CartLine;
  open: boolean;
  onToggle: () => void;
  allSuppliers: Supplier[];
  onQty: (v: string) => void;
  onSupplier: (s: { id: string; name: string } | null) => void;
  onNote: (n: string) => void;
}) {
  const price = linePrice(l);
  const current = lineSupplier(l);
  // Suggested first: default + this ingredient's known alternates; then everyone else (e.g. Chợ).
  const suggested = [
    ...(l.supplierId && l.supplierName
      ? [{ id: l.supplierId, name: `${l.supplierName} (mặc định)` }]
      : []),
    ...l.alternateSuppliers,
  ];
  const others = allSuppliers.filter((s) => !suggested.some((x) => x.id === s.id));

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="leading-snug font-semibold">{l.name}</div>
          <div className="truncate text-sm text-ink-muted">
            {price ? `${formatVnd(price)}/${l.unit}` : l.unit}
            {l.chosenSupplier && (
              <span className="font-semibold text-ink">
                {' '}
                · đổi từ {l.supplierName ?? 'chưa có NCC'}
              </span>
            )}
          </div>
          {l.note && !open && <div className="truncate text-sm text-ink italic">📝 {l.note}</div>}
        </div>
        <QtyStepper label={l.name} value={l.qty} onChange={onQty} />
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="mt-1 min-h-9 rounded-lg px-2 text-sm text-ink-muted underline decoration-line-strong underline-offset-2 active:bg-cream -ml-2"
      >
        {open ? 'Xong' : 'Đổi NCC · Ghi chú'}
      </button>
      {open && (
        <div className="mt-1 grid gap-2 rounded-xl bg-cream p-3">
          <Field label="Mua ở">
            <Select
              value={current?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                const s = [...suggested, ...allSuppliers].find((x) => x.id === id);
                onSupplier(id && s ? { id, name: s.name.replace(' (mặc định)', '') } : null);
              }}
            >
              {!l.supplierId && <option value="">Chưa có NCC</option>}
              {suggested.length > 0 && (
                <optgroup label="Gợi ý">
                  {suggested.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="NCC khác">
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Field>
          <Field label="Ghi chú cho món này">
            <Input
              value={l.note}
              onChange={(e) => onNote(e.target.value)}
              placeholder="vd: lấy củ nhỏ, trái chín"
            />
          </Field>
        </div>
      )}
    </li>
  );
}
