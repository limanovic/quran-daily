import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Bookmarks and the automatic last-read position. Both are plain AsyncStorage
 * values — the SQLite database stays read-only.
 */

export type Bookmark = {
  ayahId: number; // global 1..6236
  createdAt: number; // epoch ms
};

const BOOKMARKS_KEY = 'bookmarks.v1';
const LAST_POSITION_KEY = 'lastPosition.v1';

/** All bookmarks, newest first. */
export async function loadBookmarks(): Promise<Bookmark[]> {
  const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Bookmark[];
    return list
      .filter((b) => typeof b.ayahId === 'number' && typeof b.createdAt === 'number')
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
  await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

/** Add the ayah if absent, remove it if present. Returns the new list. */
export async function toggleBookmark(ayahId: number): Promise<Bookmark[]> {
  const bookmarks = await loadBookmarks();
  const without = bookmarks.filter((b) => b.ayahId !== ayahId);
  const next =
    without.length === bookmarks.length
      ? [{ ayahId, createdAt: Date.now() }, ...bookmarks]
      : without;
  await saveBookmarks(next);
  return next;
}

export async function removeBookmark(ayahId: number): Promise<Bookmark[]> {
  const next = (await loadBookmarks()).filter((b) => b.ayahId !== ayahId);
  await saveBookmarks(next);
  return next;
}

/** Where the user last was in the continuous reader (global ayah id). */
export async function loadLastPosition(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(LAST_POSITION_KEY);
  const id = raw ? Number(raw) : NaN;
  return Number.isInteger(id) && id >= 1 ? id : null;
}

export async function saveLastPosition(ayahId: number): Promise<void> {
  await AsyncStorage.setItem(LAST_POSITION_KEY, String(ayahId));
}
