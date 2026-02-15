"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Topbar from "@/components/Tobpar";
import Sidebar from "@/components/Sidebar";

const PUBLIC_PATHS = ["/login", "/register-admin"];

function getPageTitle(pathname: string | null) {
  const p = pathname || "/";
  if (p.startsWith("/inbox")) return "Inbox";
  if (p.startsWith("/orders")) return "Orders";
  if (p.startsWith("/products")) return "Products";
  if (p.startsWith("/broadcast")) return "Broadcast";
  if (p.startsWith("/stats")) return "Stats";
  if (p.startsWith("/expenses")) return "Expenses";
  if (p.startsWith("/incomes")) return "Income";
  if (p.startsWith("/profile")) return "Profile";
  if (p.startsWith("/admin/users")) return "Users & Staff";
  if (p.startsWith("/settings")) return "Settings";
  if (p.startsWith("/setup")) return "Setup";
  return "Ujani Console";
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

  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);

  return (
    <div className="app-shell">
      {user && (
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      )}

      <div className="app-main">
        <Topbar
          pageTitle={pageTitle}
          showSidebarToggle={!!user && !isPublic}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <main
          className={"app-page " + (isInbox ? "app-page--flush" : "")}
          aria-label={pageTitle}
        >
          {isInbox || isPublic ? children : <div className="page-container">{children}</div>}
        </main>
      </div>
    </div>
  );
}
