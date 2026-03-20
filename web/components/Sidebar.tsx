"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { get } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  moduleKey?: string;
  adminOnly?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Operations",
    items: [
      { href: "/inbox", label: "Inbox", shortLabel: "IN", moduleKey: "inbox" },
      { href: "/orders", label: "Orders", shortLabel: "OR", moduleKey: "orders" },
      { href: "/broadcast", label: "Broadcast", shortLabel: "BC", moduleKey: "broadcast" },
    ],
  },
  {
    title: "Commerce",
    items: [
      { href: "/products", label: "Products", shortLabel: "PR", moduleKey: "products" },
    ],
  },
  {
    title: "Finance & Reports",
    items: [
      { href: "/incomes", label: "Income", shortLabel: "IC", moduleKey: "incomes" },
      { href: "/expenses", label: "Expenses", shortLabel: "EX", moduleKey: "expenses" },
      { href: "/stats", label: "Reports", shortLabel: "RP", moduleKey: "analytics" },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/setup", label: "Setup", shortLabel: "SU", adminOnly: true },
      { href: "/settings", label: "Settings", shortLabel: "ST", adminOnly: true },
      { href: "/admin/users", label: "Users & Staff", shortLabel: "US", adminOnly: true },
      { href: "/admin/audit", label: "Audit Log", shortLabel: "AL", adminOnly: true },
      { href: "/admin/governance", label: "Governance", shortLabel: "GV", adminOnly: true },
      { href: "/profile", label: "Profile", shortLabel: "PF" },
    ],
  },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null);
  const [companyName, setCompanyName] = useState("Ujani");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const r = await get<{ ok: true; meta: { company_name: string; enabled_modules: string[] } }>(
          "/api/company/meta"
        );

        if (cancelled) return;
        setEnabledModules(Array.isArray(r.meta.enabled_modules) ? r.meta.enabled_modules : null);
        setCompanyName((r.meta.company_name || "Ujani").trim() || "Ujani");
      } catch {
        if (cancelled) return;
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
      if (!enabledModules) return true;
      return enabledModules.includes(key);
    };
  }, [enabledModules]);

  if (!user) return null;

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.adminOnly && user.role !== "admin") return false;
      return moduleEnabled(item.moduleKey);
    }),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <button
        type="button"
        className={"sidebar-overlay" + (open ? " sidebar-overlay--open" : "")}
        onClick={onClose}
        aria-label="Close sidebar"
      />

      <aside className={"sidebar" + (open ? " sidebar--open" : "")}>
        <div className="sidebar-top">
          <Link href="/inbox" className="sidebar-brand" onClick={onClose}>
            <div className="sidebar-brand-mark">UJ</div>
            <div className="sidebar-brand-copy">
              <div className="sidebar-brand-title">{companyName}</div>
              <div className="sidebar-brand-subtitle">Business Operations Console</div>
            </div>
          </Link>

          <div className="sidebar-workspace">
            <div className="sidebar-workspace-label">Workspace</div>
            <div className="sidebar-workspace-value">Single business live environment</div>
          </div>
        </div>

        <div className="sidebar-scroll">
          {visibleSections.map((section) => (
            <section key={section.title} className="sidebar-section">
              <div className="sidebar-section-title">{section.title}</div>
              <nav className="sidebar-nav">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={"sidebar-link" + (active ? " sidebar-link--active" : "")}
                      onClick={onClose}
                    >
                      <span className="sidebar-link-mark" aria-hidden="true">
                        {item.shortLabel}
                      </span>
                      <span className="sidebar-link-copy">
                        <span className="sidebar-link-label">{item.label}</span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </section>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user-card">
            <div className="sidebar-user-title">{user.email}</div>
            <div className="sidebar-user-subtitle">{user.role === "admin" ? "Administrator" : "Operator"}</div>
          </div>
        </div>
      </aside>
    </>
  );
}
