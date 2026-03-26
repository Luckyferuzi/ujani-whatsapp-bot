"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { get } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type NavItem = {
  href: string;
  label: string;
  description: string;
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
      {
        href: "/",
        label: "Command Center",
        description: "Priorities and health.",
        shortLabel: "CC",
      },
      {
        href: "/inbox",
        label: "Inbox",
        description: "Live conversations.",
        shortLabel: "IN",
        moduleKey: "inbox",
      },
      {
        href: "/orders",
        label: "Orders",
        description: "Fulfillment queue.",
        shortLabel: "OR",
        moduleKey: "orders",
      },
      {
        href: "/followups",
        label: "Follow-ups",
        description: "Operational outreach queues.",
        shortLabel: "FU",
      },
    ],
  },
  {
    title: "Commerce",
    items: [
      {
        href: "/products",
        label: "Products",
        description: "Catalog and stock.",
        shortLabel: "PR",
        moduleKey: "products",
      },
      {
        href: "/broadcast",
        label: "Broadcasts",
        description: "Outbound campaigns.",
        shortLabel: "BC",
        moduleKey: "broadcast",
      },
    ],
  },
  {
    title: "Insights",
    items: [
      {
        href: "/stats",
        label: "Stats",
        description: "Overview and trends.",
        shortLabel: "ST",
        moduleKey: "analytics",
      },
      {
        href: "/incomes",
        label: "Income",
        description: "Revenue ledger.",
        shortLabel: "IC",
        moduleKey: "incomes",
      },
      {
        href: "/expenses",
        label: "Expenses",
        description: "Cost ledger.",
        shortLabel: "EX",
        moduleKey: "expenses",
      },
    ],
  },
  {
    title: "Admin",
    items: [
      {
        href: "/admin/users",
        label: "Team",
        description: "Staff and roles.",
        shortLabel: "TM",
        adminOnly: true,
      },
      {
        href: "/admin/governance",
        label: "Governance",
        description: "Approvals and controls.",
        shortLabel: "GV",
        adminOnly: true,
      },
      {
        href: "/admin/audit",
        label: "Audit Log",
        description: "Change history.",
        shortLabel: "AU",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Workspace",
    items: [
      {
        href: "/settings",
        label: "Workspace Settings",
        description: "Business configuration.",
        shortLabel: "WS",
        adminOnly: true,
      },
      {
        href: "/setup",
        label: "Setup",
        description: "Launch readiness.",
        shortLabel: "SU",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        href: "/profile",
        label: "My Account",
        description: "Profile and access.",
        shortLabel: "ME",
      },
    ],
  },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
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
        className={"console-sidebar-overlay" + (open ? " console-sidebar-overlay--open" : "")}
        onClick={onClose}
        aria-label="Close sidebar"
      />

      <aside className={"console-sidebar" + (open ? " console-sidebar--open" : "")}>
        <div className="console-sidebar__top">
          <Link href="/" className="console-sidebar__brand" onClick={onClose}>
            <div className="console-sidebar__brand-mark">UJ</div>
            <div className="console-sidebar__brand-copy">
              <div className="console-sidebar__brand-title">{companyName}</div>
              <div className="console-sidebar__brand-subtitle">Commerce operations console</div>
            </div>
          </Link>
        </div>

        <div className="console-sidebar__scroll">
          {visibleSections.map((section) => (
            <section key={section.title} className="console-sidebar__section">
              <div className="console-sidebar__section-title">{section.title}</div>
              <nav className="console-sidebar__nav">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={
                        "console-sidebar__link" + (active ? " console-sidebar__link--active" : "")
                      }
                      onClick={onClose}
                    >
                      <span className="console-sidebar__link-mark" aria-hidden="true">
                        {item.shortLabel}
                      </span>
                      <span className="console-sidebar__link-copy">
                        <span className="console-sidebar__link-label">{item.label}</span>
                        <span className="console-sidebar__link-description">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}
