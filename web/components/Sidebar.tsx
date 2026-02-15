"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { useEffect, useMemo, useState } from "react";
import { get } from "@/lib/api";

type NavItem = {
  href: string;
  label: string;
  icon?: string;
  adminOnly?: boolean;
  /** Which module gate controls visibility (from company_settings.enabled_modules). */
  moduleKey?: string;
};

const NAV_MAIN: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: "💬", moduleKey: "inbox" },
  { href: "/orders", label: "Orders", icon: "🧾", moduleKey: "orders" },
  { href: "/products", label: "Products", icon: "🛍️", moduleKey: "products" },
  { href: "/broadcast", label: "Broadcast", icon: "📣", moduleKey: "broadcast" },
  { href: "/stats", label: "Analytics", icon: "📊", moduleKey: "analytics" },
];

const NAV_OPERATIONS: NavItem[] = [
  { href: "/incomes", label: "Income", icon: "➕", moduleKey: "incomes" },
  { href: "/expenses", label: "Expenses", icon: "➖", moduleKey: "expenses" },
];

const NAV_ADMIN: NavItem[] = [
  { href: "/setup", label: "Setup Wizard", icon: "🧭", adminOnly: true },
  { href: "/admin/users", label: "Users & Staff", icon: "👥", adminOnly: true },
  { href: "/settings", label: "Settings", icon: "⚙️", adminOnly: true },
  { href: "/admin/audit", label: "Audit Log", icon: "🧾", adminOnly: true },
  { href: "/admin/governance", label: "Governance", icon: "🧰", adminOnly: true },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const [enabledModules, setEnabledModules] = useState<string[] | null>(null);
  const [companyName, setCompanyName] = useState<string>("Ujani");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const r = await get<{ ok: true; meta: { company_name: string; enabled_modules: string[] } }>("/api/company/meta")

        if (cancelled) return;
        setEnabledModules(Array.isArray(r.meta.enabled_modules) ? r.meta.enabled_modules : null);
        setCompanyName((r.meta.company_name || "Ujani").trim() || "Ujani");
      } catch {
        if (cancelled) return;
        // If settings fail to load, keep default nav visible.
        setEnabledModules(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const moduleEnabled = useMemo(() => {
    return (key?: string) => {
      if (!key) return true;
      if (!enabledModules) return true; // no settings loaded => show everything
      return enabledModules.includes(key);
    };
  }, [enabledModules]);

  if (!user) return null;

  const itemsMain = NAV_MAIN.filter((it) => moduleEnabled(it.moduleKey));
  const itemsOps = NAV_OPERATIONS.filter((it) => moduleEnabled(it.moduleKey));
  const itemsAdmin = NAV_ADMIN.filter((it) => (it.adminOnly ? user.role === "admin" : true));

  return (
    <>
      <div className={"sidebar-overlay " + (open ? "sidebar-overlay--open" : "")} onClick={onClose} aria-hidden={!open} />

      <aside className={"sidebar " + (open ? "sidebar--open" : "")}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">🌿</div>
            <div className="sidebar-brand-text">
              <div className="sidebar-brand-title">{companyName}</div>
              <div className="sidebar-brand-subtitle">WhatsApp Console</div>
            </div>
          </div>
        </div>

        <div className="sidebar-scroll">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Workspace</div>
            <div className="sidebar-workspace-placeholder">
              <div className="sidebar-workspace-dot" />
              <div className="sidebar-workspace-text">Default</div>
              <div className="sidebar-workspace-hint">(per number soon)</div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-title">Core</div>
            <nav className="sidebar-nav">
              {itemsMain.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={"sidebar-link " + (active ? "sidebar-link--active" : "")}
                    onClick={onClose}
                  >
                    <span className="sidebar-link-icon">{item.icon ?? "•"}</span>
                    <span className="sidebar-link-label">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-title">Operations</div>
            <nav className="sidebar-nav">
              {itemsOps.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={"sidebar-link " + (active ? "sidebar-link--active" : "")}
                    onClick={onClose}
                  >
                    <span className="sidebar-link-icon">{item.icon ?? "•"}</span>
                    <span className="sidebar-link-label">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {itemsAdmin.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Admin</div>
              <nav className="sidebar-nav">
                {itemsAdmin.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={"sidebar-link " + (active ? "sidebar-link--active" : "")}
                      onClick={onClose}
                    >
                      <span className="sidebar-link-icon">{item.icon ?? "•"}</span>
                      <span className="sidebar-link-label">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}

          <div className="sidebar-footer">
            <div className="sidebar-footer-user">
              <div className="sidebar-footer-email">{user.email}</div>
              <div className="sidebar-footer-role">{user.role}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
