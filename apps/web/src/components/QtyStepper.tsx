import { useLayoutEffect, useRef } from 'react';

const toNumber = (v: string) => Number(v.replace(',', '.')) || 0;

/** Big −/+ buttons for wet kitchen hands; the number in the middle can also be typed (decimals with , or .). */
export function QtyStepper({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const n = toNumber(value);
  // Fast repeated taps can arrive before the parent re-renders; step from the last value we emitted.
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  const emit = (v: string) => {
    latest.current = v;
    onChange(v);
  };
  const step = (d: number) => {
    const next = Math.max(0, Number((toNumber(latest.current) + d).toFixed(3)));
    emit(next === 0 ? '' : String(next).replace('.', ','));
  };
  const btn =
    'flex size-10 shrink-0 items-center justify-center rounded-xl border border-line-strong text-2xl leading-none active:bg-elephant-soft disabled:opacity-30';
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        className={btn}
        onClick={() => step(-1)}
        disabled={n <= 0}
        aria-label={`Giảm ${label}`}
      >
        −
      </button>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => emit(e.target.value.replace(/[^\d.,]/g, '').slice(0, 10))}
        placeholder="0"
        aria-label={`Số lượng ${label}`}
        // Grows with the number ("1250,5") instead of cutting it off; 3–6 characters wide.
        style={{ width: `clamp(3rem, ${value.length + 1.5}ch, 5.5rem)` }}
        className={`h-10 rounded-xl border text-center text-lg font-semibold outline-none focus:border-ink focus:ring-2 focus:ring-elephant/40 ${
          n > 0 ? 'border-elephant bg-elephant-soft' : 'border-line-strong'
        }`}
      />
      <button type="button" className={btn} onClick={() => step(1)} aria-label={`Tăng ${label}`}>
        +
      </button>
    </div>
  );
}
