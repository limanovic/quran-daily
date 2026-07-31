import AsyncStorage from '@react-native-async-storage/async-storage';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { AyahRow, getTranslationsByIdRange } from './db';
import { applyUiLanguage, t } from './i18n';
import { PassageKey, buildPassage, formatReference } from './passage';
import { Delivery, Settings } from './settings';

/*
 * Scheduling model — rolling window with pre-committed random picks.
 *
 * Local notifications freeze their content at scheduling time, and iOS caps
 * pending local notifications at 64. A single repeating "daily at 09:00"
 * trigger would therefore show the same passage forever. Instead, every
 * future (day × delivery-time) occurrence is scheduled as an independent
 * one-shot: the random passage is picked *now*, its text is baked into the
 * notification content, and a ledger entry records which passage belongs to
 * which occurrence so the Reader can reproduce it exactly.
 *
 * We keep at most MAX_PENDING (< 64, with headroom) one-shots queued. On
 * every app launch and foreground we prune past ledger entries and top the
 * window back up. If the user doesn't open the app for weeks the queue
 * eventually drains — OS-level guarantees for very long dormancy vary, and
 * the top-up-on-open pattern is the pragmatic fix for a personal app.
 */

export type LedgerEntry = {
  notificationId: string;
  dateISO: string; // 'YYYY-MM-DD' local calendar day
  time: string; // 'HH:mm'
  passageKey: PassageKey;
};

const LEDGER_KEY = 'ledger.v1';
const EXACT_PROMPT_KEY = 'exactAlarmPrompt.dismissed.v1';
const MAX_PENDING = 60;
// Android freezes a channel's importance at creation time — later
// setNotificationChannelAsync calls with the same id can't raise it. The `-v2`
// suffix exists because the original channel shipped at DEFAULT importance,
// which puts the reminder silently in the shade instead of on screen.
const ANDROID_CHANNEL_ID = 'daily-quran-v2';
const LEGACY_ANDROID_CHANNEL_IDS = ['daily-quran'];

export function configureNotificationHandling(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    // HIGH so the reminder surfaces as a heads-up banner. At DEFAULT it lands
    // in the shade only, which reads as "no notification arrived" to anyone
    // who doesn't pull the shade down at that moment.
    name: t('channelName'),
    importance: Notifications.AndroidImportance.HIGH,
    sound: undefined,
  });
  await Promise.all(
    LEGACY_ANDROID_CHANNEL_IDS.map((id) =>
      Notifications.deleteNotificationChannelAsync(id).catch(() => {}),
    ),
  );
}

/**
 * Android 12+ gates exact alarms behind SCHEDULE_EXACT_ALARM, and Android 14+
 * denies it by default. Without it a scheduled passage still arrives — the OS
 * batches it, landing a few minutes off the requested time.
 */
export { canScheduleExactAlarms, openExactAlarmSettings } from '../../modules/exact-alarms';

/**
 * The exact-alarm offer is a nicety, not a gate — reminders still arrive
 * without it. Once dismissed it stays dismissed; Settings keeps the row.
 */
export async function isExactAlarmPromptDismissed(): Promise<boolean> {
  return (await AsyncStorage.getItem(EXACT_PROMPT_KEY)) === '1';
}

export async function dismissExactAlarmPrompt(): Promise<void> {
  await AsyncStorage.setItem(EXACT_PROMPT_KEY, '1');
}

/**
 * Battery optimisation (and OEM "put app to sleep" features built on top of
 * it) suspends the alarm entirely while the phone is idle — the overnight
 * case where a morning reminder never fires at all.
 */
export async function openBatteryOptimizationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync(
      'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
    );
  } catch {
    await Linking.openSettings().catch(() => {});
  }
}

export async function getPermissionGranted(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

export async function requestPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function loadLedger(): Promise<LedgerEntry[]> {
  const raw = await AsyncStorage.getItem(LEDGER_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LedgerEntry[];
  } catch {
    return [];
  }
}

async function saveLedger(ledger: LedgerEntry[]): Promise<void> {
  await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
}

function toDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Local wall-clock Date for an occurrence. Built from calendar components,
 * not UTC offsets, so 09:00 stays 09:00 across DST transitions.
 */
function occurrenceDate(dateISO: string, time: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function occurrenceKey(e: { dateISO: string; time: string }): string {
  return `${e.dateISO} ${e.time}`;
}

/** Notification body: prefer translation text — Arabic renders poorly in OS notifications. */
async function buildBody(rows: AyahRow[], settings: Settings): Promise<string> {
  let text: string;
  const lang = settings.translations[0];
  if (lang && rows.length > 0) {
    const map = await getTranslationsByIdRange([lang], rows[0].id, rows[rows.length - 1].id);
    text = rows.map((r) => map[lang]?.[r.id] ?? '').join(' ').trim();
    if (!text) text = rows.map((r) => r.arabic).join(' ');
  } else {
    text = rows.map((r) => r.arabic).join(' ');
  }
  // Android renders long bodies via BigText-style expansion; iOS truncates in
  // the banner and expands on long-press. Cap defensively anyway.
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}

async function scheduleOccurrence(
  dateISO: string,
  delivery: Delivery,
  settings: Settings,
): Promise<LedgerEntry> {
  const { rows, passageKey } = await buildPassage(delivery.unit, delivery.count);
  const title = await formatReference(rows, passageKey);
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: await buildBody(rows, settings),
      data: { passageKey },
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: occurrenceDate(dateISO, delivery.time),
      channelId: ANDROID_CHANNEL_ID,
    },
  });
  return { notificationId, dateISO, time: delivery.time, passageKey };
}

// Scheduling operations mutate the ledger and the OS notification queue, so
// concurrent runs (e.g. two quick settings changes) must not interleave —
// serialize them through this promise chain.
let scheduleChain: Promise<LedgerEntry[]> = Promise.resolve([]);

const ledgerListeners = new Set<(ledger: LedgerEntry[]) => void>();

/** Subscribe to ledger updates (fires after every top-up/rebuild). Returns unsubscribe. */
export function onLedgerChange(listener: (ledger: LedgerEntry[]) => void): () => void {
  ledgerListeners.add(listener);
  return () => ledgerListeners.delete(listener);
}

function enqueue(op: () => Promise<LedgerEntry[]>): Promise<LedgerEntry[]> {
  scheduleChain = scheduleChain.then(op, op).then((ledger) => {
    ledgerListeners.forEach((l) => l(ledger));
    return ledger;
  });
  return scheduleChain;
}

/**
 * Prune past ledger entries and schedule forward until the window is full.
 * Called on app launch and on every foreground. Safe to call repeatedly.
 */
export function topUpSchedule(settings: Settings): Promise<LedgerEntry[]> {
  return enqueue(() => topUpScheduleInner(settings));
}

async function topUpScheduleInner(settings: Settings): Promise<LedgerEntry[]> {
  // No times set: the user has turned notifications off from inside the app.
  // Clear anything still pending — and note the horizon maths below would
  // divide by zero and loop forever on an empty list.
  if (settings.deliveries.length === 0) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await saveLedger([]);
    return [];
  }
  if (!(await getPermissionGranted())) return loadLedger();
  // Notification titles/bodies bake in text at scheduling time — make sure
  // they are built in the language these settings ask for.
  applyUiLanguage(settings);
  await ensureAndroidChannel();

  const now = new Date();
  const ledger = (await loadLedger()).filter((e) => occurrenceDate(e.dateISO, e.time) > now);
  const scheduled = new Set(ledger.map(occurrenceKey));

  // Fill the window: N days × deliveries/day, never exceeding MAX_PENDING total.
  const horizonDays = Math.max(1, Math.floor(MAX_PENDING / settings.deliveries.length));
  outer: for (let offset = 0; offset < horizonDays; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const dateISO = toDateISO(day);
    for (const delivery of settings.deliveries) {
      if (ledger.length >= MAX_PENDING) break outer;
      if (occurrenceDate(dateISO, delivery.time) <= now) continue; // today's already-past times
      if (scheduled.has(occurrenceKey({ dateISO, time: delivery.time }))) continue;
      const entry = await scheduleOccurrence(dateISO, delivery, settings);
      ledger.push(entry);
      scheduled.add(occurrenceKey(entry));
    }
  }

  ledger.sort((a, b) =>
    occurrenceDate(a.dateISO, a.time).getTime() - occurrenceDate(b.dateISO, b.time).getTime(),
  );
  await saveLedger(ledger);
  return ledger;
}

/**
 * Settings changed: throw away every pending pick and rebuild the whole
 * window with the new unit/count/times/translations.
 */
export function rebuildSchedule(settings: Settings): Promise<LedgerEntry[]> {
  return enqueue(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(LEDGER_KEY);
    return topUpScheduleInner(settings);
  });
}
