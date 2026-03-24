"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryItems = [
  { href: "/stats", label: "Overview", description: "Performance and trend signals" },
  { href: "/incomes", label: "Income", description: "Revenue ledger and approvals" },
  { href: "/expenses", label: "Expenses", description: "Cost tracking and categories" },
];

export default function AnalyticsSubnav() {
  const pathname = usePathname();

  return (
    <div className="analytics-subnav">
      <nav className="analytics-subnav__tabs" aria-label="Analytics views">
        {primaryItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={"analytics-subnav__tab" + (active ? " analytics-subnav__tab--active" : "")}
              aria-current={active ? "page" : undefined}
            >
              <span className="analytics-subnav__label">{item.label}</span>
              <span className="analytics-subnav__description">{item.description}</span>
            </Link>
          );
        })}
      </nav>

      <Link href="/orders" className="analytics-subnav__utility">
        Order operations
      </Link>
    </div>
  );
}
