import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { loadBookmarks, loadLastPosition } from '@/lib/bookmarks';
import { LanguageRow, getAyahsByIds, getLanguages, getSurahs } from '@/lib/db';
import { applyUiLanguage, useT } from '@/lib/i18n';
import { getPermissionGranted, rebuildSchedule, requestPermission } from '@/lib/notifications';
import { buildPassage } from '@/lib/passage';
import { COUNT_BOUNDS, Delivery, Settings, loadSettings, saveSettings } from '@/lib/settings';
import { Theme, setThemePreference, useTheme } from '@/lib/theme';

type LastPosition = { id: number; name: string | null; surah: number; ayah: number } | null;

export default function SettingsScreen() {
  const theme = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [languages, setLanguages] = useState<LanguageRow[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showUiLanguagePicker, setShowUiLanguagePicker] = useState(false);
  const [lastPosition, setLastPosition] = useState<LastPosition>(null);
  const [bookmarkCount, setBookmarkCount] = useState(0);

  useEffect(() => {
    loadSettings().then(setSettings);
    getPermissionGranted().then(setGranted);
    getLanguages().then(setLanguages);
  }, []);

  // Reading progress and bookmarks change while other screens are open, so
  // refresh them every time this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [lastId, bookmarks] = await Promise.all([loadLastPosition(), loadBookmarks()]);
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
    setThemePreference(next.theme);
    applyUiLanguage(next);
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

  if (!settings) return <View style={styles.screen} />;

  const languageByCode = new Map(languages.map((l) => [l.code, l]));
  const availableLanguages = languages.filter(
    (l) => l.code !== 'ar' && !settings.translations.includes(l.code),
  );
  // Something must stay visible: block removing the last displayed text.
  const canRemoveTranslation = settings.showArabic || settings.translations.length > 1;

  const updateDelivery = (time: string, patch: Partial<Delivery>) => {
    const deliveries = settings.deliveries.map((d) => {
      if (d.time !== time) return d;
      const next = { ...d, ...patch };
      next.count = Math.min(COUNT_BOUNDS[next.unit].max, next.count);
      return next;
    });
    apply({ ...settings, deliveries });
  };

  const addTranslation = (code: string) => {
    setShowLanguagePicker(false);
    if (settings.translations.includes(code)) return;
    apply({ ...settings, translations: [...settings.translations, code] });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('appTitle') }} />
      {granted === false && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('notifOff')}</Text>
          <Pressable style={styles.bannerButton} onPress={onEnableNotifications}>
            <Text style={styles.bannerButtonText}>{t('enableNotifs')}</Text>
          </Pressable>
        </View>
      )}

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

      <Text style={styles.sectionTitle}>{t('appearance')}</Text>
      <View style={styles.card}>
        <View style={styles.segmented}>
          {(['system', 'light', 'dark'] as const).map((pref) => (
            <Pressable
              key={pref}
              style={[styles.segment, settings.theme === pref && styles.segmentActive]}
              onPress={() => settings.theme !== pref && apply({ ...settings, theme: pref })}
            >
              <Text
                style={[styles.segmentText, settings.theme === pref && styles.segmentTextActive]}
              >
                {pref === 'system' ? t('system') : pref === 'light' ? t('light') : t('dark')}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>{t('display')}</Text>
      <View style={styles.card}>
        <View style={styles.segmented}>
          {(['scroll', 'page'] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.segment, settings.readingMode === mode && styles.segmentActive]}
              onPress={() =>
                settings.readingMode !== mode && apply({ ...settings, readingMode: mode })
              }
            >
              <Text
                style={[
                  styles.segmentText,
                  settings.readingMode === mode && styles.segmentTextActive,
                ]}
              >
                {mode === 'scroll' ? t('scroll') : t('pages')}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t('arabic')}</Text>
          <Switch
            value={settings.showArabic}
            // Never allow removing the last displayed text.
            disabled={settings.showArabic && settings.translations.length === 0}
            trackColor={{ true: theme.accent }}
            onValueChange={(value) => apply({ ...settings, showArabic: value })}
          />
        </View>
        {settings.translations.map((code) => {
          const lang = languageByCode.get(code);
          return (
            <View key={code} style={styles.row}>
              <View>
                <Text style={styles.rowLabel}>{lang?.native_name ?? code}</Text>
                {lang && <Text style={styles.rowSub}>{lang.translator}</Text>}
              </View>
              {canRemoveTranslation && (
                <Pressable
                  onPress={() =>
                    apply({
                      ...settings,
                      translations: settings.translations.filter((c) => c !== code),
                    })
                  }
                >
                  <Text style={styles.removeText}>{t('remove')}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {availableLanguages.length > 0 && (
          <Pressable style={styles.addRow} onPress={() => setShowLanguagePicker(true)}>
            <Text style={styles.addText}>+ {t('addLanguage')}</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.sectionTitle}>{t('appLanguage')}</Text>
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => setShowUiLanguagePicker(true)}>
          <Text style={styles.rowLabel}>{t('appLanguage')}</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowSub}>
              {settings.uiLanguage === 'auto'
                ? t('automatic')
                : languageByCode.get(settings.uiLanguage)?.native_name ?? settings.uiLanguage}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>
      </View>

      <Pressable style={styles.previewButton} onPress={onPreview}>
        <Text style={styles.previewButtonText}>{t('preview')}</Text>
      </Pressable>

      <Modal
        visible={showLanguagePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowLanguagePicker(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t('addLanguage')}</Text>
            <ScrollView style={styles.modalList}>
              {availableLanguages.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={styles.modalRow}
                  onPress={() => addTranslation(lang.code)}
                >
                  <Text style={styles.modalRowLabel}>{lang.native_name}</Text>
                  <Text style={styles.modalRowSub}>
                    {lang.name_en} · {lang.translator}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showUiLanguagePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowUiLanguagePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowUiLanguagePicker(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t('appLanguage')}</Text>
            <ScrollView style={styles.modalList}>
              <Pressable
                style={styles.modalRow}
                onPress={() => {
                  setShowUiLanguagePicker(false);
                  apply({ ...settings, uiLanguage: 'auto' });
                }}
              >
                <Text style={styles.modalRowLabel}>{t('automatic')}</Text>
              </Pressable>
              {languages
                .filter((lang) => lang.code !== 'ar')
                .map((lang) => (
                  <Pressable
                    key={lang.code}
                    style={styles.modalRow}
                    onPress={() => {
                      setShowUiLanguagePicker(false);
                      apply({ ...settings, uiLanguage: lang.code });
                    }}
                  >
                    <Text style={styles.modalRowLabel}>{lang.native_name}</Text>
                    <Text style={styles.modalRowSub}>{lang.name_en}</Text>
                  </Pressable>
                ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    content: { padding: 20, paddingBottom: 48 },
    banner: {
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
    },
    bannerText: { color: theme.text, fontSize: 14, lineHeight: 20 },
    bannerButton: {
      alignSelf: 'flex-start',
      backgroundColor: theme.accent,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginTop: 12,
    },
    bannerButtonText: { color: theme.onAccent, fontWeight: '600', fontSize: 14 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.textMuted,
      marginBottom: 8,
      marginTop: 16,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 16,
      paddingVertical: 6,
      marginBottom: 8,
    },
    segmented: {
      flexDirection: 'row',
      backgroundColor: theme.background,
      borderRadius: 10,
      padding: 3,
      marginVertical: 10,
    },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
    segmentActive: { backgroundColor: theme.accent },
    segmentText: { fontSize: 15, fontWeight: '500', color: theme.textMuted },
    segmentTextActive: { color: theme.onAccent, fontWeight: '600' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    rowLabel: { fontSize: 16, color: theme.text },
    rowSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    chevron: { fontSize: 22, color: theme.textMuted, lineHeight: 24 },
    deliveryDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
      marginTop: 4,
      paddingTop: 4,
    },
    deliveryControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingBottom: 12,
    },
    unitToggle: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: theme.background,
      borderRadius: 10,
      padding: 3,
    },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    stepButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepButtonDisabled: { opacity: 0.35 },
    stepButtonText: { fontSize: 20, color: theme.accent, fontWeight: '600', lineHeight: 24 },
    stepValue: { fontSize: 17, fontWeight: '600', color: theme.text, minWidth: 24, textAlign: 'center' },
    timeText: { fontSize: 18, fontWeight: '600', color: theme.text, fontVariant: ['tabular-nums'] },
    removeText: { color: theme.danger, fontSize: 14, fontWeight: '500' },
    addRow: { paddingVertical: 12 },
    addText: { color: theme.accent, fontSize: 16, fontWeight: '600' },
    previewButton: {
      backgroundColor: theme.accent,
      borderRadius: 12,
      alignItems: 'center',
      paddingVertical: 15,
      marginTop: 28,
    },
    previewButtonText: { color: theme.onAccent, fontSize: 16, fontWeight: '600' },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    modalSheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingTop: 18,
      paddingHorizontal: 20,
      paddingBottom: 32,
      maxHeight: '70%',
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: theme.text, marginBottom: 6 },
    modalList: { flexGrow: 0 },
    modalRow: {
      paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    modalRowLabel: { fontSize: 16, fontWeight: '600', color: theme.text },
    modalRowSub: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  });
}
