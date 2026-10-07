/** Square ingredient photo; a lettered tile when there is none. Lazy-loaded so long lists stay light. */
export function IngredientThumb({
  name,
  imageUrl,
  size = 'size-16',
  onClick,
}: {
  name: string;
  imageUrl: string | null;
  size?: string;
  onClick?: () => void;
}) {
  const content = imageUrl ? (
    <img
      src={imageUrl}
      alt={name}
      loading="lazy"
      decoding="async"
      className="size-full object-cover"
    />
  ) : (
    <span className="text-xl font-bold text-ink-muted">{name.trim().charAt(0).toUpperCase()}</span>
  );
  const className = `${size} flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-cream`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${className} active:opacity-80`}
      aria-label={`Xem ảnh ${name}`}
    >
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
