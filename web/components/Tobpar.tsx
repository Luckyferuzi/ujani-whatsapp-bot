"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/orders", label: "Orders" },
  { href: "/products", label: "Products" },
  { href: "/expenses", label: "Expenses" },
  { href: "/incomes", label: "Income" },
  { href: "/stats", label: "📊 Stats" },
];

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const initial =
    user?.email?.charAt(0)?.toUpperCase() ?? "U";
  const roleLabel =
    user?.role === "admin"
      ? "Admin"
      : user?.role === "staff"
      ? "Staff"
      : "";

  return (
    <header className="h-14 border-b border-ui-border bg-ui-panel topbar-root">
      {/* LEFT SIDE: logo + nav */}
      <div className="topbar-left">
        <button
          type="button"
          onClick={() => router.push("/inbox")}
          className="topbar-brand"
        >
          <span className="topbar-brand-icon">🌿</span>
          <span className="text-sm">Ujani Console</span>
        </button>

        {user && (
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active =
                pathname === item.href ||
                pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "topbar-link" +
                    (active ? " topbar-link--active" : "")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* RIGHT SIDE: profile / login */}
      <div className="topbar-right">
        {!user ? (
          <button
            type="button"
            className="btn btn-xs btn-primary"
            onClick={() => router.push("/login")}
          >
            Login
          </button>
        ) : (
          <div className="topbar-avatar-wrapper">
            {roleLabel && (
              <span className="topbar-role-badge">{roleLabel}</span>
            )}
            <button
              type="button"
              className="topbar-avatar-button"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {initial}
            </button>

            {menuOpen && (
              <div className="topbar-profile-menu">
                <div className="topbar-profile-menu-header">
                  <div className="topbar-profile-email">
                    {user.email}
                  </div>
                  <div className="topbar-profile-role">
                    {roleLabel || "User"}
                  </div>
                </div>

                <button
                  type="button"
                  className="topbar-profile-menu-btn"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/profile");
                  }}
                >
                  My profile
                </button>

                {user.role === "admin" && (
                  <button
                    type="button"
                    className="topbar-profile-menu-btn"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/admin/users");
                    }}
                  >
                    Manage staff &amp; users
                  </button>
                )}

                <button
                  type="button"
                  className="topbar-profile-menu-btn topbar-profile-menu-btn--danger"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
