import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { loadBookmarks, loadLastPosition } from '@/lib/bookmarks';
import { getAyahsByIds, getSurahs } from '@/lib/db';
import { useT } from '@/lib/i18n';
import {
  canScheduleExactAlarms,
  dismissAutostartPrompt,
  dismissExactAlarmPrompt,
  getPermissionGranted,
  isAutostartPromptDismissed,
  isExactAlarmPromptDismissed,
  needsAutostartSetup,
  onLedgerChange,
  openAutostartSettings,
  openExactAlarmSettings,
  rebuildSchedule,
  requestPermission,
} from '@/lib/notifications';
import { addExactAlarmPermissionListener } from '../../modules/exact-alarms';
import { buildPassage, buildPassageAt, pageOfAyah } from '@/lib/passage';
import {
  COUNT_BOUNDS,
  DEFAULT_SETTINGS,
  Delivery,
  Settings,
  loadSettings,
  saveSettings,
} from '@/lib/settings';
import { CURSOR_START, loadCursor, resetCursor } from '@/lib/wird';
import { useTheme } from '@/lib/theme';
import { makeListStyles } from '@/lib/ui-styles';

type LastPosition = { id: number; name: string | null; surah: number; ayah: number } | null;

/** The delivery due next — the first one later today, else tomorrow's first. */
function nextDelivery(deliveries: Delivery[]): Delivery | undefined {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return deliveries.find((d) => d.time > hhmm) ?? deliveries[0];
}

/**
 * Stepper button that keeps firing while held — reaching 20 ayahs from 5 is
 * otherwise fifteen separate taps.
 */
function StepButton({
  label,
  glyph,
  disabled,
  style,
  textStyle,
  onStep,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  style: StyleProp<ViewStyle>;
  textStyle: StyleProp<TextStyle>;
  onStep: () => void;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // The interval must call the *current* onStep: the one captured when the
  // hold began still sees the old count and would re-apply the same value.
  const step = useRef(onStep);
  step.current = onStep;
  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  return (
    <Pressable
      style={style}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onStep}
      onLongPress={() => {
        stop();
        timer.current = setInterval(() => step.current(), 120);
      }}
      onPressOut={stop}
    >
      <Text style={textStyle}>{glyph}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const t = useT();
  const styles = useMemo(() => makeListStyles(theme), [theme]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  // Which time picker is open: adding a new delivery, or retiming the one
  // currently open in the edit sheet.
  const [picker, setPicker] = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [lastPosition, setLastPosition] = useState<LastPosition>(null);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  // Where the shared in-order progression stands, and its human reference.
  const [cursor, setCursor] = useState<number>(CURSOR_START);
  const [nextUpLabel, setNextUpLabel] = useState<string | null>(null);
  // Exact-alarm state: true everywhere except Android 12+ without the grant.
  const [exactAlarms, setExactAlarms] = useState(true);
  const [exactPromptDismissed, setExactPromptDismissed] = useState(true);
  const [autostartPromptDismissed, setAutostartPromptDismissed] = useState(true);

  useEffect(() => {
    getPermissionGranted().then(setGranted);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setExactAlarms(canScheduleExactAlarms());
    isExactAlarmPromptDismissed().then((d) => setExactPromptDismissed(d));
    if (needsAutostartSetup()) isAutostartPromptDismissed().then((d) => setAutostartPromptDismissed(d));
    // The toggle lives in a system screen, so the grant arrives as a broadcast
    // rather than a result. Pending one-shots were queued while the OS was only
    // honouring them approximately — requeue them to claim the exact minute.
    const sub = addExactAlarmPermissionListener((ok) => {
      setExactAlarms(ok);
      if (ok) loadSettings().then(rebuildSchedule).catch(() => {});
    });
    return () => sub?.remove();
  }, []);

  // Deliveries, reading progress and bookmarks all change while other screens
  // are open, so refresh them every time this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [loaded, lastId, bookmarks, wird] = await Promise.all([
          loadSettings(),
          loadLastPosition(),
          loadBookmarks(),
          loadCursor(),
        ]);
        setSettings(loaded);
        setBookmarkCount(bookmarks.length);
        setCursor(wird);
        // Covers coming back from the system toggle if the broadcast is missed.
        if (Platform.OS === 'android') setExactAlarms(canScheduleExactAlarms());
        if (!lastId) {
          setLastPosition(null);
          return;
        }
        const [rows, surahs] = await Promise.all([getAyahsByIds([lastId]), getSurahs()]);
        const row = rows[0];
        setLastPosition(
          row
            ? {
                id: lastId,
                name: surahs.get(row.surah)?.name_en ?? null,
                surah: row.surah,
                ayah: row.ayah,
              }
            : { id: lastId, name: null, surah: 0, ayah: 0 },
        );
      })().catch(() => {});
    }, []),
  );

  // The cursor moves when a reminder fires, which the scheduler notices on its
  // next run — not on any user action this screen can see.
  useEffect(
    () => onLedgerChange(() => { loadCursor().then(setCursor).catch(() => {}); }),
    [],
  );

  const edited = settings?.deliveries.find((d) => d.time === editing) ?? null;
  const hasSequential = settings?.deliveries.some((d) => d.mode === 'sequential') ?? false;

  // Where the progression resumes, spelled out as a reference rather than an
  // ayah id — "Al-Baqara 2:255" means something, "ayah 262" doesn't.
  useEffect(() => {
    if (!hasSequential) {
      setNextUpLabel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [rows, surahs] = await Promise.all([getAyahsByIds([cursor]), getSurahs()]);
      if (cancelled) return;
      const row = rows[0];
      const name = row ? surahs.get(row.surah)?.name_en : null;
      setNextUpLabel(
        row && name ? `${name} ${row.surah}:${row.ayah}` : t('ayahN', { n: cursor }),
      );
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSequential, cursor]);

  /** Persist a settings change and rebuild the notification window with it. */
  const apply = useCallback((next: Settings) => {
    setSettings(next);
    (async () => {
      const normalized = await saveSettings(next);
      await rebuildSchedule(normalized);
    })().catch(() => {});
  }, []);

  const onEnableNotifications = useCallback(async () => {
    const ok = await requestPermission();
    setGranted(ok);
    if (!ok) {
      Linking.openSettings();
      return;
    }
    if (settings) apply(settings);
  }, [settings, apply]);

  const onPreview = useCallback(async () => {
    if (!settings) return;
    // Preview what actually arrives next, not whichever wird happens to be
    // first in the list.
    const d = nextDelivery(settings.deliveries);
    if (!d) return;
    // An in-order wird has one right answer for "next" — the shared cursor is
    // the position its next reminder was already queued with.
    let passageKey;
    if (d.mode !== 'sequential') {
      ({ passageKey } = await buildPassage(d.unit, d.count));
    } else {
      const at = await loadCursor();
      ({ passageKey } =
        d.unit === 'ayah'
          ? await buildPassageAt('ayah', d.count, at)
          : await buildPassageAt('page', d.count, await pageOfAyah(at)));
    }
    router.push({ pathname: '/reader', params: { key: JSON.stringify(passageKey) } });
  }, [settings]);

  const onTimePicked = useCallback(
    async (event: DateTimePickerEvent, date?: Date) => {
      const mode = picker;
      setPicker(null);
      if (event.type !== 'set' || !date || !settings) return;
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      const time = `${hh}:${mm}`;
      // A time already on the list: just open it rather than duplicating it.
      if (settings.deliveries.some((d) => d.time === time)) {
        setEditing(time);
        return;
      }
      const deliveries =
        mode === 'add'
          ? // New deliveries inherit the last one's shape; on an empty list
            // there is nothing to inherit, so fall back to the default.
            [
              ...settings.deliveries,
              {
                ...(settings.deliveries[settings.deliveries.length - 1] ??
                  DEFAULT_SETTINGS.deliveries[0]),
                time,
              },
            ]
          : settings.deliveries.map((d) => (d.time === editing ? { ...d, time } : d));
      deliveries.sort((a, b) => a.time.localeCompare(b.time));
      // The progression is shared, so retiming a delivery carries no progress
      // with it — there is nothing to rename.
      apply({ ...settings, deliveries });
      setEditing(time);
    },
    [picker, editing, settings, apply],
  );

  const header = (
    <Stack.Screen
      options={{
        title: t('appTitle'),
        headerRight: () => (
          <Pressable
            style={styles.headerButton}
            accessibilityLabel={t('settings')}
            accessibilityRole="button"
            onPress={() => router.push('/settings')}
          >
            <Text style={styles.headerButtonText}>⚙</Text>
          </Pressable>
        ),
      }}
    />
  );

  if (!settings)
    return (
      <View style={styles.screen}>
        {header}
      </View>
    );

  const updateDelivery = (time: string, patch: Partial<Delivery>) => {
    const deliveries = settings.deliveries.map((d) => {
      if (d.time !== time) return d;
      const next = { ...d, ...patch };
      next.count = Math.min(COUNT_BOUNDS[next.unit].max, next.count);
      return next;
    });
    apply({ ...settings, deliveries });
  };

  const amountLabel = (d: Delivery) => {
    const amount = d.unit === 'ayah' ? t('ayahsCount', { n: d.count }) : t('pagesCount', { n: d.count });
    return `${amount} · ${d.mode === 'sequential' ? t('sequential') : t('random')}`;
  };

  /** Seed the time picker with an existing delivery's time, or 09:00. */
  const pickerValue = (time: string | null) => {
    const [hh, mm] = time ? time.split(':').map(Number) : [9, 0];
    return new Date(2000, 0, 1, hh, mm);
  };

  const editedBounds = edited ? COUNT_BOUNDS[edited.unit] : null;

  /** Begin the khatma again; pending reminders hold stale positions. */
  const startOver = () => {
    (async () => {
      await resetCursor();
      setCursor(await loadCursor());
      await rebuildSchedule(await loadSettings());
    })().catch(() => {});
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {header}
      {/* Only nag about OS permission when the user actually wants deliveries. */}
      {granted === false && settings.deliveries.length > 0 && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('notifOff')}</Text>
          <Pressable style={styles.bannerButton} onPress={onEnableNotifications}>
            <Text style={styles.bannerButtonText}>{t('enableNotifs')}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>{t('wird')}</Text>
      {/* "Wird" is unfamiliar to many, and a list of times doesn't say a
          notification is what arrives — one line covers both. */}
      <Text style={styles.sectionHint}>{t('wirdHint')}</Text>
      <View style={styles.card}>
        {settings.deliveries.length === 0 && (
          <View style={styles.row}>
            <Text style={styles.rowValue}>{t('noTimes')}</Text>
          </View>
        )}
        {settings.deliveries.map((delivery) => (
          <Pressable
            key={delivery.time}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={`${delivery.time}, ${amountLabel(delivery)}`}
            onPress={() => setEditing(delivery.time)}
          >
            <Text style={styles.timeText}>{delivery.time}</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{amountLabel(delivery)}</Text>
              <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
                ›
              </Text>
            </View>
          </Pressable>
        ))}
        <Pressable style={styles.addRow} accessibilityRole="button" onPress={() => setPicker('add')}>
          <Text style={styles.addText}>+ {t('addTime')}</Text>
        </Pressable>
        {picker === 'add' && (
          <DateTimePicker
            value={pickerValue(null)}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimePicked}
          />
        )}
      </View>

      {/* One progression, shown once. Per-time it would be a lie: which passage
          a given time gets depends on where it sits among the others that day. */}
      {hasSequential && (
        <>
          <Text style={styles.sectionTitle}>{t('sequential')}</Text>
          <Text style={styles.sectionHint}>{t('sharedProgressionHint')}</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('nextUp')}</Text>
              <Text style={styles.rowValue}>{nextUpLabel ?? '…'}</Text>
            </View>
            <Pressable style={styles.row} accessibilityRole="button" onPress={startOver}>
              <Text style={styles.linkText}>{t('startOver')}</Text>
            </Pressable>
          </View>
        </>
      )}

      {settings.deliveries.length > 0 && (
        <Pressable style={styles.linkRow} accessibilityRole="button" onPress={onPreview}>
          <Text style={styles.linkText}>{t('previewNext')}</Text>
        </Pressable>
      )}

      {/* The autostart grant can never be read back, so a banner about it could
          only ever nag. A quiet standing link costs nothing and points at the
          Settings section that collects every OS-level switch instead. */}
      {Platform.OS === 'android' && settings.deliveries.length > 0 && (
        <Pressable
          style={styles.linkRow}
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
        >
          <Text style={styles.linkText}>{t('deliveryTroubles')}</Text>
        </Pressable>
      )}

      {/* Ranked above the exact-alarm offer: on these ROMs a reminder does not
          arrive late, it does not arrive at all until the app is next opened.
          The grant can't be read back, so dismissal is the user's "done". */}
      {granted === true && !autostartPromptDismissed && settings.deliveries.length > 0 && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('autostartHint')}</Text>
          <Pressable style={styles.bannerButton} onPress={openAutostartSettings}>
            <Text style={styles.bannerButtonText}>{t('allowAutostart')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setAutostartPromptDismissed(true);
              dismissAutostartPrompt().catch(() => {});
            }}
          >
            <Text style={styles.linkText}>{t('dismiss')}</Text>
          </Pressable>
        </View>
      )}

      {/* Offered, not demanded: without the grant reminders still arrive, just
          batched a few minutes off. Shown only where it can actually be acted
          on — Android 12+ without the grant — and never again once dismissed. */}
      {!exactAlarms && !exactPromptDismissed && settings.deliveries.length > 0 && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('exactAlarmsHint')}</Text>
          <Pressable style={styles.bannerButton} onPress={openExactAlarmSettings}>
            <Text style={styles.bannerButtonText}>{t('allowExactAlarms')}</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setExactPromptDismissed(true);
              dismissExactAlarmPrompt().catch(() => {});
            }}
          >
            <Text style={styles.linkText}>{t('dismiss')}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>{t('reading')}</Text>
      <Pressable
        style={styles.continueCard}
        accessibilityRole="button"
        onPress={() =>
          router.push({
            pathname: '/quran',
            params: { start: String(lastPosition?.id ?? 1) },
          })
        }
      >
        <View>
          <Text style={styles.continueLabel}>{t('continueReading')}</Text>
          <Text style={styles.continueSub}>
            {lastPosition
              ? lastPosition.name
                ? `${lastPosition.name} ${lastPosition.surah}:${lastPosition.ayah}`
                : t('ayahN', { n: lastPosition.id })
              : t('startBeginning')}
          </Text>
        </View>
        <Text style={[styles.chevron, styles.chevronOnAccent]} accessibilityElementsHidden importantForAccessibility="no">
          ›
        </Text>
      </Pressable>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          accessibilityRole="button"
          onPress={() => router.push('/bookmarks')}
        >
          <Text style={styles.rowLabel}>{t('bookmarks')}</Text>
          <View style={styles.rowRight}>
            {bookmarkCount > 0 && <Text style={styles.rowSub}>{bookmarkCount}</Text>}
            <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
              ›
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.row}
          accessibilityRole="button"
          onPress={() => router.push('/surahs')}
        >
          <Text style={styles.rowLabel}>{t('surahs')}</Text>
          <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
            ›
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={edited !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditing(null)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            {edited && editedBounds && (
              <>
                <Text style={styles.modalTitle}>{t('passage')}</Text>
                <Pressable
                  style={styles.row}
                  accessibilityRole="button"
                  onPress={() => setPicker('edit')}
                >
                  <Text style={styles.rowLabel}>{t('time')}</Text>
                  <View style={styles.rowRight}>
                    <Text style={styles.timeText}>{edited.time}</Text>
                    <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
                      ›
                    </Text>
                  </View>
                </Pressable>
                {picker === 'edit' && (
                  <DateTimePicker
                    value={pickerValue(edited.time)}
                    mode="time"
                    is24Hour
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onTimePicked}
                  />
                )}
                <View style={styles.segmented}>
                  {(['ayah', 'page'] as const).map((unit) => (
                    <Pressable
                      key={unit}
                      style={[styles.segment, edited.unit === unit && styles.segmentActive]}
                      onPress={() => edited.unit !== unit && updateDelivery(edited.time, { unit })}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          edited.unit === unit && styles.segmentTextActive,
                        ]}
                      >
                        {unit === 'ayah' ? t('ayahs') : t('pages')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>{t('amount')}</Text>
                  <View style={styles.stepper}>
                    <StepButton
                      label={t('decrease')}
                      glyph="−"
                      disabled={edited.count <= editedBounds.min}
                      style={[
                        styles.stepButton,
                        edited.count <= editedBounds.min && styles.stepButtonDisabled,
                      ]}
                      textStyle={styles.stepButtonText}
                      onStep={() =>
                        edited.count > editedBounds.min &&
                        updateDelivery(edited.time, { count: edited.count - 1 })
                      }
                    />
                    <Text style={styles.stepValue}>{edited.count}</Text>
                    <StepButton
                      label={t('increase')}
                      glyph="+"
                      disabled={edited.count >= editedBounds.max}
                      style={[
                        styles.stepButton,
                        edited.count >= editedBounds.max && styles.stepButtonDisabled,
                      ]}
                      textStyle={styles.stepButtonText}
                      onStep={() =>
                        edited.count < editedBounds.max &&
                        updateDelivery(edited.time, { count: edited.count + 1 })
                      }
                    />
                  </View>
                </View>
                {/* Random or in order. Each time keeps its own place in the
                    mus'haf, so one wird can walk through it while another
                    stays a surprise. */}
                <View style={styles.segmented}>
                  {(['random', 'sequential'] as const).map((mode) => (
                    <Pressable
                      key={mode}
                      style={[styles.segment, edited.mode === mode && styles.segmentActive]}
                      onPress={() => edited.mode !== mode && updateDelivery(edited.time, { mode })}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          edited.mode === mode && styles.segmentTextActive,
                        ]}
                      >
                        {mode === 'random' ? t('random') : t('sequential')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>
                  {edited.mode === 'sequential' ? t('sequentialHint') : t('randomHint')}
                </Text>
                {/* Removing the last one is allowed: an empty list is how
                    notifications get turned off from inside the app. */}
                <Pressable
                  style={styles.row}
                  accessibilityRole="button"
                  onPress={() => {
                    setEditing(null);
                    apply({
                      ...settings,
                      deliveries: settings.deliveries.filter((d) => d.time !== edited.time),
                    });
                  }}
                >
                  <Text style={styles.removeText}>{t('remove')}</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
