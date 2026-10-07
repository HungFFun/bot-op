import {
  formatDateOnly,
  formatDateTime,
  formatVnd,
  PO_STATUS_LABELS,
  type PoStatus,
  PO_STATUSES,
} from '@bot-op/shared';
import { Link, useSearchParams } from 'react-router';
import { Empty, ErrorText, PageHeader, Chip, ChipRow } from '../../components/ui';
import { PoStatusBadge } from '../../features/orders/PoStatusBadge';
import { usePurchaseOrders } from '../../features/orders/queries';

const FILTERS: (PoStatus | null)[] = [
  null,
  'submitted',
  'approved',
  'ordered',
  'received',
  'rejected',
  'cancelled',
];

export function PoListPage() {
  // ?status=submitted comes from the "new order" notification.
  const [params, setParams] = useSearchParams();
  const status = (PO_STATUSES as readonly string[]).includes(params.get('status') ?? '')
    ? (params.get('status') as PoStatus)
    : null;
  const setStatus = (s: PoStatus | null) => setParams(s ? { status: s } : {}, { replace: true });
  const list = usePurchaseOrders(status);

  return (
    <div>
      <PageHeader
        title="Đơn hàng"
        action={
          <Link
            to="/order"
            className="rounded-xl bg-elephant px-4 py-2 font-semibold text-ink active:bg-elephant-press"
          >
            + Order
          </Link>
        }
      />
      <ChipRow>
        {FILTERS.map((s) => (
          <Chip key={s ?? 'all'} active={status === s} onClick={() => setStatus(s)}>
            {s ? PO_STATUS_LABELS[s] : 'Tất cả'}
          </Chip>
        ))}
      </ChipRow>
      <div className="mt-3">
        <ErrorText error={list.error} />
        {list.data?.length === 0 && <Empty>Không có đơn nào.</Empty>}
        <ul className="grid gap-2">
          {list.data?.map((po) => (
            <li key={po.id}>
              <Link
                to={`/po/${po.id}`}
                className="block rounded-2xl border border-line p-3 active:bg-cream"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">
                    {po.supplier?.name ?? 'Chưa có NCC'}
                  </span>
                  <PoStatusBadge status={po.status} />
                </div>
                <div className="mt-1 text-sm text-ink-muted">
                  <span className="font-mono">{po.code}</span> · {po.branch.code} · cần{' '}
                  {formatDateOnly(po.neededDate)}
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span>
                    {po.itemCount} món{po.estTotal > 0 && <> · ~{formatVnd(po.estTotal)}</>}
                  </span>
                  <span className="text-ink-muted">
                    {po.createdBy.name} · {formatDateTime(po.createdAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
