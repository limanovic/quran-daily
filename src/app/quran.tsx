import { Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewToken,
  useWindowDimensions,
} from 'react-native';

import { AyahBlock } from '@/components/ayah-block';
import { loadBookmarks, saveLastPosition, toggleBookmark } from '@/lib/bookmarks';
import {
  AyahRow,
  LanguageRow,
  SurahRow,
  TOTAL_AYAHS,
  TOTAL_PAGES,
  TranslationMap,
  getAyahsByIdRange,
  getAyahsByIds,
  getAyahsByPageRange,
  getLanguages,
  getPageStartIds,
  getSurahs,
  getTranslationsByIdRange,
} from '@/lib/db';
import { t } from '@/lib/i18n';
import { Settings, loadSettings } from '@/lib/settings';
import { Theme, useTheme } from '@/lib/theme';

const CHUNK = 40;

type Shared = {
  settings: Settings;
  languages: Map<string, LanguageRow>;
  surahs: Map<number, SurahRow>;
  bookmarkedIds: Set<number>;
  onToggleBookmark: (ayahId: number) => void;
};

/**
 * Reader over the whole Qur'an in two modes: continuous vertical scroll, or
 * mushaf-style horizontal pages (1..604, advancing right-to-left).
 */
export default function QuranScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { start } = useLocalSearchParams<{ start?: string }>();
  const startId = Math.min(TOTAL_AYAHS, Math.max(1, Number(start) || 1));

  const [shared, setShared] = useState<Omit<Shared, 'onToggleBookmark'> | null>(null);
  const [startPage, setStartPage] = useState<number | null>(null);

  const onToggleBookmark = useCallback((ayahId: number) => {
    toggleBookmark(ayahId)
      .then((list) =>
        setShared((prev) =>
          prev ? { ...prev, bookmarkedIds: new Set(list.map((b) => b.ayahId)) } : prev,
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const [settings, languageRows, surahMap, bookmarks, startRows] = await Promise.all([
        loadSettings(),
        getLanguages(),
        getSurahs(),
        loadBookmarks(),
        getAyahsByIds([startId]),
      ]);
      setStartPage(startRows[0]?.page ?? 1);
      setShared({
        settings,
        languages: new Map(languageRows.map((l) => [l.code, l])),
        surahs: surahMap,
        bookmarkedIds: new Set(bookmarks.map((b) => b.ayahId)),
      });
    })().catch(() => {});
  }, [startId]);

  if (!shared || startPage === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('quran') }} />
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const props = { ...shared, onToggleBookmark };
  return shared.settings.readingMode === 'page' ? (
    <PagedReader shared={props} startPage={startPage} />
  ) : (
    <ScrollReader shared={props} startId={startId} />
  );
}

/* ------------------------------ scroll mode ------------------------------ */

function ScrollReader({ shared, startId }: { shared: Shared; startId: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { settings, languages, surahs, bookmarkedIds, onToggleBookmark } = shared;

  const [rows, setRows] = useState<AyahRow[]>([]);
  const [translations, setTranslations] = useState<TranslationMap>({});
  const [title, setTitle] = useState(() => t('quran'));

  const range = useRef<{ min: number; max: number } | null>(null);
  const loading = useRef(false);
  const lastSaved = useRef(0);
  const lastVisibleId = useRef(startId);
  const surahsRef = useRef(surahs);
  surahsRef.current = surahs;

  const loadChunk = useCallback(
    async (from: number, to: number, direction: 'append' | 'prepend') => {
      if (loading.current || from > to) return;
      loading.current = true;
      try {
        const [chunk, chunkTranslations] = await Promise.all([
          getAyahsByIdRange(from, to),
          getTranslationsByIdRange(settings.translations, from, to),
        ]);
        setRows((prev) => (direction === 'append' ? [...prev, ...chunk] : [...chunk, ...prev]));
        setTranslations((prev) => {
          const next = { ...prev };
          for (const [lang, byId] of Object.entries(chunkTranslations)) {
            next[lang] = { ...next[lang], ...byId };
          }
          return next;
        });
        range.current = {
          min: Math.min(range.current?.min ?? from, from),
          max: Math.max(range.current?.max ?? to, to),
        };
      } finally {
        loading.current = false;
      }
    },
    [settings.translations],
  );

  useEffect(() => {
    loadChunk(startId, Math.min(TOTAL_AYAHS, startId + CHUNK - 1), 'append').catch(() => {});
    // Persist the final position when the reader closes.
    return () => {
      saveLastPosition(lastVisibleId.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEndReached = useCallback(() => {
    const r = range.current;
    if (!r || r.max >= TOTAL_AYAHS) return;
    loadChunk(r.max + 1, Math.min(TOTAL_AYAHS, r.max + CHUNK), 'append');
  }, [loadChunk]);

  const onStartReached = useCallback(() => {
    const r = range.current;
    if (!r || r.min <= 1) return;
    loadChunk(Math.max(1, r.min - CHUNK), r.min - 1, 'prepend');
  }, [loadChunk]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<AyahRow>[] }) => {
      const first = viewableItems[0]?.item;
      if (!first) return;
      lastVisibleId.current = first.id;
      setTitle((prev) => {
        const name = surahsRef.current.get(first.surah)?.name_en;
        return name ? `${name} · ${first.surah}:${first.ayah}` : prev;
      });
      // Throttle position writes to one every 2s of scrolling.
      const now = Date.now();
      if (now - lastSaved.current > 2000) {
        lastSaved.current = now;
        saveLastPosition(first.id).catch(() => {});
      }
    },
  );

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('quran') }} />
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(row) => String(row.id)}
        renderItem={({ item, index }) => {
          const prev = rows[index - 1];
          const newSurah = item.ayah === 1 || (!prev && item.id === range.current?.min);
          return (
            <AyahBlock
              row={item}
              surahHeader={newSurah ? surahs.get(item.surah) : undefined}
              settings={settings}
              translations={translations}
              languages={languages}
              bookmarked={bookmarkedIds.has(item.id)}
              onToggleBookmark={onToggleBookmark}
            />
          );
        }}
        onEndReached={onEndReached}
        onEndReachedThreshold={2}
        onStartReached={onStartReached}
        onStartReachedThreshold={2}
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}

/* ------------------------------- page mode ------------------------------- */

const ALL_PAGES = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);

function PagedReader({ shared, startPage }: { shared: Shared; startPage: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState(() => t('pageN', { n: startPage }));

  const pageStarts = useRef<Map<number, number> | null>(null);
  const currentPage = useRef(startPage);

  useEffect(() => {
    getPageStartIds().then((map) => {
      pageStarts.current = map;
    });
    // Persist the final position when the reader closes.
    return () => {
      const startId = pageStarts.current?.get(currentPage.current);
      if (startId) saveLastPosition(startId);
    };
  }, []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<number>[] }) => {
      const page = viewableItems[0]?.item;
      if (!page) return;
      currentPage.current = page;
      setTitle(t('pageOfN', { n: page, total: TOTAL_PAGES }));
      const startId = pageStarts.current?.get(page);
      if (startId) saveLastPosition(startId).catch(() => {});
    },
  );

  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        style={styles.list}
        data={ALL_PAGES}
        keyExtractor={(page) => String(page)}
        horizontal
        pagingEnabled
        // The Qur'an advances right-to-left: the next page slides in from the
        // left, matching a physical mushaf.
        inverted
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={startPage - 1}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        windowSize={5}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        renderItem={({ item }) => <QuranPage page={item} width={width} shared={shared} />}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      />
    </>
  );
}

type PageData = { rows: AyahRow[]; translations: TranslationMap };

const QuranPage = memo(function QuranPage({
  page,
  width,
  shared,
}: {
  page: number;
  width: number;
  shared: Shared;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { settings, languages, surahs, bookmarkedIds, onToggleBookmark } = shared;
  const [data, setData] = useState<PageData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getAyahsByPageRange(page, page);
      const translations =
        rows.length > 0
          ? await getTranslationsByIdRange(
              settings.translations,
              rows[0].id,
              rows[rows.length - 1].id,
            )
          : {};
      if (!cancelled) setData({ rows, translations });
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page, settings.translations]);

  if (!data) {
    return (
      <View style={[styles.pageCenter, { width }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const first = data.rows[0];
  return (
    <View style={{ width }}>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageHeader}>
          {t('pageN', { n: page })}
          {first ? ` · ${t('juz')} ${first.juz}` : ''}
        </Text>
        {data.rows.map((row, i) => {
          const newSurah = row.ayah === 1 || i === 0;
          return (
            <AyahBlock
              key={row.id}
              row={row}
              surahHeader={newSurah ? surahs.get(row.surah) : undefined}
              settings={settings}
              translations={data.translations}
              languages={languages}
              bookmarked={bookmarkedIds.has(row.id)}
              onToggleBookmark={onToggleBookmark}
            />
          );
        })}
      </ScrollView>
    </View>
  );
});

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    list: { flex: 1, backgroundColor: theme.background },
    content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 64 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    pageCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background,
    },
    pageHeader: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.textMuted,
      marginTop: 8,
    },
  });
}
