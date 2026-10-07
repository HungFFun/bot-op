import { formatVnd, lineTotal, type IngredientListItem } from '@bot-op/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IngredientViewer } from '../../components/IngredientViewer';
import { Empty, ErrorText, Input, PageHeader, Chip, ChipRow } from '../../components/ui';
import { useCategories, useIngredients } from '../../features/catalog/queries';
import { normalizeQty, useCart } from '../../features/orders/cart';
import { OrderItemRow } from '../../features/orders/OrderItemRow';
import { useDebounced } from '../../lib/useDebounced';

export function OrderPage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const debouncedQ = useDebounced(q);
  const categories = useCategories();
  const list = useIngredients({ q: debouncedQ, category, includeInactive: false });
  const { cart, lines, setQty } = useCart();
  const listRef = useRef<HTMLDivElement>(null);
  const [viewing, setViewing] = useState<IngredientListItem | null>(null);
  // A new search or category starts at the top of the list.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [debouncedQ, category]);

  const total = lines.reduce((sum, l) => {
    const qty = normalizeQty(l.qty);
    return qty && l.unitPrice ? sum + lineTotal(qty, l.unitPrice) : sum;
  }, 0);

  return (
    // Top part (title, search, filters) stays put; only the list below scrolls.
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Order nguyên liệu"
        action={
          <Link
            to="/po"
            className="text-sm text-ink-muted underline decoration-line-strong underline-offset-2"
          >
            Đơn đã gửi
          </Link>
        }
      />
      <Input
        type="search"
        placeholder="🔍 Tìm tên / mã nguyên liệu…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="!mt-0"
      />
      <ChipRow className="mt-1">
        <Chip active={category === null} onClick={() => setCategory(null)}>
          Tất cả
        </Chip>
        {categories.data?.map((c) => (
          <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
            {c.name}
          </Chip>
        ))}
      </ChipRow>

      <div
        ref={listRef}
        className={`-mx-3 mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line px-3 ${
          lines.length ? 'pb-16' : 'pb-3'
        }`}
      >
        <ErrorText error={list.error} />
        {list.data?.length === 0 && <Empty>Không tìm thấy nguyên liệu.</Empty>}
        <ul className={`divide-y divide-line ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
          {list.data?.map((i) => (
            <OrderItemRow
              key={i.id}
              item={i}
              qty={cart.lines[i.id]?.qty ?? ''}
              onQty={(v) => setQty(i, v)}
              onOpen={() => setViewing(i)}
            />
          ))}
        </ul>
      </div>

      {viewing && <IngredientViewer item={viewing} onClose={() => setViewing(null)} />}

      {lines.length > 0 && (
        <Link
          to="/cart"
          className="fixed inset-x-0 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom))] z-10 mx-auto flex max-w-xl items-center justify-between bg-ink px-3 py-2 text-cream"
        >
          <span>
            🛒 <b>{lines.length} món</b>
            {total > 0 && <> · ~{formatVnd(total)}</>}
          </span>
          <span className="rounded-lg bg-elephant px-3 py-1.5 font-semibold text-ink">
            Xem giỏ ▸
          </span>
        </Link>
      )}
    </div>
  );
}
