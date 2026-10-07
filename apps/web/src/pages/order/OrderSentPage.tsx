import { formatVnd, type OrderCreateResult } from '@bot-op/shared';
import { Link, Navigate, useLocation } from 'react-router';
import { PageHeader } from '../../components/ui';
import { PoStatusBadge } from '../../features/orders/PoStatusBadge';

export function OrderSentPage() {
  const result = useLocation().state as OrderCreateResult | null;
  if (!result) return <Navigate to="/po" replace />;
  return (
    <div>
      <PageHeader title="Đã gửi order" />
      <p className="rounded-xl bg-bamboo-soft px-4 py-2.5 text-bamboo-dark">
        ✅ Đã tạo <b>{result.purchaseOrders.length} đơn</b>, đang chờ quản lý duyệt.
      </p>
      <ul className="mt-3 grid gap-2">
        {result.purchaseOrders.map((po) => (
          <li key={po.id}>
            <Link
              to={`/po/${po.id}`}
              className="block rounded-2xl border border-line p-3 active:bg-cream"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">{po.code}</span>
                <PoStatusBadge status={po.status} />
              </div>
              <div className="mt-1 text-sm text-ink-muted">
                {po.supplier?.name ?? 'Chưa có NCC'} · {po.itemCount} món
                {po.estTotal > 0 && ` · ~${formatVnd(po.estTotal)}`}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        to="/order"
        className="mt-4 block text-center font-semibold underline decoration-elephant decoration-2 underline-offset-4"
      >
        Order tiếp
      </Link>
    </div>
  );
}
