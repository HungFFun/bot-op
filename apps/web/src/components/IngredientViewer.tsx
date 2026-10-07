import { useEffect } from 'react';

/** Full-screen photo + full note; tap anywhere or press Esc to close. */
export function IngredientViewer({
  item,
  onClose,
}: {
  item: {
    name: string;
    imageUrl: string | null;
    note: string | null;
    unit: string;
    minOrderQty: string | null;
  };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
      onClick={onClose}
      className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-ink/85 p-4"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="aspect-square w-full object-cover" />
        ) : (
          <div className="flex aspect-[2/1] items-center justify-center bg-cream text-ink-muted">
            Chưa có ảnh
          </div>
        )}
        <div className="p-4">
          <div className="text-lg font-bold">{item.name}</div>
          <div className="text-sm text-ink-muted">
            Đơn vị: {item.unit}
            {item.minOrderQty && ` · Tối thiểu ${item.minOrderQty.replace('.', ',')} ${item.unit}`}
          </div>
          {item.note && <p className="mt-2 rounded-lg bg-cream px-3 py-2">📝 {item.note}</p>}
          <p className="mt-3 text-center text-sm text-ink-muted">Chạm để đóng</p>
        </div>
      </div>
    </div>
  );
}
