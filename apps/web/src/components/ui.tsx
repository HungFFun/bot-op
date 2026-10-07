import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { Link } from 'react-router';

const inputClass =
  'mt-1 w-full rounded-xl border border-line-strong bg-white px-3 py-2.5 outline-none focus:border-ink focus:ring-2 focus:ring-elephant/40 disabled:bg-cream';

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const styles = {
    primary: 'bg-elephant text-ink active:bg-elephant-press',
    secondary: 'border border-line-strong bg-white text-ink active:bg-cream',
    danger: 'border border-chili-strong bg-white text-chili-strong active:bg-chili-soft',
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`rounded-xl px-4 py-2.5 font-semibold disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function PageHeader({
  title,
  back,
  action,
}: {
  title: string;
  back?: string;
  action?: ReactNode;
}) {
  // Only reserve 40px of height when there is a back button to tap.
  return (
    <div className={`mb-2 flex items-center gap-1 ${back ? 'min-h-10' : ''}`}>
      {back && (
        <Link
          to={back}
          className="-ml-2 flex size-10 items-center justify-center rounded-lg text-2xl text-ink-muted active:bg-cream"
          aria-label="Quay lại"
        >
          ‹
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg leading-tight font-bold">{title}</h1>
      {action}
    </div>
  );
}

export function ErrorText({ error }: { error: { message: string } | null | undefined }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border-l-4 border-chili bg-chili-soft px-3 py-2 text-sm text-ink"
    >
      {error.message}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-ink-muted">{children}</p>;
}

/** Integer đồng with thousands separators while typing; value is a number or null. */
export function MoneyInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <Input
      inputMode="numeric"
      {...props}
      value={value === null ? '' : value.toLocaleString('vi-VN')}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
        onChange(digits ? Number(digits) : null);
      }}
    />
  );
}

/** Primary action pinned above the tab bar, so it is reachable without scrolling on a phone. */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-16" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom))] z-10 mx-auto max-w-xl border-t border-line bg-white px-3 py-2">
        {children}
      </div>
    </>
  );
}

/** Horizontally swipeable filter row; full-bleed to the screen edge, no visible scrollbar. */
export function ChipRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 py-1 ${className}`}>
      {children}
    </div>
  );
}

/** 40px tall so it is easy to hit with a thumb. */
export function Chip({
  active,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm ${
        active ? 'bg-elephant font-semibold text-ink' : 'bg-cream text-ink active:bg-elephant-soft'
      } ${className}`}
    />
  );
}
