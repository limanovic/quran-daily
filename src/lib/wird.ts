import AsyncStorage from '@react-native-async-storage/async-storage';
import { TOTAL_AYAHS, TOTAL_PAGES } from './db';
import { Unit } from './passage';

/*
 * How far each sequential wird has got: the position its *next* delivery
 * starts from.
 *
 * Kept out of Settings on purpose. The scheduler advances a cursor as
 * occurrences elapse, while Settings is held in React state on two screens —
 * a screen that loaded before an advance would write the stale position back
 * on the next unrelated edit and re-deliver passages the user already had.
 *
 * A cursor moves only when an occurrence has actually passed. Pending
 * notifications bake their passage in at scheduling time, but the positions
 * they consume are walked over in memory (see notifications.ts) and never
 * stored, so cancelling and rebuilding the window is always a no-op here.
 *
 * Keyed by delivery time — the same identity the rest of the app uses for a
 * delivery. Both units are tracked so switching Ayahs ↔ Pages and back
 * resumes each where it left off.
 */

export type WirdCursor = { ayah: number; page: number };
export type WirdCursors = Record<string, WirdCursor>;

const WIRD_KEY = 'wird.v1';

/** Al-Fatiha 1:1, page 1 — where a wird that has never run begins. */
export const CURSOR_START: WirdCursor = { ayah: 1, page: 1 };

export function unitTotal(unit: Unit): number {
  return unit === 'ayah' ? TOTAL_AYAHS : TOTAL_PAGES;
}

/** The stored position for a delivery/unit, repaired to a usable one. */
export function positionOf(cursors: WirdCursors, time: string, unit: Unit): number {
  const raw = (cursors[time] ?? CURSOR_START)[unit === 'ayah' ? 'ayah' : 'page'];
  const pos = Math.floor(raw);
  return Number.isFinite(pos) && pos >= 1 && pos <= unitTotal(unit) ? pos : 1;
}

export function withPosition(
  cursors: WirdCursors,
  time: string,
  unit: Unit,
  position: number,
): WirdCursors {
  const current = cursors[time] ?? CURSOR_START;
  const next: WirdCursor =
    unit === 'ayah' ? { ...current, ayah: position } : { ...current, page: position };
  return { ...cursors, [time]: next };
}

/** Next start after taking `count` units from `start`, wrapping past the end. */
export function advance(start: number, count: number, total: number): number {
  return ((start - 1 + count) % total) + 1;
}

export async function loadCursors(): Promise<WirdCursors> {
  const raw = await AsyncStorage.getItem(WIRD_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as WirdCursors) : {};
  } catch {
    return {};
  }
}

export async function saveCursors(cursors: WirdCursors): Promise<void> {
  await AsyncStorage.setItem(WIRD_KEY, JSON.stringify(cursors));
}

/** Drop cursors for times that are no longer delivery times. */
export function pruneCursors(cursors: WirdCursors, times: string[]): WirdCursors {
  const keep = new Set(times);
  return Object.fromEntries(Object.entries(cursors).filter(([time]) => keep.has(time)));
}

/**
 * Retiming a delivery keeps its progress: the time is only an identifier, and
 * moving a wird from 09:00 to 10:00 shouldn't restart the khatma. Must land
 * before the settings change that renames the delivery is scheduled.
 */
export async function renameCursor(from: string, to: string): Promise<void> {
  if (from === to) return;
  const cursors = await loadCursors();
  const moved = cursors[from];
  if (!moved) return;
  const next = { ...cursors, [to]: moved };
  delete next[from];
  await saveCursors(next);
}

/** Start this wird's khatma over from Al-Fatiha. */
export async function resetCursor(time: string): Promise<void> {
  const cursors = await loadCursors();
  await saveCursors({ ...cursors, [time]: { ...CURSOR_START } });
}
