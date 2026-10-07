import { priceChangePct } from '@bot-op/shared';

/** ▲/▼ vs the previous recorded price. Changes over 10% are highlighted. */
export function PriceBadge({ current, prev }: { current: number; prev: number | null }) {
  const pct = priceChangePct(current, prev);
  if (pct === null || pct === 0) return null;
  const up = pct > 0;
  const strong = Math.abs(pct) > 10;
  const color = up ? 'text-chili-strong' : 'text-bamboo-dark';
  const bg = strong ? (up ? 'bg-chili-soft' : 'bg-bamboo-soft') : '';
  return (
    <span className={`rounded px-1 text-xs font-semibold ${color} ${bg}`}>
      {up ? '▲+' : '▼'}
      {pct}%
    </span>
  );
}
