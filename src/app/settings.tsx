import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { LanguageRow, getLanguages } from '@/lib/db';
import { applyUiLanguage, useT } from '@/lib/i18n';
import { rebuildSchedule } from '@/lib/notifications';
import { Settings, loadSettings, saveSettings } from '@/lib/settings';
import { setThemePreference, useTheme } from '@/lib/theme';
import { makeListStyles } from '@/lib/ui-styles';

export default function SettingsScreen() {
  const theme = useTheme();
  const t = useT();
  const styles = useMemo(() => makeListStyles(theme), [theme]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [languages, setLanguages] = useState<LanguageRow[]>([]);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showUiLanguagePicker, setShowUiLanguagePicker] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings);
    getLanguages().then(setLanguages);
  }, []);

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

  if (!settings) return <View style={styles.screen} />;

  const languageByCode = new Map(languages.map((l) => [l.code, l]));
  const availableLanguages = languages.filter(
    (l) => l.code !== 'ar' && !settings.translations.includes(l.code),
  );
  // Something must stay visible: block removing the last displayed text.
  const canRemoveTranslation = settings.showArabic || settings.translations.length > 1;

  const addTranslation = (code: string) => {
    setShowLanguagePicker(false);
    if (settings.translations.includes(code)) return;
    apply({ ...settings, translations: [...settings.translations, code] });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('settings') }} />

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
