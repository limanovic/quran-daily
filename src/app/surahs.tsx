import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { SurahRow, getSurahStartIds, getSurahs } from '@/lib/db';
import { useT } from '@/lib/i18n';
import { Theme, useTheme } from '@/lib/theme';

export default function SurahsScreen() {
  const theme = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [surahs, setSurahs] = useState<SurahRow[]>([]);
  const [startIds, setStartIds] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    Promise.all([getSurahs(), getSurahStartIds()])
      .then(([map, starts]) => {
        setSurahs([...map.values()].sort((a, b) => a.number - b.number));
        setStartIds(starts);
      })
      .catch(() => {});
  }, []);

  const open = (surah: SurahRow) => {
    const start = startIds.get(surah.number);
    if (!start) return;
    router.push({ pathname: '/quran', params: { start: String(start) } });
  };

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={surahs}
      keyExtractor={(s) => String(s.number)}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => open(item)}>
          <View style={styles.number}>
            <Text style={styles.numberText}>{item.number}</Text>
          </View>
          <View style={styles.names}>
            <Text style={styles.nameEn}>{item.name_en}</Text>
            <Text style={styles.meta}>
              {item.name_meaning_en} · {t('ayahsCount', { n: item.ayah_count })} ·{' '}
              {item.revelation === 'Meccan' ? t('meccan') : t('medinan')}
            </Text>
          </View>
          <Text style={styles.nameAr}>{item.name_ar}</Text>
        </Pressable>
      )}
    />
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    list: { flex: 1, backgroundColor: theme.background },
    content: { paddingHorizontal: 20, paddingVertical: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    number: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    numberText: { color: theme.accent, fontSize: 13, fontWeight: '700' },
    names: { flex: 1 },
    nameEn: { fontSize: 16, fontWeight: '600', color: theme.text },
    meta: { fontSize: 12.5, color: theme.textMuted, marginTop: 2 },
    nameAr: { fontFamily: 'Amiri', fontSize: 20, color: theme.accent, marginLeft: 12 },
  });
}
