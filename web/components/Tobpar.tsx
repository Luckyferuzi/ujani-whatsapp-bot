"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/orders", label: "Orders" },
  { href: "/products", label: "Products" },
  { href: "/broadcast", label: "Broadcast" },
  { href: "/expenses", label: "Expenses" },
  { href: "/incomes", label: "Income" },
  { href: "/stats", label: "Stats" },
];

type TopbarProps = {
  pageTitle?: string;
  showSidebarToggle?: boolean;
  onToggleSidebar?: () => void;
};


type ThemeMode = "light" | "dark";

function IconSun(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMoon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M21 13.2A7.2 7.2 0 0 1 10.8 3a8.7 8.7 0 1 0 10.2 10.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronDown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M7 10l5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUser(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 12a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4.5 20.5a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M12 15.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 12a7.7 7.7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7.9 7.9 0 0 0-1.7-1l-.4-2.7H9.3l-.4 2.7c-.6.3-1.2.6-1.7 1l-2.5-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1c.5.4 1.1.7 1.7 1l.4 2.7h5.4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.95"
      />
    </svg>
  );
}

function IconUsers(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M16 11a3.2 3.2 0 1 0-3.2-3.2A3.2 3.2 0 0 0 16 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M6.8 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12.5 20a6.5 6.5 0 0 1 13 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M2 20a5.2 5.2 0 0 1 8.5-3.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconReceipt(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M7 3h10a2 2 0 0 1 2 2v16l-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8 8h8M8 12h8M8 16h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLogout(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 7V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M14 12H3m0 0 3-3m-3 3 3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  root.setAttribute("data-theme", mode);
  // Helpful if you also use Tailwind's `dark:` classes anywhere
  if (mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  try {
    window.localStorage.setItem("ujani_theme", mode);
    window.localStorage.setItem("theme", mode);
  } catch {
    // ignore
  }
}

function loadTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const stored = (window.localStorage.getItem("ujani_theme") ||
      window.localStorage.getItem("theme")) as ThemeMode | null;

    if (stored === "light" || stored === "dark") return stored;

    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    return prefersDark ? "dark" : "light";
  } catch {
    return "light";
  }
}

export default function Topbar({
  pageTitle,
  showSidebarToggle,
  onToggleSidebar,
}: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");

  const menuRef = useRef<HTMLDivElement | null>(null);

  const roleLabel = useMemo(() => {
    if (!user?.role) return "";
    return user.role === "admin" ? "Admin" : "Staff";
  }, [user?.role]);

  const email = user?.email ?? "";
  const shortEmail = useMemo(() => {
    if (!email) return "";
    // Keep it readable without taking space
    if (email.length <= 24) return email;
    return email.slice(0, 10) + "…" + email.slice(-10);
  }, [email]);

  const initial = useMemo(() => {
    const c = (email?.trim()?.[0] || "U").toUpperCase();
    return c;
  }, [email]);

  // Load theme once
  useEffect(() => {
    const t = loadTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Close menu on outside click + Esc
  useEffect(() => {
    if (!menuOpen) return;

    const onDown = (e: MouseEvent) => {
      const el = menuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setMenuOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return (
    <header className="topbar-root">
      {/* LEFT: Brand + Nav */}
<div className="topbar-left">
{showSidebarToggle && onToggleSidebar && (
  <button
    type="button"
    onClick={onToggleSidebar}
    aria-label="Toggle sidebar"
    className="topbar-sidebtn"
  >
    ☰
  </button>
)}
  <button
    type="button"
    onClick={() => router.push("/inbox")}
    className="topbar-brand"
  >
    <span className="topbar-brand-icon">🌿</span>

    {/* Desktop brand */}
    <span className="text-sm hidden md:inline">Ujani Console</span>
    {pageTitle ? <div className="topbar-pagetitle">{pageTitle}</div> : null}


    {/* Mobile page title (uses AppShell pageTitle prop) */}
    <span className="text-sm md:hidden">{pageTitle || "Ujani"}</span>
  </button>


        {user && (
          <nav className="topbar-nav">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={"topbar-link" + (active ? " topbar-link--active" : "")}
                >
                  {item.label}
                </Link>
              );
            })}
            {user?.role === "admin" && (() => {
  const active = pathname === "/setup" || pathname?.startsWith("/setup/");
  return (
    <Link
      href="/setup"
      className={"topbar-link" + (active ? " topbar-link--active" : "")}
    >
      Setup
    </Link>
  );
})()}

          </nav>
        )}
      </div>

      {/* RIGHT: Theme + Profile */}
      <div className="topbar-right">
        {!user ? (
          <button type="button" className="topbar-login" onClick={() => router.push("/login")}>
            Login
          </button>
        ) : (
          <div className="topbar-userwrap" ref={menuRef}>
            {/* Theme toggle */}
            <button
              type="button"
              className="topbar-iconbtn"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? (
                <IconSun width={18} height={18} />
              ) : (
                <IconMoon width={18} height={18} />
              )}
            </button>

            {/* Profile button */}
            <button
              type="button"
              className={"topbar-userbtn" + (menuOpen ? " topbar-userbtn--open" : "")}
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <span className="topbar-useravatar" aria-hidden="true">
                {initial}
              </span>

              <span className="topbar-usermeta">
                <span className="topbar-useremail">{shortEmail}</span>
                <span className="topbar-userrole">{roleLabel}</span>
              </span>

              <IconChevronDown width={18} height={18} className="topbar-chevron" />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="topbar-menu" role="menu" aria-label="User menu">
                {/* Summary */}
                <div className="topbar-menu-summary">
                  <div className="topbar-menu-avatar" aria-hidden="true">
                    {initial}
                  </div>

                  <div className="topbar-menu-summarymeta">
                    <div className="topbar-menu-email">{email}</div>
                    <div className="topbar-menu-role">{roleLabel}</div>
                  </div>
                </div>

                <div className="topbar-menu-divider" />

                {/* Links */}
                <button
                  type="button"
                  className="topbar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/profile");
                  }}
                >
                  <IconUser width={18} height={18} />
                  <span>Profile</span>
                </button>

                <button
                  type="button"
                  className="topbar-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings");
                  }}
                >
                  <IconSettings width={18} height={18} />
                  <span>Settings</span>
                </button>

                {user.role === "admin" && (
                  <>
                  <button
  type="button"
  className="topbar-menu-item"
  role="menuitem"
  onClick={() => {
    setMenuOpen(false);
    router.push("/setup");
  }}
>
  <IconReceipt width={18} height={18} />
  <span>Setup Wizard</span>
</button>
                    <button
                      type="button"
                      className="topbar-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        router.push("/admin/users");
                      }}
                    >
                      <IconUsers width={18} height={18} />
                      <span>Staff &amp; Users</span>
                    </button>
                  </>
                )}

                <div className="topbar-menu-divider" />

                {/* Logout */}
                <button
                  type="button"
                  className="topbar-menu-item topbar-menu-item--danger"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  <IconLogout width={18} height={18} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
