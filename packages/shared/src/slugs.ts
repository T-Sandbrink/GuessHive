/** Latin letters without a Unicode decomposition to ASCII. */
const ASCII_LETTERS: Record<string, string> = {
  ø: 'o',
  Ø: 'O',
  æ: 'ae',
  Æ: 'AE',
  ß: 'ss',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
};

/** Longest slug we generate; `Question.slug` allows 120, the rest is headroom. */
export const SLUG_MAX_LENGTH = 80;

/**
 * Readable URL slug from a title: lowercase ASCII letters and digits joined by single dashes.
 * Accents are dropped ("Café" → "cafe"); other characters become separators. The slug is only
 * decoration, since URLs resolve by short id (ADR 0004). Returns an empty string when nothing
 * usable is left (e.g. a title of only emoji); callers decide on a fallback.
 */
export function slugify(title: string): string {
  const slug = title
    .replace(/[øØæÆßłŁđĐ]/g, (letter) => ASCII_LETTERS[letter] ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= SLUG_MAX_LENGTH) {
    return slug;
  }
  const cut = slug.slice(0, SLUG_MAX_LENGTH + 1);
  const lastDash = cut.lastIndexOf('-');
  // Cut at a word boundary when one exists; otherwise hard-cut the single long word.
  return (lastDash > 0 ? cut.slice(0, lastDash) : slug.slice(0, SLUG_MAX_LENGTH)).replace(
    /-+$/,
    '',
  );
}
