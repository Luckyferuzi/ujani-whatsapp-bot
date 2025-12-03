"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/orders", label: "Orders" },   // if you already have /orders
  { href: "/products", label: "Products" },
  { href: "/expenses", label: "Expenses" },
  { href: "/incomes", label: "Income" },
  { href: "/stats", label: "📊 Stats" },
];

export default function Topbar() {
  const pathname = usePathname();

  return (
    <div className="h-14 border-b border-ui-border flex items-center px-4 bg-ui-panel">
      <div className="font-semibold tracking-wide text-ui-text">
        Ujani Admin
      </div>
      <nav className="ml-8 flex gap-3 text-sm">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(item.href + "/");
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
    </div>
  );
}
