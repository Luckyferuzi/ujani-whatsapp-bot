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

export default function Topbar({
  showSidebarToggle,
  onToggleSidebar,
}: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
                className={"console-topbar__user" + (menuOpen ? " console-topbar__user--open" : "")}
                onClick={() => setMenuOpen((value) => !value)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="console-topbar__avatar">{initial}</span>
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
