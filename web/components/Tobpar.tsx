"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { applyThemeMode, readStoredThemeMode, type ThemeMode } from "@/lib/theme";

type TopbarProps = {
  pageTitle?: string;
  pageSection?: string;
  pageDescription?: string;
  showSidebarToggle?: boolean;
  onToggleSidebar?: () => void;
  isInbox?: boolean;
};

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
    const mode = readStoredThemeMode();
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

  return (
    <header className="console-topbar">
      <div className="console-topbar__main">
        <div className="console-topbar__left">
          {showSidebarToggle && onToggleSidebar ? (
            <button
              type="button"
              className="console-topbar__toggle"
              onClick={onToggleSidebar}
              aria-label="Toggle navigation"
            >
              <span />
              <span />
              <span />
            </button>
          ) : null}

          <div className="console-topbar__context">
            <div className="console-topbar__eyebrow">{pageSection || "Workspace"}</div>
            <div className="console-topbar__title-row">
              <div className="console-topbar__title">{pageTitle || "Ujani Console"}</div>
            </div>
          </div>
        </div>

        <div className="console-topbar__actions" ref={menuRef}>
          {!user ? (
            <button type="button" className="console-topbar__login" onClick={() => router.push("/login")}>
              Login
            </button>
          ) : (
            <>
              <button
                type="button"
                className="console-topbar__theme"
                onClick={() => {
                  const next = cycleTheme(themeMode);
                  setThemeMode(next);
                  applyThemeMode(next);
                }}
                aria-label={`Theme: ${themeLabel}`}
                title={`Theme: ${themeLabel}`}
              >
                {themeLabel}
              </button>

              <button
                type="button"
                className={"console-topbar__user" + (menuOpen ? " console-topbar__user--open" : "")}
                onClick={() => setMenuOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="console-topbar__avatar">{initial}</span>
                <span className="console-topbar__user-meta">
                  <span className="console-topbar__user-email">{user.email}</span>
                  <span className="console-topbar__user-role">
                    {user.role === "admin" ? "Administrator" : "Operator"}
                  </span>
                </span>
              </button>

              {menuOpen ? (
                <div className="console-topbar__menu" role="menu" aria-label="User menu">
                  <button
                    type="button"
                    className="console-topbar__menu-item"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/profile");
                    }}
                  >
                    My Account
                  </button>
                  {user.role === "admin" ? (
                    <>
                      <button
                        type="button"
                        className="console-topbar__menu-item"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/settings");
                        }}
                      >
                        Workspace Settings
                      </button>
                      <button
                        type="button"
                        className="console-topbar__menu-item"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/setup");
                        }}
                      >
                        Setup
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="console-topbar__menu-item console-topbar__menu-item--danger"
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
