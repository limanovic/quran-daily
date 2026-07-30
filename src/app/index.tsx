import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { loadBookmarks, loadLastPosition } from '@/lib/bookmarks';
import { getAyahsByIds, getSurahs } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { getPermissionGranted, rebuildSchedule, requestPermission } from '@/lib/notifications';
import { buildPassage } from '@/lib/passage';
import { COUNT_BOUNDS, Delivery, Settings, loadSettings, saveSettings } from '@/lib/settings';
import { useTheme } from '@/lib/theme';
import { makeListStyles } from '@/lib/ui-styles';

type LastPosition = { id: number; name: string | null; surah: number; ayah: number } | null;

export default function HomeScreen() {
  const theme = useTheme();
  const t = useT();
  const styles = useMemo(() => makeListStyles(theme), [theme]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
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
    const d = settings.deliveries[0];
    const { passageKey } = await buildPassage(d.unit, d.count);
    router.push({ pathname: '/reader', params: { key: JSON.stringify(passageKey) } });
  }, [settings]);

  const onTimePicked = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      setShowTimePicker(false);
      if (event.type !== 'set' || !date || !settings) return;
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      const time = `${hh}:${mm}`;
      if (settings.deliveries.some((d) => d.time === time)) return;
      // New deliveries inherit the last delivery's passage shape.
      const last = settings.deliveries[settings.deliveries.length - 1];
      const next = [...settings.deliveries, { time, unit: last.unit, count: last.count }];
      next.sort((a, b) => a.time.localeCompare(b.time));
      apply({ ...settings, deliveries: next });
    },
    [settings, apply],
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {header}
      {granted === false && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('notifOff')}</Text>
          <Pressable style={styles.bannerButton} onPress={onEnableNotifications}>
            <Text style={styles.bannerButtonText}>{t('enableNotifs')}</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.sectionTitle}>{t('deliveryTimes')}</Text>
      <View style={styles.card}>
        {settings.deliveries.map((delivery, index) => {
          const bounds = COUNT_BOUNDS[delivery.unit];
          return (
            <View key={delivery.time} style={index > 0 && styles.deliveryDivider}>
              <View style={styles.row}>
                <Text style={styles.timeText}>{delivery.time}</Text>
                {settings.deliveries.length > 1 && (
                  <Pressable
                    onPress={() =>
                      apply({
                        ...settings,
                        deliveries: settings.deliveries.filter((d) => d.time !== delivery.time),
                      })
                    }
                  >
                    <Text style={styles.removeText}>{t('remove')}</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.deliveryControls}>
                <View style={styles.unitToggle}>
                  {(['ayah', 'page'] as const).map((unit) => (
                    <Pressable
                      key={unit}
                      style={[styles.segment, delivery.unit === unit && styles.segmentActive]}
                      onPress={() =>
                        delivery.unit !== unit && updateDelivery(delivery.time, { unit })
                      }
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          delivery.unit === unit && styles.segmentTextActive,
                        ]}
                      >
                        {unit === 'ayah' ? t('ayahs') : t('pages')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    style={[
                      styles.stepButton,
                      delivery.count <= bounds.min && styles.stepButtonDisabled,
                    ]}
                    onPress={() =>
                      delivery.count > bounds.min &&
                      updateDelivery(delivery.time, { count: delivery.count - 1 })
                    }
                  >
                    <Text style={styles.stepButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue}>{delivery.count}</Text>
                  <Pressable
                    style={[
                      styles.stepButton,
                      delivery.count >= bounds.max && styles.stepButtonDisabled,
                    ]}
                    onPress={() =>
                      delivery.count < bounds.max &&
                      updateDelivery(delivery.time, { count: delivery.count + 1 })
                    }
                  >
                    <Text style={styles.stepButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}
        <Pressable style={styles.addRow} onPress={() => setShowTimePicker(true)}>
          <Text style={styles.addText}>+ {t('addTime')}</Text>
        </Pressable>
        {showTimePicker && (
          <DateTimePicker
            value={new Date(2000, 0, 1, 9, 0)}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimePicked}
          />
        )}
      </View>

      <Text style={styles.sectionTitle}>{t('reading')}</Text>
      <View style={styles.card}>
        <Pressable
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: '/quran',
              params: { start: String(lastPosition?.id ?? 1) },
            })
          }
        >
          <View>
            <Text style={styles.rowLabel}>{t('continueReading')}</Text>
            <Text style={styles.rowSub}>
              {lastPosition
                ? lastPosition.name
                  ? `${lastPosition.name} ${lastPosition.surah}:${lastPosition.ayah}`
                  : t('ayahN', { n: lastPosition.id })
                : t('startBeginning')}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/bookmarks')}>
          <Text style={styles.rowLabel}>{t('bookmarks')}</Text>
          <View style={styles.rowRight}>
            {bookmarkCount > 0 && <Text style={styles.rowSub}>{bookmarkCount}</Text>}
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
        <Pressable style={styles.row} onPress={() => router.push('/surahs')}>
          <Text style={styles.rowLabel}>{t('surahs')}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      <Pressable style={styles.previewButton} onPress={onPreview}>
        <Text style={styles.previewButtonText}>{t('preview')}</Text>
      </Pressable>
    </ScrollView>
  );
}
