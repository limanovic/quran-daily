import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AyahRow, LanguageRow, SurahRow, TranslationMap } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { Settings } from '@/lib/settings';
import { Theme, useTheme } from '@/lib/theme';

type Props = {
  row: AyahRow;
  /** When set, a surah header is rendered above the ayah. */
  surahHeader?: SurahRow;
  settings: Settings;
  translations: TranslationMap;
  languages: Map<string, LanguageRow>;
  bookmarked?: boolean;
  /** When provided, a bookmark toggle appears next to the reference chip. */
  onToggleBookmark?: (ayahId: number) => void;
};

function AyahBlockInner({
  row,
  surahHeader,
  settings,
  translations,
  languages,
  bookmarked,
  onToggleBookmark,
}: Props) {
  const theme = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View>
      {surahHeader && (
        <View style={styles.surahHeader}>
          <Text style={styles.surahArabic}>{surahHeader.name_ar}</Text>
          <Text style={styles.surahName}>
            {surahHeader.name_en} · {surahHeader.name_meaning_en}
          </Text>
          <Text style={styles.surahMeta}>
            {surahHeader.revelation === 'Meccan' ? t('meccan') : t('medinan')} · {t('juz')}{' '}
            {row.juz}
          </Text>
        </View>
      )}
      <View style={styles.ayahBlock}>
        <View style={styles.chipRow}>
          <View style={[styles.refChip, bookmarked && styles.refChipBookmarked]}>
            <Text style={[styles.refChipText, bookmarked && styles.refChipTextBookmarked]}>
              {row.surah}:{row.ayah}
            </Text>
          </View>
          {onToggleBookmark && (
            <Pressable hitSlop={10} onPress={() => onToggleBookmark(row.id)}>
              <Text style={[styles.bookmarkText, bookmarked && styles.bookmarkTextActive]}>
                {bookmarked ? `★ ${t('bookmarked')}` : `☆ ${t('bookmark')}`}
              </Text>
            </Pressable>
          )}
        </View>
        {settings.showArabic && <Text style={styles.arabic}>{row.arabic}</Text>}
        {settings.translations.map((code) => {
          const text = translations[code]?.[row.id];
          if (!text) return null;
          const lang = languages.get(code);
          return (
            <View key={code} style={styles.translation}>
              <Text style={styles.translationLabel}>{lang?.native_name ?? code}</Text>
              <Text style={[styles.translationText, lang?.rtl === 1 && styles.rtlText]}>
                {text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export const AyahBlock = memo(AyahBlockInner);

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    surahHeader: {
      alignItems: 'center',
      marginTop: 24,
      marginBottom: 8,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    surahArabic: {
      fontFamily: 'Amiri',
      fontSize: 30,
      lineHeight: 52,
      color: theme.accent,
    },
    surahName: { fontSize: 15, fontWeight: '600', color: theme.text, marginTop: 2 },
    surahMeta: { fontSize: 13, color: theme.textMuted, marginTop: 3 },
    ayahBlock: { marginTop: 24 },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    refChip: {
      backgroundColor: theme.accentSoft,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    refChipBookmarked: { backgroundColor: theme.accent },
    refChipText: { color: theme.accent, fontSize: 13, fontWeight: '600' },
    refChipTextBookmarked: { color: theme.onAccent },
    bookmarkText: { color: theme.textMuted, fontSize: 13, fontWeight: '500' },
    bookmarkTextActive: { color: theme.accent },
    arabic: {
      fontFamily: 'Amiri',
      fontSize: 28,
      lineHeight: 56,
      color: theme.text,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
    translation: { marginTop: 12 },
    translationLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.textMuted,
      marginBottom: 4,
    },
    translationText: { fontSize: 16, lineHeight: 25, color: theme.text },
    rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  });
}
