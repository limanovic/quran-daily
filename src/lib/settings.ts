import AsyncStorage from '@react-native-async-storage/async-storage';
import { Unit } from './passage';
import { ThemePreference } from './theme';

export type ReadingMode = 'scroll' | 'page';

export type Delivery = {
  time: string; // 'HH:mm' 24h wall-clock
  unit: Unit;
  count: number; // units for this delivery
};

export type Settings = {
  deliveries: Delivery[]; // unique times, sorted by time; empty = no notifications
  showArabic: boolean;
  translations: string[]; // language codes, in display order
  readingMode: ReadingMode; // continuous scroll vs mushaf-style page swipes
  theme: ThemePreference;
  uiLanguage: string; // 'auto' (follow first translation) or a TRANSLATION_CODES entry
};

/** Codes present in the bundled database ('ar' excluded — that's showArabic). */
export const TRANSLATION_CODES = [
  'en', 'bs', 'sq', 'de', 'tr', 'fr', 'es', 'it', 'nl', 'ru', 'id', 'ur',
] as const;

const SETTINGS_KEY = 'settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  deliveries: [{ time: '09:00', unit: 'ayah', count: 1 }],
  showArabic: true,
  translations: ['en'],
  readingMode: 'scroll',
  theme: 'system',
  uiLanguage: 'auto',
};

/** Sane per-unit bounds for `count` (tune later). */
export const COUNT_BOUNDS: Record<Unit, { min: number; max: number }> = {
  ayah: { min: 1, max: 20 },
  page: { min: 1, max: 10 },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Shapes stored by older installs (settings.v1 pre-migration). */
type LegacyToggles = { showEnglish?: boolean; showBosnian?: boolean };
type LegacyGlobalPassage = { unit?: Unit; count?: number; times?: string[] };

function normalizeDelivery(d: Partial<Delivery>): Delivery {
  const unit: Unit = d.unit === 'page' ? 'page' : 'ayah';
  const { min, max } = COUNT_BOUNDS[unit];
  const count = Math.min(max, Math.max(min, Math.round(d.count ?? min) || min));
  return { time: d.time ?? '', unit, count };
}

/** Clamp/repair a settings object so the rest of the app can trust it. */
export function normalizeSettings(
  raw: (Partial<Settings> & LegacyToggles & LegacyGlobalPassage) | null | undefined,
): Settings {
  const { showEnglish, showBosnian, unit, count, times, ...rest } = raw ?? {};
  const s: Settings = { ...DEFAULT_SETTINGS, ...rest };
  // Migrate pre-per-delivery installs: one global unit/count applied to each time.
  if (!Array.isArray(rest.deliveries) && Array.isArray(times)) {
    s.deliveries = times.map((time) => ({ time, unit: unit ?? 'ayah', count: count ?? 1 }));
  }
  const seen = new Set<string>();
  s.deliveries = s.deliveries
    .map(normalizeDelivery)
    .filter((d) => TIME_RE.test(d.time) && !seen.has(d.time) && (seen.add(d.time), true))
    .sort((a, b) => a.time.localeCompare(b.time));
  // An empty list is a valid choice: it's how a user turns notifications off
  // from inside the app. Fresh installs still start from DEFAULT_SETTINGS.
  // Migrate pre-list installs: rebuild the list from the old booleans.
  if (!Array.isArray(rest.translations) && (showEnglish !== undefined || showBosnian !== undefined)) {
    s.translations = [...(showEnglish ? ['en'] : []), ...(showBosnian ? ['bs'] : [])];
  }
  const known = new Set<string>(TRANSLATION_CODES);
  s.translations = [...new Set(s.translations)].filter((c) => known.has(c));
  // Something must stay visible.
  if (!s.showArabic && s.translations.length === 0) s.translations = ['en'];
  if (s.readingMode !== 'scroll' && s.readingMode !== 'page') s.readingMode = 'scroll';
  if (s.theme !== 'system' && s.theme !== 'light' && s.theme !== 'dark') s.theme = 'system';
  if (s.uiLanguage !== 'auto' && !known.has(s.uiLanguage)) s.uiLanguage = 'auto';
  return s;
}

export async function loadSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const normalized = normalizeSettings(settings);
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}
