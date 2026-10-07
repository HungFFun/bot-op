/**
 * Lowercase, strip Vietnamese diacritics (đ → d) and collapse whitespace.
 * Used for accent-insensitive search: "xa lach" matches "Xà lách".
 */
export function normalizeVi(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Value stored in ingredients.search_text. */
export const ingredientSearchText = (code: string, name: string) => normalizeVi(`${code} ${name}`);
