"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

type TopbarProps = {
  pageTitle?: string;
  pageSection?: string;
  pageDescription?: string;
  showSidebarToggle?: boolean;
  onToggleSidebar?: () => void;
  isInbox?: boolean;
};

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
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = mode;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

function cycleTheme(current: ThemeMode): ThemeMode {
  if (current === "system") return "light";
  if (current === "light") return "dark";
  return "system";
}

export default function Topbar({
  pageTitle,
  pageSection,
  pageDescription,
  showSidebarToggle,
  onToggleSidebar,
  isInbox,
}: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mode = readThemeMode();
    setThemeMode(mode);
    applyThemeMode(mode);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const node = menuRef.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const initial = useMemo(() => {
    return (user?.email?.trim()?.[0] || "U").toUpperCase();
  }, [user?.email]);

  const themeLabel = useMemo(() => {
    if (themeMode === "system") return "System";
    if (themeMode === "dark") return "Dark";
    return "Light";
  }, [themeMode]);

  const compact = !!isInbox;

  return (
    <header className={"console-topbar" + (compact ? " console-topbar--compact" : "")}>
      <div className="console-topbar-main">
        <div className="console-topbar-left">
          {showSidebarToggle && onToggleSidebar ? (
            <button
              type="button"
              className="console-topbar-toggle"
              onClick={onToggleSidebar}
              aria-label="Toggle navigation"
            >
              <span />
              <span />
              <span />
            </button>
          ) : null}

          <div className="console-topbar-context">
            <div className="console-topbar-kicker">{pageSection || "Workspace"}</div>
            <div className="console-topbar-title-row">
              <h1 className="console-topbar-title">{pageTitle || "Ujani Console"}</h1>
              {user ? <span className="console-topbar-status">Live</span> : null}
            </div>
            {!compact && pageDescription ? (
              <div className="console-topbar-description">{pageDescription}</div>
            ) : null}
          </div>
        </div>

        <div className="console-topbar-actions" ref={menuRef}>
          {!user ? (
            <button type="button" className="console-topbar-login" onClick={() => router.push("/login")}>
              Login
            </button>
          ) : (
            <>
              <button
                type="button"
                className="console-chip-button"
                onClick={() => {
                  const next = cycleTheme(themeMode);
                  setThemeMode(next);
                  applyThemeMode(next);
                }}
                aria-label={`Theme: ${themeLabel}`}
                title={`Theme: ${themeLabel}`}
              >
                Theme: {themeLabel}
              </button>

              <button
                type="button"
                className={"console-user-button" + (menuOpen ? " console-user-button--open" : "")}
                onClick={() => setMenuOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="console-user-avatar">{initial}</span>
                <span className="console-user-meta">
                  <span className="console-user-email">{user.email}</span>
                  <span className="console-user-role">{user.role === "admin" ? "Administrator" : "Operator"}</span>
                </span>
              </button>

              {menuOpen ? (
                <div className="console-user-menu" role="menu" aria-label="User menu">
                  <button
                    type="button"
                    className="console-user-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/profile");
                    }}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    className="console-user-menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/settings");
                    }}
                  >
                    Settings
                  </button>
                  {user.role === "admin" ? (
                    <button
                      type="button"
                      className="console-user-menu-item"
                      onClick={() => {
                        setMenuOpen(false);
                        router.push("/setup");
                      }}
                    >
                      Setup
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="console-user-menu-item console-user-menu-item--danger"
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                  >
                    Logout
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
