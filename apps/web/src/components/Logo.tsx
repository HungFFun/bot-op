/**
 * Bam Thái logo (brand book): minimum 140px wide on screen, clear space X = ½ height of "B"
 * on every side, never recoloured, rotated or stretched. Full-colour only on cream/white/ink
 * backgrounds; on orange/red/green use the cream variant.
 */
const VARIANTS = {
  horizontal: { src: '/brand/logo-horizontal.svg', ratio: 1486 / 330, clearSpace: 0.5 },
  stacked: { src: '/brand/logo-stacked.svg', ratio: 772 / 680, clearSpace: 0.25 },
} as const;

export function Logo({
  variant = 'horizontal',
  width,
}: {
  variant?: keyof typeof VARIANTS;
  width: number;
}) {
  const v = VARIANTS[variant];
  const w = Math.max(140, width);
  const h = Math.round(w / v.ratio);
  // "B" is the full wordmark height (horizontal) or half of it (stacked).
  const x = Math.round(h * v.clearSpace);
  return (
    <span className="block" style={{ padding: x }}>
      <img src={v.src} alt="Bam Thái" width={w} height={h} className="block" draggable={false} />
    </span>
  );
}
