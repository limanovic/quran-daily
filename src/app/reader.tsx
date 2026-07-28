import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AyahBlock } from '@/components/ayah-block';
import { loadBookmarks } from '@/lib/bookmarks';
import {
  AyahRow,
  LanguageRow,
  SurahRow,
  TranslationMap,
  getLanguages,
  getSurahs,
  getTranslationsByIdRange,
} from '@/lib/db';
import { useT } from '@/lib/i18n';
import { formatReference, parsePassageKey, resolvePassage } from '@/lib/passage';
import { Settings, loadSettings } from '@/lib/settings';
import { Theme, useTheme } from '@/lib/theme';

type LoadedPassage = {
  rows: AyahRow[];
  reference: string;
  surahs: Map<number, SurahRow>;
  settings: Settings;
  translations: TranslationMap;
  languages: Map<string, LanguageRow>;
  latestBookmarkId: number | null;
};

export default function ReaderScreen() {
  const theme = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { key: rawKey } = useLocalSearchParams<{ key: string }>();
  const [passage, setPassage] = useState<LoadedPassage | null>(null);
  const [error, setError] = useState(false);

  const key = useMemo(() => (rawKey ? parsePassageKey(rawKey) : null), [rawKey]);

  useEffect(() => {
    if (!key) return;
    (async () => {
      const [rows, surahs, settings, languageRows, bookmarks] = await Promise.all([
        resolvePassage(key),
        getSurahs(),
        loadSettings(),
        getLanguages(),
        loadBookmarks(),
      ]);
      const translations =
        rows.length > 0
          ? await getTranslationsByIdRange(
              settings.translations,
              rows[0].id,
              rows[rows.length - 1].id,
            )
          : {};
      const reference = await formatReference(rows, key);
      const languages = new Map(languageRows.map((l) => [l.code, l]));
      setPassage({
        rows,
        reference,
        surahs,
        settings,
        translations,
        languages,
        latestBookmarkId: bookmarks[0]?.ayahId ?? null,
      });
    })().catch(() => setError(true));
  }, [key]);

  if (!key || error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ? t('loadError') : t('badRef')}</Text>
      </View>
    );
  }
  if (!passage) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const { rows, reference, surahs, settings, translations, languages, latestBookmarkId } = passage;

  const continueFrom = (startId: number) => {
    router.push({ pathname: '/quran', params: { start: String(startId) } });
  };

  return (
    <>
      <Stack.Screen options={{ title: reference }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {rows.map((row, i) => {
          const newSurah = i === 0 || rows[i - 1].surah !== row.surah;
          return (
            <AyahBlock
              key={row.id}
              row={row}
              surahHeader={newSurah ? surahs.get(row.surah) : undefined}
              settings={settings}
              translations={translations}
              languages={languages}
            />
          );
        })}

        {rows.length > 0 && (
          <View style={styles.actions}>
            <Pressable style={styles.primaryButton} onPress={() => continueFrom(rows[0].id)}>
              <Text style={styles.primaryButtonText}>{t('continueAyah')}</Text>
            </Pressable>
            {latestBookmarkId !== null && (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => continueFrom(latestBookmarkId)}
              >
                <Text style={styles.secondaryButtonText}>{t('continueBookmark')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.background },
    content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 64 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    errorText: { color: theme.textMuted, fontSize: 16, textAlign: 'center', padding: 32 },
    actions: { marginTop: 36, gap: 10 },
    primaryButton: {
      backgroundColor: theme.accent,
      borderRadius: 12,
      alignItems: 'center',
      paddingVertical: 15,
    },
    primaryButtonText: { color: theme.onAccent, fontSize: 16, fontWeight: '600' },
    secondaryButton: {
      backgroundColor: theme.accentSoft,
      borderRadius: 12,
      alignItems: 'center',
      paddingVertical: 15,
    },
    secondaryButtonText: { color: theme.accent, fontSize: 16, fontWeight: '600' },
  });
}
