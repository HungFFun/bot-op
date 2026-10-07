import { useRef, useState } from 'react';
import { IngredientThumb } from '../../components/IngredientThumb';
import { ErrorText } from '../../components/ui';
import { resizeImage } from '../../lib/image';
import { uploadAttachment } from '../orders/queries';

/**
 * Pick/take a photo, shrink it on the phone, upload, and hand the attachment id to the caller.
 * `onChange(null)` removes the photo.
 */
export function IngredientPhotoField({
  name,
  imageUrl,
  busy,
  onChange,
}: {
  name: string;
  imageUrl: string | null;
  busy?: boolean;
  onChange: (imageId: string | null, previewUrl: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await resizeImage(file);
      const att = await uploadAttachment(blob, 'anh-mon.jpg');
      onChange(att.id, URL.createObjectURL(blob));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const working = uploading || busy;
  return (
    <div>
      <span className="text-sm font-medium text-ink">Ảnh món</span>
      <div className="mt-1 flex items-center gap-3">
        <IngredientThumb name={name || '?'} imageUrl={imageUrl} size="size-24" />
        <div className="grid gap-2">
          <button
            type="button"
            disabled={working}
            onClick={() => fileRef.current?.click()}
            className="min-h-10 rounded-xl border border-line-strong px-3 text-sm font-semibold active:bg-cream disabled:opacity-50"
          >
            {working ? 'Đang tải ảnh…' : imageUrl ? '📷 Đổi ảnh' : '📷 Chụp / chọn ảnh'}
          </button>
          {imageUrl && !working && (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="min-h-10 rounded-xl px-3 text-sm text-chili-strong underline"
            >
              Xoá ảnh
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div className="mt-1">
        <ErrorText error={error ? { message: error } : null} />
      </div>
    </div>
  );
}
