import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOTAL_AYAHS } from './db';

/*
 * How far the sequential wird has got: the ayah its *next* in-order delivery
 * starts from.
 *
 * There is one position, not one per delivery time. Every time set to "in
 * order" draws from it, in clock order — 09:00 takes 1:1, 10:00 takes 1:2,
 * 14:00 takes 1:3 — so several readings a day are one continuous passage
 * through the mus'haf rather than several parallel ones all starting at
 * Al-Fatiha. A time set to "random" never touches it, which is how a delivery
 * opts out of the progression.
 *
 * The position is always an ayah id, even for deliveries measured in pages: a
 * page delivery starts at the page containing this ayah and leaves the cursor
 * just past that page's last ayah. One number keeps mixed-unit setups on a
 * single progression.
 *
 * Kept out of Settings on purpose. The scheduler advances it as occurrences
 * elapse, while Settings is held in React state on two screens — a screen that
 * loaded before an advance would write the stale position back on the next
 * unrelated edit and re-deliver passages the user already had.
 *
 * It moves only when an occurrence has actually passed. Pending notifications
 * bake their passage in at scheduling time, but the positions they consume are
 * walked over in memory (see notifications.ts) and never stored, so cancelling
 * and rebuilding the window always lands on the same passages.
 */

const WIRD_KEY = 'wird.v2';
/** Pre-shared-cursor shape: { [deliveryTime]: { ayah, page } }. */
const LEGACY_KEY = 'wird.v1';

/** Al-Fatiha 1:1 — where a wird that has never run begins. */
export const CURSOR_START = 1;

/** Repair a stored position into a usable ayah id. */
export function normalizeCursor(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= TOTAL_AYAHS ? n : CURSOR_START;
}

/** Next start after taking `count` units from `start`, wrapping past the end. */
export function advance(start: number, count: number, total: number): number {
  return ((start - 1 + count) % total) + 1;
}

export async function loadCursor(): Promise<number> {
  const raw = await AsyncStorage.getItem(WIRD_KEY);
  if (raw !== null) return normalizeCursor(JSON.parse(raw));
  return migrateLegacyCursor();
}

/**
 * Per-delivery cursors predate the shared progression. Collapse them by taking
 * the furthest one — resuming slightly ahead re-reads nothing, where resuming
 * behind would repeat passages the user has already been sent.
 */
async function migrateLegacyCursor(): Promise<number> {
  const raw = await AsyncStorage.getItem(LEGACY_KEY);
  if (!raw) return CURSOR_START;
  try {
    const parsed = JSON.parse(raw) as Record<string, { ayah?: number }>;
    const positions = Object.values(parsed ?? {}).map((c) => normalizeCursor(c?.ayah));
    const furthest = positions.length > 0 ? Math.max(...positions) : CURSOR_START;
    await saveCursor(furthest);
    await AsyncStorage.removeItem(LEGACY_KEY);
    return furthest;
  } catch {
    return CURSOR_START;
  }
}

export async function saveCursor(position: number): Promise<void> {
  await AsyncStorage.setItem(WIRD_KEY, JSON.stringify(normalizeCursor(position)));
}

/** Start the khatma over from Al-Fatiha. */
export async function resetCursor(): Promise<void> {
  await saveCursor(CURSOR_START);
}
