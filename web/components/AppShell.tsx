"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Tobpar";
import PageHeader from "@/components/PageHeader";

function getPageMeta(pathname: string | null) {
  const p = pathname || "/";

  if (p === "/") {
    return {
      title: "Command Center",
      section: "Operations",
      description: "What matters now across conversations, fulfillment, payments, and operational health.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/inbox")) {
    return {
      title: "Inbox",
      section: "Operations",
      description: "Live customer conversations, handover, and order context.",
      immersive: true,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/orders")) {
    return {
      title: "Orders",
      section: "Operations",
      description: "Track fulfillment, payment progress, and delivery movement.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/followups")) {
    return {
      title: "Follow-ups",
      section: "Operations",
      description: "Operational queues for payment reminders, order action, and restock outreach.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/broadcast")) {
    return {
      title: "Broadcasts",
      section: "Commerce",
      description: "Segmented template outreach for selected WhatsApp audiences.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/products")) {
    return {
      title: "Products",
      section: "Commerce",
      description: "Manage products, pricing, stock posture, and catalog readiness.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/stats")) {
    return {
      title: "Stats",
      section: "Insights",
      description: "Performance metrics, order activity, and business insight signals.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/expenses")) {
    return {
      title: "Expenses",
      section: "Insights",
      description: "Operational spending and cost visibility.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/incomes")) {
    return {
      title: "Income",
      section: "Insights",
      description: "Approved and pending business income records.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/profile")) {
    return {
      title: "My Account",
      section: "Account",
      description: "Your identity, password, and operator preferences.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/admin/users")) {
    return {
      title: "Team",
      section: "Admin",
      description: "Manage console access, roles, and internal operators.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/admin/audit")) {
    return {
      title: "Audit Log",
      section: "Admin",
      description: "Review important internal actions and governance records.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/admin/governance")) {
    return {
      title: "Governance",
      section: "Admin",
      description: "Administrative review, approvals, and policy controls.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/settings")) {
    return {
      title: "Workspace Settings",
      section: "Workspace",
      description: "Business profile, customer-facing menus, and system configuration.",
      immersive: false,
      showPageHeader: false,
    };
  }
  if (p.startsWith("/setup")) {
    return {
      title: "Setup",
      section: "Workspace",
      description: "Business setup, runtime checks, and WhatsApp configuration.",
      immersive: false,
      showPageHeader: false,
    };
  }

  return {
    title: "Ujani Console",
    section: "Workspace",
    description: "Business operations workspace for WhatsApp sales and support.",
    immersive: false,
    showPageHeader: true,
  };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const pageMeta = useMemo(() => getPageMeta(pathname), [pathname]);

  useEffect(() => {
    try {
      setDesktopSidebarCollapsed(window.localStorage.getItem("ujani-shell-sidebar-collapsed") === "1");
    } catch {
      // ignore storage failures
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "ujani-shell-sidebar-collapsed",
        desktopSidebarCollapsed ? "1" : "0"
      );
    } catch {
      // ignore storage failures
    }
  }, [desktopSidebarCollapsed]);

  return (
    <div
      className={
        "console-shell" + (desktopSidebarCollapsed ? " console-shell--sidebar-collapsed" : "")
      }
    >
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={desktopSidebarCollapsed}
        onToggleCollapsed={() => setDesktopSidebarCollapsed((value) => !value)}
      />

      <div className="console-shell__main">
        {pageMeta.immersive ? null : (
          <Topbar
            pageTitle={pageMeta.title}
            pageSection={pageMeta.section}
            pageDescription={pageMeta.description}
            isInbox={pageMeta.immersive}
            showSidebarToggle
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
          />
        )}

        <main
          className={
            "console-shell__content" +
            (pageMeta.immersive ? " console-shell__content--immersive" : "")
          }
          aria-label={pageMeta.title}
        >
          {pageMeta.immersive ? (
            <div className="console-page console-page--immersive">{children}</div>
          ) : (
            <div className="console-page">
              <div className="console-page__container">
                {pageMeta.showPageHeader ? (
                  <PageHeader
                    section={pageMeta.section}
                    title={pageMeta.title}
                    description={pageMeta.description}
                    compact
                  />
                ) : null}
                <div className="console-page__frame">{children}</div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
