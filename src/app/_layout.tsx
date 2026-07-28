import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
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
    Amiri: require('../../assets/fonts/Amiri-Regular.ttf'),
  });
  const ready = fontsLoaded && prefsReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Tapping a notification opens the Reader with the exact scheduled passage.
  useEffect(() => {
    // Cold start: the app may have been launched by a notification tap.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const key = passageKeyParam(response);
      if (key) router.push({ pathname: '/reader', params: { key } });
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const key = passageKeyParam(response);
      if (key) router.push({ pathname: '/reader', params: { key } });
    });
    return () => sub.remove();
  }, []);

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
    </Stack>
  );
}
