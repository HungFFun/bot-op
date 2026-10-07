/**
 * Shrinks a camera photo before upload (phones produce 3–5 MB files; a list of 160 of those is unusable
 * on 4G). Falls back to the original file when the browser cannot decode it.
 */
export async function resizeImage(file: File, maxSize = 800, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
