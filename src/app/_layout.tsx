import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { applyUiLanguage, useT } from '@/lib/i18n';
import { configureNotificationHandling, topUpSchedule } from '@/lib/notifications';
import { PassageKey } from '@/lib/passage';
import { loadSettings } from '@/lib/settings';
import { setThemePreference, useTheme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

configureNotificationHandling();

function passageKeyParam(response: Notifications.NotificationResponse): string | null {
  const key = response.notification.request.content.data?.passageKey as PassageKey | undefined;
  return key ? JSON.stringify(key) : null;
}

export default function RootLayout() {
  const theme = useTheme();
  const t = useT();
  const [prefsReady, setPrefsReady] = useState(false);
  const [fontsLoaded] = useFonts({
    // The Madani mushaf typeface, paired with the Uthmani text in the database:
    // wasla, dagger alef and waqf marks are drawn as they are in print, and
    // U+06DD renders as the ornate ayah roundel.
    UthmanicHafs: require('../../assets/fonts/UthmanicHafs.otf'),
  });
  const ready = fontsLoaded && prefsReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Tapping a notification opens the Reader with the exact scheduled passage.
  // The tap is only *recorded* here: navigating before the Stack below has
  // mounted throws, and from inside the response listener that throw is a fatal
  // JS error — the "app closed" a tap produced whenever the notification
  // arrived before fonts and preferences had finished loading.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const handledResponse = useRef<string | null>(null);

  useEffect(() => {
    // The cold-start response is also replayed to the listener, so both paths
    // can report the same tap — take it once.
    const record = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handledResponse.current === id) return;
      handledResponse.current = id;
      const key = passageKeyParam(response);
      if (key) setPendingKey(key);
    };
    // Cold start: the app may have been launched by a notification tap.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) record(response);
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(record);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready || !pendingKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // `ready` means this component is rendering the Stack, not that the
    // navigator underneath it has finished mounting — the container becomes
    // navigable an effect later. Retry rather than assume.
    const go = () => {
      if (cancelled) return;
      try {
        router.push({ pathname: '/reader', params: { key: pendingKey } });
        setPendingKey(null);
      } catch {
        timer = setTimeout(go, 50);
      }
    };
    go();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ready, pendingKey]);

  // The OS module remembers the last response until it is cleared, so without
  // this every later cold start would reopen the Reader on a stale passage.
  useEffect(() => {
    if (pendingKey !== null || handledResponse.current === null) return;
    Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
  }, [pendingKey]);

  // Apply the saved theme and language preferences before the first frame is
  // shown — navigator headers keep the title they mount with, so the language
  // must be resolved before the Stack renders at all.
  useEffect(() => {
    loadSettings()
      .then((s) => {
        setThemePreference(s.theme);
        applyUiLanguage(s);
      })
      .catch(() => {})
      .finally(() => setPrefsReady(true));
  }, []);

  useEffect(() => {
    const topUp = () => loadSettings().then(topUpSchedule).catch(() => {});
    topUp();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') topUp();
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;

  return (
    <>
      {/* Without this the clock and icons stay light whatever the theme, which
          on the sand background is near-invisible. */}
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.background },
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen name="index" options={{ title: t('appTitle') }} />
        <Stack.Screen name="reader" options={{ title: '' }} />
        <Stack.Screen name="quran" options={{ title: t('quran') }} />
        <Stack.Screen name="surahs" options={{ title: t('surahs') }} />
        <Stack.Screen name="bookmarks" options={{ title: t('bookmarks') }} />
        <Stack.Screen name="settings" options={{ title: t('settings') }} />
      </Stack>
    </>
  );
}
