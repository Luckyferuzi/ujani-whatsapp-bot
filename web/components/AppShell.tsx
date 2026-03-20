"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Tobpar";

const PUBLIC_PATHS = ["/login", "/register-admin"];

function getPageMeta(pathname: string | null) {
  const p = pathname || "/";

  if (p.startsWith("/inbox")) {
    return {
      title: "Inbox",
      section: "Operations",
      description: "Live customer conversations, handover, and order context.",
    };
  }
  if (p.startsWith("/orders")) {
    return {
      title: "Orders",
      section: "Operations",
      description: "Track fulfillment, payment progress, and delivery movement.",
    };
  }
  if (p.startsWith("/broadcast")) {
    return {
      title: "Broadcast",
      section: "Operations",
      description: "Send controlled outbound updates to recent WhatsApp customers.",
    };
  }
  if (p.startsWith("/products")) {
    return {
      title: "Products",
      section: "Commerce",
      description: "Manage the active catalog, pricing, stock, and sellable items.",
    };
  }
  if (p.startsWith("/stats")) {
    return {
      title: "Reports",
      section: "Finance & Reports",
      description: "Review business performance, order activity, and delivery trends.",
    };
  }
  if (p.startsWith("/expenses")) {
    return {
      title: "Expenses",
      section: "Finance & Reports",
      description: "Record and review operational spending.",
    };
  }
  if (p.startsWith("/incomes")) {
    return {
      title: "Income",
      section: "Finance & Reports",
      description: "Review approved and pending business income records.",
    };
  }
  if (p.startsWith("/profile")) {
    return {
      title: "Profile",
      section: "System",
      description: "Your account information and operator preferences.",
    };
  }
  if (p.startsWith("/admin/users")) {
    return {
      title: "Users & Staff",
      section: "System",
      description: "Manage console access, roles, and internal operators.",
    };
  }
  if (p.startsWith("/admin/audit")) {
    return {
      title: "Audit Log",
      section: "System",
      description: "Review important internal actions and governance records.",
    };
  }
  if (p.startsWith("/admin/governance")) {
    return {
      title: "Governance",
      section: "System",
      description: "Administrative review and approval workflows.",
    };
  }
  if (p.startsWith("/settings")) {
    return {
      title: "Settings",
      section: "System",
      description: "Operator settings and console configuration.",
    };
  }
  if (p.startsWith("/setup")) {
    return {
      title: "Setup",
      section: "System",
      description: "Business setup, runtime checks, and WhatsApp configuration.",
    };
  }

  return {
    title: "Ujani Console",
    section: "Workspace",
    description: "Business operations workspace for WhatsApp sales and support.",
  };
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isPublic = useMemo(() => {
    const p = pathname || "/";
    return PUBLIC_PATHS.includes(p);
  }, [pathname]);

  const isInbox = useMemo(() => {
    const p = pathname || "/";
    return p.startsWith("/inbox");
  }, [pathname]);

  const pageMeta = useMemo(() => getPageMeta(pathname), [pathname]);

  return (
    <div className={"app-shell" + (isPublic ? " app-shell--public" : "")}>
      {user && (
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      <div className="app-main">
        <Topbar
          pageTitle={pageMeta.title}
          pageSection={pageMeta.section}
          pageDescription={pageMeta.description}
          isInbox={isInbox}
          showSidebarToggle={!!user && !isPublic}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <main
          className={"app-page " + (isInbox ? "app-page--flush" : "")}
          aria-label={pageMeta.title}
        >
          {isInbox || isPublic ? (
            children
          ) : (
            <div className="page-container">
              <div className="page-frame">{children}</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
