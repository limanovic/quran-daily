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
import { getPermissionGranted, rebuildSchedule, requestPermission } from '@/lib/notifications';
import { buildPassage } from '@/lib/passage';
import {
  COUNT_BOUNDS,
  DEFAULT_SETTINGS,
  Delivery,
  Settings,
  loadSettings,
  saveSettings,
} from '@/lib/settings';
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

  useEffect(() => {
    getPermissionGranted().then(setGranted);
  }, []);

  // Deliveries, reading progress and bookmarks all change while other screens
  // are open, so refresh them every time this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [loaded, lastId, bookmarks] = await Promise.all([
          loadSettings(),
          loadLastPosition(),
          loadBookmarks(),
        ]);
        setSettings(loaded);
        setBookmarkCount(bookmarks.length);
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
    const { passageKey } = await buildPassage(d.unit, d.count);
    router.push({ pathname: '/reader', params: { key: JSON.stringify(passageKey) } });
  }, [settings]);

  const onTimePicked = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
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

  const amountLabel = (d: Delivery) =>
    d.unit === 'ayah' ? t('ayahsCount', { n: d.count }) : t('pagesCount', { n: d.count });

  /** Seed the time picker with an existing delivery's time, or 09:00. */
  const pickerValue = (time: string | null) => {
    const [hh, mm] = time ? time.split(':').map(Number) : [9, 0];
    return new Date(2000, 0, 1, hh, mm);
  };

  const edited = settings.deliveries.find((d) => d.time === editing) ?? null;
  const editedBounds = edited ? COUNT_BOUNDS[edited.unit] : null;

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

      {settings.deliveries.length > 0 && (
        <Pressable style={styles.linkRow} accessibilityRole="button" onPress={onPreview}>
          <Text style={styles.linkText}>{t('previewNext')}</Text>
        </Pressable>
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
