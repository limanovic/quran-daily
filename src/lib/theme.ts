import { useSyncExternalStore } from "react";
import { useColorScheme } from "react-native";

export type ThemePreference = "system" | "light" | "dark";

export type Theme = {
  background: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  gold: string;
  danger: string;
};

export const lightTheme: Theme = {
  background: "#F7F4EE", // warm sand
  surface: "#FDFBF6",
  border: "#E7E1D3",
  text: "#26282E", // ink with cool undertone
  textMuted: "#837E6F",
  accent: "#23417A", // deep indigo
  accentSoft: "#E4E8F1",
  onAccent: "#F4F7FC",
  gold: "#AD8C36", // manuscript gold
  danger: "#A8383F",
};

export const darkTheme: Theme = {
  background: "#0E1220", // midnight
  surface: "#151A2B",
  border: "#262D42",
  text: "#E6E2D5", // sand text keeps warmth on blue
  textMuted: "#8E8B7E",
  accent: "#7C9CD6", // soft indigo for dark surfaces
  accentSoft: "#1A2237",
  onAccent: "#0A0F1C",
  gold: "#D3B563",
  danger: "#D07683",
};

// The preference lives in Settings (AsyncStorage), but components need it
// synchronously on every render — so it's mirrored in this tiny store.
// _layout seeds it at launch; the settings screen updates it on change.
let preference: ThemePreference = "system";
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
  const scheme = pref === "system" ? system : pref;
  return scheme === "dark" ? darkTheme : lightTheme;
}
