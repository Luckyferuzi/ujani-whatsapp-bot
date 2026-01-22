"use client";

import { useEffect } from "react";

type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "ujani-theme";

function readThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    return "system";
  } catch {
    return "system";
  }
}

function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;

  if (mode === "system") {
    delete root.dataset.theme;
    return;
  }

  root.dataset.theme = mode;
}

export default function ThemeHydrator() {
  useEffect(() => {
    const mode = readThemeMode();
    applyThemeMode(mode);
  }, []);

  return null;
}
