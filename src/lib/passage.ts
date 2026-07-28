import {
  AyahRow,
  TOTAL_AYAHS,
  TOTAL_PAGES,
  getAyahsByIdRange,
  getAyahsByPageRange,
  getSurahs,
} from './db';
import { t } from './i18n';

export type Unit = 'ayah' | 'page';

/**
 * A small serialisable reference to a passage. This is what gets stored in
 * the notification payload and the AsyncStorage ledger — never the full text.
 * The Reader re-queries the database from this key.
 */
export type PassageKey =
  | { unit: 'ayah'; startId: number; count: number }
  | { unit: 'page'; startPage: number; count: number };

export type Passage = { rows: AyahRow[]; passageKey: PassageKey };

/** Random integer in [min, max], inclusive both ends. */
function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Pick a random starting point and take `count` consecutive units from it.
 * Randomness chooses only the start; everything after is sequential by
 * global ayah id, so passages freely cross surah boundaries. The clamp on
 * maxStart guarantees a full-length passage — we never wrap around the end.
 */
export async function buildPassage(unit: Unit, count: number): Promise<Passage> {
  if (unit === 'ayah') {
    if (count < 1 || count > TOTAL_AYAHS) throw new Error(`Invalid ayah count: ${count}`);
    const maxStart = TOTAL_AYAHS - count + 1;
    const start = randomInt(1, maxStart);
    const rows = await getAyahsByIdRange(start, start + count - 1);
    return { rows, passageKey: { unit: 'ayah', startId: start, count } };
  }
  if (count < 1 || count > TOTAL_PAGES) throw new Error(`Invalid page count: ${count}`);
  const maxStart = TOTAL_PAGES - count + 1;
  const start = randomInt(1, maxStart);
  const rows = await getAyahsByPageRange(start, start + count - 1);
  return { rows, passageKey: { unit: 'page', startPage: start, count } };
}

/** Re-query the exact passage a PassageKey refers to. Shared by Reader + scheduler. */
export async function resolvePassage(key: PassageKey): Promise<AyahRow[]> {
  if (key.unit === 'ayah') {
    return getAyahsByIdRange(key.startId, key.startId + key.count - 1);
  }
  return getAyahsByPageRange(key.startPage, key.startPage + key.count - 1);
}

export function parsePassageKey(raw: string): PassageKey | null {
  try {
    const key = JSON.parse(raw) as PassageKey;
    if (key.unit === 'ayah' && typeof key.startId === 'number' && typeof key.count === 'number') {
      return key;
    }
    if (key.unit === 'page' && typeof key.startPage === 'number' && typeof key.count === 'number') {
      return key;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Human reference for a passage, e.g.:
 *   "Al-Baqara 2:255 · Juz 3"           (single ayah)
 *   "An-Nisa 4:1–4:3 · Juz 4"           (range within one surah)
 *   "Al-Baqara 2:285 – Aal Imran 3:2"   (cross-surah range)
 *   "Page 244 · Juz 13" / "Pages 244–245"
 */
export async function formatReference(rows: AyahRow[], key: PassageKey): Promise<string> {
  const surahs = await getSurahs();
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return '';

  const juzPart =
    first.juz === last.juz
      ? ` · ${t('juz')} ${first.juz}`
      : ` · ${t('juz')} ${first.juz}–${last.juz}`;

  if (key.unit === 'page') {
    const pagePart =
      key.count === 1
        ? t('pageN', { n: key.startPage })
        : t('pagesRange', { a: key.startPage, b: key.startPage + key.count - 1 });
    return `${pagePart}${juzPart}`;
  }

  const firstName = surahs.get(first.surah)?.name_en ?? t('surahN', { n: first.surah });
  if (first.id === last.id) {
    return `${firstName} ${first.surah}:${first.ayah}${juzPart}`;
  }
  if (first.surah === last.surah) {
    return `${firstName} ${first.surah}:${first.ayah}–${last.surah}:${last.ayah}${juzPart}`;
  }
  const lastName = surahs.get(last.surah)?.name_en ?? t('surahN', { n: last.surah });
  return `${firstName} ${first.surah}:${first.ayah} – ${lastName} ${last.surah}:${last.ayah}${juzPart}`;
}
