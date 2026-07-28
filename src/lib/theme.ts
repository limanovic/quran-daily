import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

export type Theme = {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  danger: string;
};

export const lightTheme: Theme = {
  background: '#F8F4EC', // warm cream, mushaf paper
  surface: '#FFFDF8',
  border: '#E8E0D0',
  text: '#2C2A24', // warm ink
  textMuted: '#8A8172',
  accent: '#176B4D', // deep emerald
  accentSoft: '#E4EEE5',
  onAccent: '#F5FBF6',
  danger: '#A8383F',
};

export const darkTheme: Theme = {
  background: '#15130F', // warm near-black
  surface: '#1E1B15',
  border: '#2E2A21',
  text: '#EAE4D6',
  textMuted: '#9A9180',
  accent: '#57A87F', // muted emerald for dark surfaces
  accentSoft: '#1F2B23',
  onAccent: '#0E1811',
  danger: '#D07683',
};

// The preference lives in Settings (AsyncStorage), but components need it
// synchronously on every render — so it's mirrored in this tiny store.
// _layout seeds it at launch; the settings screen updates it on change.
let preference: ThemePreference = 'system';
const listeners = new Set<() => void>();

export function setThemePreference(next: ThemePreference): void {
  if (next === preference) return;
  preference = next;
  listeners.forEach((l) => l());
}

function getPreference(): ThemePreference {
  return preference;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  const system = useColorScheme();
  const pref = useSyncExternalStore(subscribe, getPreference);
  const scheme = pref === 'system' ? system : pref;
  return scheme === 'dark' ? darkTheme : lightTheme;
}
