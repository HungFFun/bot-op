import { formatDayMonth, formatQty, formatVnd, type IngredientListItem } from '@bot-op/shared';
import { IngredientThumb } from '../../components/IngredientThumb';
import { QtyStepper } from '../../components/QtyStepper';
import { PriceBadge } from '../catalog/PriceBadge';

/**
 * One ingredient in the order list. Left: name · supplier, price. Right: photo with the quantity stepper
 * directly under it. The note comes last, across the full width.
 */
export function OrderItemRow({
  item: i,
  qty,
  onQty,
  onOpen,
}: {
  item: IngredientListItem;
  qty: string;
  onQty: (v: string) => void;
  onOpen: () => void;
}) {
  const selected = qty !== '' && qty !== '0';
  const others = i.alternateSuppliers.length;
  return (
    <li className={`-mx-3 px-3 py-3 ${selected ? 'bg-elephant-soft/50' : ''}`}>
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <button type="button" onClick={onOpen} className="block w-full text-left leading-snug">
            {/* Supplier right after the name; the "· NCC +N" chunk wraps as one piece, never mid-name. */}
            <span className="font-semibold">{i.name}</span>{' '}
            <span className="inline-block max-w-full truncate align-bottom text-sm text-ink-muted">
              · {i.defaultSupplier?.name ?? 'Chưa có NCC'}
              {others > 0 && ` +${others}`}
            </span>
            {i.minOrderQty && (
              <span className="block text-sm text-ink-muted">
                Tối thiểu {formatQty(i.minOrderQty)} {i.unit}
              </span>
            )}
          </button>
          {/* Price pinned to the bottom of the text column, level with the stepper. */}
          <div className="mt-auto min-w-0 pt-2 leading-tight">
            {i.latestPrice ? (
              <>
                <div className="truncate font-semibold">
                  {formatVnd(i.latestPrice.unitPrice)}
                  <span className="text-sm font-normal text-ink-muted">/{i.unit}</span>
                </div>
                <div className="truncate text-xs text-ink-muted">
                  <PriceBadge
                    current={i.latestPrice.unitPrice}
                    prev={i.latestPrice.prevUnitPrice}
                  />{' '}
                  nhập {formatDayMonth(i.latestPrice.recordedAt)}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-ink-muted">Chưa có giá</div>
                <div className="text-xs text-ink-muted">Đơn vị: {i.unit}</div>
              </>
            )}
          </div>
        </div>
        {/* w-min: the column is as wide as the stepper; the photo fills that width. No photo → no
            placeholder, so the stepper drops to the bottom next to the price and the row stays short. */}
        <div className="flex w-min shrink-0 flex-col justify-end gap-2">
          {i.imageUrl && (
            <IngredientThumb
              name={i.name}
              imageUrl={i.imageUrl}
              size="aspect-[4/3] w-full"
              onClick={onOpen}
            />
          )}
          <QtyStepper label={i.name} value={qty} onChange={onQty} />
        </div>
      </div>
      {i.note && (
        // Last, across the full row width. Clamp the inner text, not the padded box, or a third line
        // peeks out under the padding.
        <button
          type="button"
          onClick={onOpen}
          className="mt-2 block w-full rounded-lg bg-cream px-2 py-1 text-left text-sm leading-snug"
        >
          <span className="line-clamp-2">📝 {i.note}</span>
        </button>
      )}
    </li>
  );
}
