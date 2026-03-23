"use client";

import { useEffect } from "react";
import { applyThemeMode, readStoredThemeMode } from "@/lib/theme";

export default function ThemeHydrator() {
  useEffect(() => {
    const syncTheme = () => {
      applyThemeMode(readStoredThemeMode());
    };

    syncTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (readStoredThemeMode() === "system") {
        syncTheme();
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "ujani-theme") {
        syncTheme();
      }
    };

    media.addEventListener("change", handleMediaChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      media.removeEventListener("change", handleMediaChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
