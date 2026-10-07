import { formatQty, formatVnd, lineTotal, poReceiveSchema, type PoDetail } from '@bot-op/shared';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { QtyStepper } from '../../components/QtyStepper';
import {
  Button,
  Empty,
  ErrorText,
  MoneyInput,
  PageHeader,
  StickyActionBar,
} from '../../components/ui';
import { normalizeQty } from '../../features/orders/cart';
import { uploadAttachment, usePoAction, usePurchaseOrder } from '../../features/orders/queries';

export function PoReceivePage() {
  const { id } = useParams();
  const po = usePurchaseOrder(id);
  if (po.isPending) return <Empty>Đang tải…</Empty>;
  if (po.isError) return <ErrorText error={po.error} />;
  if (!po.data.actions.includes('receive'))
    return <Empty>Đơn này không ở trạng thái nhận hàng.</Empty>;
  return <ReceiveForm po={po.data} />;
}

type Line = { qty: string; price: number | null };

function ReceiveForm({ po }: { po: PoDetail }) {
  const action = usePoAction(po.id);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  // Defaults: everything arrived at the estimated price; staff correct what differs.
  const [lines, setLines] = useState<Record<string, Line>>(() =>
    Object.fromEntries(
      po.items.map((i) => [i.id, { qty: formatQty(i.qtyOrdered), price: i.estUnitPrice }]),
    ),
  );
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (id: string, patch: Partial<Line>) =>
    setLines((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }));
  const total = po.items.reduce((sum, i) => {
    const l = lines[i.id]!;
    const q = normalizeQty(l.qty || '0');
    return q && l.price ? sum + lineTotal(q, l.price) : sum;
  }, 0);

  const onPhoto = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setFormError(null);
    try {
      for (const f of Array.from(files)) {
        const att = await uploadAttachment(f);
        setPhotos((p) => [...p, { id: att.id, url: URL.createObjectURL(f) }]);
      }
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = () => {
    const parsed = poReceiveSchema.safeParse({
      items: po.items.map((i) => ({
        id: i.id,
        qtyReceived: lines[i.id]!.qty || '0',
        actualUnitPrice: lines[i.id]!.price,
      })),
      attachmentIds: photos.map((p) => p.id),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const idx = Number(issue?.path[1]);
      setFormError(
        Number.isInteger(idx)
          ? `${po.items[idx]?.name}: ${issue?.message}`
          : (issue?.message ?? 'Dữ liệu không hợp lệ'),
      );
      return;
    }
    setFormError(null);
    action.mutate(
      { action: 'receive', body: parsed.data },
      { onSuccess: () => navigate(`/po/${po.id}`, { replace: true }) },
    );
  };

  return (
    <div>
      <PageHeader title="Nhận hàng" back={`/po/${po.id}`} />
      <p className="mb-3 text-sm text-ink-muted">
        {po.supplier?.name ?? 'Chưa có NCC'} · <span className="font-mono">{po.code}</span>. Nhập số
        lượng và đơn giá <b>thực tế trên hoá đơn</b>. Món không giao thì để số lượng 0.
      </p>
      <ul className="grid gap-2">
        {po.items.map((i) => {
          const l = lines[i.id]!;
          const notDelivered = !normalizeQty(l.qty || '0') || normalizeQty(l.qty || '0') === '0';
          return (
            <li key={i.id} className="rounded-2xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold leading-snug">{i.name}</div>
                  {i.note && <div className="text-sm text-ink italic">📝 {i.note}</div>}
                  <div className="text-sm text-ink-muted">
                    Đặt {formatQty(i.qtyOrdered)} {i.unit}
                  </div>
                </div>
                <QtyStepper label={i.name} value={l.qty} onChange={(v) => set(i.id, { qty: v })} />
              </div>
              {!notDelivered && (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <span className="shrink-0 text-ink-muted">Đơn giá / {i.unit}</span>
                  <MoneyInput
                    value={l.price}
                    onChange={(price) => set(i.id, { price })}
                    placeholder="đ"
                    className="!mt-0 !py-2 text-right"
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => onPhoto(e.target.files)}
        />
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <img
              key={p.id}
              src={p.url}
              alt="Hoá đơn"
              className="size-20 rounded-xl border border-line object-cover"
            />
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex size-20 flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong text-xs text-ink-muted"
          >
            <span className="text-2xl">📷</span>
            {uploading ? 'Đang tải…' : 'Ảnh hoá đơn'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-cream p-3">
        <span>Tổng thực nhận</span>
        <span className="text-xl font-bold">{formatVnd(total)}</span>
      </div>
      <div className="mt-3">
        <ErrorText error={formError ? { message: formError } : action.error} />
      </div>
      <StickyActionBar>
        <Button
          onClick={submit}
          disabled={action.isPending || uploading}
          className="w-full py-3 text-lg"
        >
          {action.isPending ? 'Đang lưu…' : 'Xác nhận đã nhận hàng'}
        </Button>
      </StickyActionBar>
    </div>
  );
}
