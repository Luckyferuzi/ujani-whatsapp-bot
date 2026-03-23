export type ThemeMode = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "ujani-theme";

export function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    return "system";
  } catch {
    return "system";
  }
}

export function getSystemThemeMode(): Exclude<ThemeMode, "system"> {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveThemeMode(mode: ThemeMode): Exclude<ThemeMode, "system"> {
  return mode === "system" ? getSystemThemeMode() : mode;
}

export function applyThemeMode(mode: ThemeMode) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.dataset.themeMode = mode;

  if (mode === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = mode;
  }

  root.style.colorScheme = resolveThemeMode(mode);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }
}
