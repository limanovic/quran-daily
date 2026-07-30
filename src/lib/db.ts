import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

/** One row of the `ayah` table. Global `id` runs 1..6236 across the whole Qur'an. */
export type AyahRow = {
  id: number;
  surah: number;
  ayah: number;
  page: number;
  juz: number;
  sajda: number;
  arabic: string;
};

/** One row of the `language` table. `ar` is Arabic itself (lives in ayah.arabic). */
export type LanguageRow = {
  code: string;
  native_name: string;
  name_en: string;
  translator: string;
  rtl: number;
  sort: number;
};

/** lang code → (ayah id → translated text) */
export type TranslationMap = Record<string, Record<number, string>>;

export type SurahRow = {
  number: number;
  name_ar: string;
  name_en: string;
  name_meaning_en: string;
  ayah_count: number;
  revelation: 'Meccan' | 'Medinan';
};

export const TOTAL_AYAHS = 6236;
export const TOTAL_PAGES = 604;

// Bump the name whenever the bundled database changes shape — the copy runs
// once per install, so existing installs only pick up a new file under a new
// name. Older copies are deleted below.
// v3: Uthmani Arabic text, and Mehanović in place of Korkut for Bosnian.
const DB_NAME = 'quran.v3.db';
const OLD_DB_NAMES = ['quran.db', 'quran.v2.db'];

/**
 * expo-sqlite cannot open a database straight from the asset bundle, so on
 * first launch we copy the bundled quran.db into the app's document
 * directory under SQLite/ (where openDatabaseAsync looks for it). The copy
 * runs at most once per install: if the file already exists we skip it.
 * The database is treated as read-only — we never write to it.
 */
async function copyDatabaseIfNeeded(): Promise<void> {
  const sqliteDir = new Directory(Paths.document, 'SQLite');
  if (!sqliteDir.exists) {
    sqliteDir.create({ intermediates: true });
  }
  for (const oldName of OLD_DB_NAMES) {
    const oldFile = new File(sqliteDir, oldName);
    if (oldFile.exists) oldFile.delete();
  }
  const dbFile = new File(sqliteDir, DB_NAME);
  if (dbFile.exists) return;

  const asset = Asset.fromModule(require('../../assets/quran.db'));
  await asset.downloadAsync(); // resolves the asset to a local file:// URI
  if (!asset.localUri) {
    throw new Error('Could not resolve bundled quran.db asset');
  }
  new File(asset.localUri).copy(dbFile);
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open (and on first call, copy) the bundled database. Safe to call repeatedly. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      await copyDatabaseIfNeeded();
      return SQLite.openDatabaseAsync(DB_NAME);
    })();
    // Reset on failure so a transient error doesn't poison every later call.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

export async function getAyahsByIdRange(startId: number, endId: number): Promise<AyahRow[]> {
  const db = await getDb();
  return db.getAllAsync<AyahRow>(
    'SELECT * FROM ayah WHERE id BETWEEN ? AND ? ORDER BY id',
    [startId, endId],
  );
}

export async function getAyahsByPageRange(startPage: number, endPage: number): Promise<AyahRow[]> {
  const db = await getDb();
  return db.getAllAsync<AyahRow>(
    'SELECT * FROM ayah WHERE page BETWEEN ? AND ? ORDER BY id',
    [startPage, endPage],
  );
}

/** Rows for an arbitrary id set (bookmarks). Returned in id order. */
export async function getAyahsByIds(ids: number[]): Promise<AyahRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(', ');
  return db.getAllAsync<AyahRow>(
    `SELECT * FROM ayah WHERE id IN (${placeholders}) ORDER BY id`,
    ids,
  );
}

let pageStartsPromise: Promise<Map<number, number>> | null = null;

/** page number → global id of its first ayah, cached after the first query. */
export function getPageStartIds(): Promise<Map<number, number>> {
  if (!pageStartsPromise) {
    pageStartsPromise = (async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<{ page: number; startId: number }>(
        'SELECT page, MIN(id) AS startId FROM ayah GROUP BY page',
      );
      return new Map(rows.map((r) => [r.page, r.startId]));
    })();
    pageStartsPromise.catch(() => {
      pageStartsPromise = null;
    });
  }
  return pageStartsPromise;
}

/** surah number → global id of its first ayah. */
export async function getSurahStartIds(): Promise<Map<number, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ surah: number; startId: number }>(
    'SELECT surah, MIN(id) AS startId FROM ayah GROUP BY surah',
  );
  return new Map(rows.map((r) => [r.surah, r.startId]));
}

/**
 * Translations for a contiguous ayah id range, keyed lang → ayah id → text.
 * Both passage units produce contiguous ids, so a range query covers all rows.
 */
export async function getTranslationsByIdRange(
  langs: string[],
  startId: number,
  endId: number,
): Promise<TranslationMap> {
  const map: TranslationMap = {};
  if (langs.length === 0) return map;
  const db = await getDb();
  const placeholders = langs.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{ lang: string; ayah_id: number; text: string }>(
    `SELECT lang, ayah_id, text FROM translation
     WHERE lang IN (${placeholders}) AND ayah_id BETWEEN ? AND ?`,
    [...langs, startId, endId],
  );
  for (const row of rows) {
    (map[row.lang] ??= {})[row.ayah_id] = row.text;
  }
  return map;
}

let languagesPromise: Promise<LanguageRow[]> | null = null;

/** All languages in picker order (includes 'ar'), cached after the first query. */
export function getLanguages(): Promise<LanguageRow[]> {
  if (!languagesPromise) {
    languagesPromise = (async () => {
      const db = await getDb();
      return db.getAllAsync<LanguageRow>('SELECT * FROM language ORDER BY sort');
    })();
    languagesPromise.catch(() => {
      languagesPromise = null;
    });
  }
  return languagesPromise;
}

let surahsPromise: Promise<Map<number, SurahRow>> | null = null;

/** All 114 surahs keyed by number, cached after the first query. */
export function getSurahs(): Promise<Map<number, SurahRow>> {
  if (!surahsPromise) {
    surahsPromise = (async () => {
      const db = await getDb();
      const rows = await db.getAllAsync<SurahRow>('SELECT * FROM surah ORDER BY number');
      return new Map(rows.map((s) => [s.number, s]));
    })();
    surahsPromise.catch(() => {
      surahsPromise = null;
    });
  }
  return surahsPromise;
}
