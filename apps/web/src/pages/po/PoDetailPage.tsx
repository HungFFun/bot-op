import {
  formatDateOnly,
  formatDateTime,
  formatQty,
  formatVnd,
  lineTotal,
  type PoDetail,
} from '@bot-op/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { QtyStepper } from '../../components/QtyStepper';
import { Button, Empty, ErrorText, Input, PageHeader } from '../../components/ui';
import { normalizeQty } from '../../features/orders/cart';
import { PoStatusBadge } from '../../features/orders/PoStatusBadge';
import { fetchSupplierMessage, usePoAction, usePurchaseOrder } from '../../features/orders/queries';

export function PoDetailPage() {
  const { id } = useParams();
  const po = usePurchaseOrder(id);
  if (po.isPending) return <Empty>Đang tải…</Empty>;
  if (po.isError) return <ErrorText error={po.error} />;
  return <PoView key={po.data.id + po.data.status} po={po.data} />;
}

function PoView({ po }: { po: PoDetail }) {
  const action = usePoAction(po.id);
  const navigate = useNavigate();
  const can = (a: PoDetail['actions'][number]) => po.actions.includes(a);
  // Approver may adjust quantities before approving.
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(po.items.map((i) => [i.id, formatQty(i.qtyOrdered)])),
  );
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // 'copied' = in clipboard; a string = shown for manual copy (no clipboard on plain http).
  const [copy, setCopy] = useState<'idle' | 'copied' | { manual: string }>('idle');
  const editable = can('approve');
  const received = po.status === 'received';

  const approve = () => {
    const changed = po.items
      .filter((i) => normalizeQty(qty[i.id] ?? '') !== normalizeQty(i.qtyOrdered))
      .map((i) => ({ id: i.id, qtyOrdered: qty[i.id] ?? '' }));
    action.mutate({ action: 'approve', body: changed.length ? { items: changed } : {} });
  };

  const copyMessage = async () => {
    const text = await fetchSupplierMessage(po.id);
    try {
      await navigator.clipboard.writeText(text);
      setCopy('copied');
    } catch {
      setCopy({ manual: text });
    }
  };

  const cancel = () => {
    if (window.confirm(`Huỷ đơn ${po.code}?`)) action.mutate({ action: 'cancel', body: {} });
  };

  return (
    <div>
      <PageHeader
        title={po.supplier?.name ?? 'Chưa có NCC'}
        back="/po"
        action={<PoStatusBadge status={po.status} />}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl bg-cream p-3 text-sm">
        <dt className="text-ink-muted">Mã đơn</dt>
        <dd className="font-mono font-semibold">{po.code}</dd>
        <dt className="text-ink-muted">Chi nhánh</dt>
        <dd>{po.branch.name}</dd>
        <dt className="text-ink-muted">Ngày cần</dt>
        <dd>{formatDateOnly(po.neededDate)}</dd>
        {po.note && (
          <>
            <dt className="text-ink-muted">Ghi chú</dt>
            <dd>{po.note}</dd>
          </>
        )}
        <dt className="text-ink-muted">Người order</dt>
        <dd>
          {po.createdBy.name} · {formatDateTime(po.createdAt)}
        </dd>
        {po.approvedBy && (
          <>
            <dt className="text-ink-muted">
              {po.status === 'rejected' ? 'Người từ chối' : 'Người duyệt'}
            </dt>
            <dd>
              {po.approvedBy.name} · {formatDateTime(po.approvedAt!)}
            </dd>
          </>
        )}
        {po.orderedAt && (
          <>
            <dt className="text-ink-muted">Đã đặt NCC</dt>
            <dd>{formatDateTime(po.orderedAt)}</dd>
          </>
        )}
        {po.receivedBy && (
          <>
            <dt className="text-ink-muted">Người nhận</dt>
            <dd>
              {po.receivedBy.name} · {formatDateTime(po.receivedAt!)}
            </dd>
          </>
        )}
        {po.rejectReason && (
          <>
            <dt className="text-ink-muted">Lý do</dt>
            <dd className="font-semibold text-chili-strong">{po.rejectReason}</dd>
          </>
        )}
      </dl>

      <ul className="mt-3 divide-y divide-line">
        {po.items.map((i) => {
          const q = received ? i.qtyReceived : normalizeQty(qty[i.id] ?? '');
          const price = received ? i.actualUnitPrice : i.estUnitPrice;
          return (
            <li key={i.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-semibold leading-snug">{i.name}</div>
                {i.note && <div className="text-sm text-ink italic">📝 {i.note}</div>}
                <div className="text-sm text-ink-muted">
                  {received ? (
                    <>
                      Đặt {formatQty(i.qtyOrdered)} · nhận{' '}
                      <b className="text-ink">{formatQty(i.qtyReceived ?? '0')}</b> {i.unit}
                    </>
                  ) : (
                    <>{price ? `${formatVnd(price)}/${i.unit}` : `Chưa có giá · ${i.unit}`}</>
                  )}
                  {received && price ? ` · ${formatVnd(price)}/${i.unit}` : ''}
                </div>
              </div>
              {editable ? (
                <QtyStepper
                  label={i.name}
                  value={qty[i.id] ?? ''}
                  onChange={(v) => setQty((s) => ({ ...s, [i.id]: v }))}
                />
              ) : (
                <div className="text-right">
                  {!received && (
                    <div className="font-semibold">
                      {formatQty(i.qtyOrdered)} {i.unit}
                    </div>
                  )}
                  {q && price ? (
                    <div className="text-sm text-ink-muted">{formatVnd(lineTotal(q, price))}</div>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 rounded-2xl bg-cream p-3 text-sm">
        {received ? (
          <div className="flex justify-between text-base">
            <span>Thực nhận</span>
            <b>{formatVnd(po.actualTotal ?? 0)}</b>
          </div>
        ) : (
          <div className="flex justify-between text-base">
            <span>Dự kiến</span>
            <b>{formatVnd(po.estTotal)}</b>
          </div>
        )}
        {!received && po.itemsWithoutPrice > 0 && (
          <p className="mt-1 text-ink-muted">
            {po.itemsWithoutPrice} món chưa có giá, chưa tính vào tổng.
          </p>
        )}
      </div>

      {po.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {po.attachments.map((a) =>
            a.mime.startsWith('image/') ? (
              <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                <img
                  src={`/api/attachments/${a.id}`}
                  alt="Hoá đơn"
                  className="size-24 rounded-xl border border-line object-cover"
                />
              </a>
            ) : (
              <a
                key={a.id}
                href={`/api/attachments/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-line px-3 py-2 text-sm underline"
              >
                📄 Hoá đơn (PDF)
              </a>
            ),
          )}
        </div>
      )}

      <div className="mt-4 grid gap-2">
        <ErrorText error={action.error} />
        {can('approve') && (
          <Button onClick={approve} disabled={action.isPending} className="py-3 text-lg">
            Duyệt đơn
          </Button>
        )}
        {can('reject') &&
          (rejecting ? (
            <div className="grid gap-2 rounded-2xl border border-chili/40 p-3">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Lý do từ chối (bắt buộc)"
                className="!mt-0"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setRejecting(false)}>
                  Thôi
                </Button>
                <Button
                  variant="danger"
                  disabled={!reason.trim() || action.isPending}
                  onClick={() => action.mutate({ action: 'reject', body: { reason } })}
                >
                  Từ chối
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setRejecting(true)}>
              Từ chối…
            </Button>
          ))}
        {['approved', 'ordered'].includes(po.status) && po.supplier && (
          <Button variant="secondary" onClick={copyMessage}>
            📋 Copy tin đặt hàng
          </Button>
        )}
        {copy === 'copied' && (
          <p className="text-center text-sm font-semibold text-bamboo-dark">
            Đã copy, dán vào Zalo của NCC.
          </p>
        )}
        {typeof copy === 'object' && (
          <div className="rounded-2xl border border-line p-3">
            <p className="mb-2 text-sm text-ink-muted">Bấm giữ để chọn và copy:</p>
            <textarea
              readOnly
              value={copy.manual}
              rows={copy.manual.split('\n').length}
              className="w-full rounded-lg bg-cream p-2 text-sm"
              onFocus={(e) => e.target.select()}
            />
          </div>
        )}
        {can('mark_ordered') && (
          <Button
            variant="secondary"
            disabled={action.isPending}
            onClick={() => action.mutate({ action: 'mark-ordered' })}
          >
            ✔ Đã gửi đơn cho NCC
          </Button>
        )}
        {can('receive') && (
          <Button onClick={() => navigate(`/po/${po.id}/receive`)} className="py-3 text-lg">
            Nhận hàng
          </Button>
        )}
        {can('cancel') && (
          <button
            className="py-2 text-sm text-chili-strong underline"
            disabled={action.isPending}
            onClick={cancel}
          >
            Huỷ đơn
          </button>
        )}
        <Link to="/po" className="py-2 text-center text-sm text-ink-muted underline">
          Về danh sách đơn
        </Link>
      </div>
    </div>
  );
}
