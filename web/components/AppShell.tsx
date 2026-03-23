"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Tobpar";
import PageHeader from "@/components/PageHeader";

function getPageMeta(pathname: string | null) {
  const p = pathname || "/";

  if (p.startsWith("/inbox")) {
    return {
      title: "Inbox",
      section: "Operations",
      description: "Live customer conversations, handover, and order context.",
      immersive: true,
    };
  }
  if (p.startsWith("/orders")) {
    return {
      title: "Orders",
      section: "Operations",
      description: "Track fulfillment, payment progress, and delivery movement.",
      immersive: false,
    };
  }
  if (p.startsWith("/broadcast")) {
    return {
      title: "Broadcast",
      section: "Operations",
      description: "Send controlled outbound updates to recent WhatsApp customers.",
      immersive: false,
    };
  }
  if (p.startsWith("/products")) {
    return {
      title: "Products",
      section: "Commerce",
      description: "Manage the active catalog, pricing, stock, and sellable items.",
      immersive: false,
    };
  }
  if (p.startsWith("/stats")) {
    return {
      title: "Reports",
      section: "Finance & Reports",
      description: "Review business performance, order activity, and delivery trends.",
      immersive: false,
    };
  }
  if (p.startsWith("/expenses")) {
    return {
      title: "Expenses",
      section: "Finance & Reports",
      description: "Record and review operational spending.",
      immersive: false,
    };
  }
  if (p.startsWith("/incomes")) {
    return {
      title: "Income",
      section: "Finance & Reports",
      description: "Review approved and pending business income records.",
      immersive: false,
    };
  }
  if (p.startsWith("/profile")) {
    return {
      title: "Profile",
      section: "System",
      description: "Your account information and operator preferences.",
      immersive: false,
    };
  }
  if (p.startsWith("/admin/users")) {
    return {
      title: "Users & Staff",
      section: "System",
      description: "Manage console access, roles, and internal operators.",
      immersive: false,
    };
  }
  if (p.startsWith("/admin/audit")) {
    return {
      title: "Audit Log",
      section: "System",
      description: "Review important internal actions and governance records.",
      immersive: false,
    };
  }
  if (p.startsWith("/admin/governance")) {
    return {
      title: "Governance",
      section: "System",
      description: "Administrative review and approval workflows.",
      immersive: false,
    };
  }
  if (p.startsWith("/settings")) {
    return {
      title: "Settings",
      section: "System",
      description: "Operator settings and console configuration.",
      immersive: false,
    };
  }
  if (p.startsWith("/setup")) {
    return {
      title: "Setup",
      section: "System",
      description: "Business setup, runtime checks, and WhatsApp configuration.",
      immersive: false,
    };
  }

  return {
    title: "Ujani Console",
    section: "Workspace",
    description: "Business operations workspace for WhatsApp sales and support.",
    immersive: false,
  };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pageMeta = useMemo(() => getPageMeta(pathname), [pathname]);

  return (
    <div className="console-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="console-shell__main">
        <Topbar
          pageTitle={pageMeta.title}
          pageSection={pageMeta.section}
          pageDescription={pageMeta.description}
          isInbox={pageMeta.immersive}
          showSidebarToggle
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <main className="console-shell__content" aria-label={pageMeta.title}>
          {pageMeta.immersive ? (
            <div className="console-page console-page--immersive">{children}</div>
          ) : (
            <div className="console-page">
              <div className="console-page__container">
                <PageHeader
                  section={pageMeta.section}
                  title={pageMeta.title}
                  description={pageMeta.description}
                />
                <div className="console-page__frame">{children}</div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
