import { formatDayMonth, formatVnd } from '@bot-op/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Empty, ErrorText, Input, PageHeader, Chip, ChipRow } from '../../components/ui';
import { IngredientThumb } from '../../components/IngredientThumb';
import { PriceBadge } from '../../features/catalog/PriceBadge';
import { useCategories, useIngredients } from '../../features/catalog/queries';
import { useDebounced } from '../../lib/useDebounced';

export function IngredientsPage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const debouncedQ = useDebounced(q);
  const categories = useCategories();
  const list = useIngredients({ q: debouncedQ, category, includeInactive });

  return (
    <div>
      <PageHeader
        title="Nguyên liệu"
        back="/admin"
        action={
          <Link
            to="/admin/ingredients/new"
            className="rounded-xl bg-elephant px-4 py-2 font-semibold text-ink active:bg-elephant-press"
          >
            + Thêm
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
      <label className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
        />
        Hiện cả nguyên liệu ngừng dùng
      </label>

      <div className="mt-3">
        <ErrorText error={list.error} />
        {list.data?.length === 0 && <Empty>Không có nguyên liệu nào.</Empty>}
        <ul className={`divide-y divide-line ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
          {list.data?.map((i) => (
            <li key={i.id}>
              <Link
                to={`/admin/ingredients/${i.id}`}
                className="flex items-center gap-3 py-2.5 active:bg-cream"
              >
                <IngredientThumb name={i.name} imageUrl={i.imageUrl} size="size-12" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm text-ink-muted">{i.code}</span>
                    <span
                      className={`font-semibold ${i.active ? '' : 'text-ink-muted line-through'}`}
                    >
                      {i.name}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-ink-muted">
                    {i.latestPrice ? (
                      <>
                        <span className="font-semibold text-ink">
                          {formatVnd(i.latestPrice.unitPrice)}/{i.unit}
                        </span>{' '}
                        · {i.latestPrice.supplierName} · nhập{' '}
                        {formatDayMonth(i.latestPrice.recordedAt)}{' '}
                        <PriceBadge
                          current={i.latestPrice.unitPrice}
                          prev={i.latestPrice.prevUnitPrice}
                        />
                      </>
                    ) : (
                      <span className="text-ink-muted">
                        Chưa có giá · {i.unit}
                        {i.defaultSupplier ? ` · ${i.defaultSupplier.name}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
