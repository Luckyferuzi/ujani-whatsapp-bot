"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useCachedQuery } from "@/hooks/useCachedQuery";

type OverviewStats = {
  order_count: number;
  total_revenue: number;
  total_delivery_fees: number;
  total_expenses: number;
  approximate_profit: number;
};

type DailyPoint = {
  date: string;
  total_tzs: number;
};

type DailyResponse = {
  points: DailyPoint[];
};

type ProductStat = {
  sku: string;
  name: string;
  total_qty: number;
  total_revenue: number;
};

type ProductsResponse = { items: ProductStat[] };

type RangeKey = "day" | "week" | "month";

const RANGE_TO_DAYS: Record<RangeKey, number> = {
  day: 1,
  week: 7,
  month: 30,
};

const RANGE_HUMAN: Record<RangeKey, string> = {
  day: "today",
  week: "last 7 days",
  month: "last 30 days",
};

function dateOnly(iso: string) {
  return (iso || "").slice(0, 10);
}

function fmtTzs(v: number) {
  return Math.floor(v || 0).toLocaleString("sw-TZ");
}

function buildSeries(points: DailyPoint[], days: number) {
  const map = new Map<string, number>();
  for (const p of points) map.set(p.date, Number(p.total_tzs ?? 0) || 0);

  const out: { date: string; label: string; income: number }[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ymd = d.toISOString().slice(0, 10);

    const label = d.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "short",
    });

    out.push({
      date: ymd,
      label,
      income: map.get(ymd) ?? 0,
    });
  }

  return out;
}

export default function StatsPage() {
  const [range, setRange] = useState<RangeKey>("week");
  const [productSearch, setProductSearch] = useState("");

  const days = RANGE_TO_DAYS[range];
  const humanRange = RANGE_HUMAN[range];

  const {
    data: mainData,
    error,
    isLoading: loadingMain,
    isRefreshing: refreshingMain,
    refetch: refetchMain,
  } = useCachedQuery(
    `stats:main:${days}`,
    async () => {
      const [overview, daily] = await Promise.all([
        api<OverviewStats>(`/api/stats/overview?days=${days}`),
        api<DailyResponse>(`/api/stats/daily-incomes?days=${days}`),
      ]);
      return { overview, trendRaw: daily.points ?? [] };
    },
    { staleMs: 30_000 }
  );

  const {
    data: productsData,
    isLoading: loadingProducts,
    refetch: refetchProducts,
  } = useCachedQuery("stats:products", () => api<ProductsResponse>("/api/stats/products"), {
    staleMs: 60_000,
  });

  const overview = mainData?.overview ?? null;
  const trendRaw = mainData?.trendRaw ?? [];
  const products = productsData?.items ?? [];

  const earnings = overview?.total_revenue ?? 0;
  const expenses = overview?.total_expenses ?? 0;
  const profit = overview?.approximate_profit ?? earnings - expenses;
  const delivery = overview?.total_delivery_fees ?? 0;
  const orders = overview?.order_count ?? 0;

  const financeSplit = useMemo(() => {
    const p = Math.max(0, profit);
    const e = Math.max(0, expenses);
    const total = p + e;

    return {
      total,
      rows: [
        { name: "Profit", value: p, key: "profit" as const },
        { name: "Expenses", value: e, key: "expenses" as const },
      ],
    };
  }, [profit, expenses]);

  const series = useMemo(() => buildSeries(trendRaw, days), [trendRaw, days]);

  const maxIncome = useMemo(() => {
    if (!series.length) return 0;
    return Math.max(...series.map((p) => p.income));
  }, [series]);

  const periodLabel = useMemo(() => {
    if (!series.length) return "";
    if (days === 1) return series[0]?.label ?? "";
    return `${series[0]?.label ?? ""} - ${series[series.length - 1]?.label ?? ""}`;
  }, [series, days]);

  const insights = useMemo(() => {
    const avgIncome = days > 0 ? earnings / days : 0;
    const avgOrders = days > 0 ? orders / days : 0;
    const margin = earnings > 0 ? (profit / earnings) * 100 : 0;

    let best: { date: string; income: number } | null = null;
    for (const p of series) {
      if (!best || p.income > best.income) best = { date: p.date, income: p.income };
    }

    return {
      avgIncome,
      avgOrders,
      margin,
      bestDay: best,
    };
  }, [days, earnings, orders, profit, series]);

  const productsFiltered = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 12);

    return products
      .filter((p) => [p.sku, p.name].join(" ").toLowerCase().includes(q))
      .slice(0, 12);
  }, [products, productSearch]);

  const axisStroke = "var(--st-axis)";
  const gridStroke = "var(--st-grid)";
  const barFill = "var(--st-accent)";

  return (
    <div className="stats-page">
      <section className="st-insights-hero">
        <div className="st-insights-main">
          <div className="st-insights-kicker">Insights</div>
          <div className="st-insights-title">Performance overview</div>
          <div className="st-insights-copy">
            Review revenue, costs, order throughput, and product movement in one calm reporting workspace built for
            daily operational decisions.
          </div>
        </div>

        <div className="st-insights-actions">
          <Link href="/incomes" className="st-btn">
            Income ledger
          </Link>
          <Link href="/expenses" className="st-btn">
            Expense ledger
          </Link>
          <Link href="/orders" className="st-btn">
            Order operations
          </Link>
          <button
            type="button"
            className="st-btn st-btn-primary"
            onClick={() => {
              void refetchMain();
              void refetchProducts();
            }}
            disabled={loadingMain || refreshingMain}
          >
            {refreshingMain ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <section className="st-toolbar">
        <div className="st-toolbar-main">
          <div className="st-toolbar-copy">
            <div className="st-toolbar-title">Reporting window</div>
            <div className="st-toolbar-subtitle">
              Use a shorter range for sharper signals or broaden the period for calmer trend review.
            </div>
          </div>

          <div className="st-seg" aria-label="Range selector">
            {(
              [
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
              ] as [RangeKey, string][]
            ).map(([key, label]) => {
              const active = range === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRange(key)}
                  className={"st-seg-btn" + (active ? " st-seg-btn--active" : "")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="st-toolbar-meta">
          <span className="st-chip">{periodLabel || humanRange}</span>
          <span className="st-chip">{loadingMain || refreshingMain ? "Updating metrics" : `Period: ${humanRange}`}</span>
          {error ? <span className="st-error">{error.message}</span> : null}
        </div>
      </section>

      <section className="st-kpi-grid">
        <div className="st-kpi st-kpi--accent">
          <div className="st-kpi-top">
            <div className="st-kpi-label">Approved income</div>
          </div>
          <div className={"st-kpi-value" + (loadingMain ? " st-kpi-value--loading" : "")}>
            {loadingMain ? "Loading" : `${fmtTzs(earnings)} TZS`}
          </div>
          <div className="st-kpi-sub">Approved income records within {humanRange}.</div>
        </div>

        <div className="st-kpi">
          <div className="st-kpi-top">
            <div className="st-kpi-label">Expenses</div>
          </div>
          <div className={"st-kpi-value" + (loadingMain ? " st-kpi-value--loading" : "")}>
            {loadingMain ? "Loading" : `${fmtTzs(expenses)} TZS`}
          </div>
          <div className="st-kpi-sub">Recorded business costs for the same reporting window.</div>
        </div>

        <div className="st-kpi">
          <div className="st-kpi-top">
            <div className="st-kpi-label">Approx. profit</div>
          </div>
          <div className={"st-kpi-value" + (loadingMain ? " st-kpi-value--loading" : "")}>
            {loadingMain ? "Loading" : `${fmtTzs(profit)} TZS`}
          </div>
          <div className="st-kpi-sub">Income minus expenses, kept visible as a directional operating signal.</div>
        </div>

        <div className="st-kpi">
          <div className="st-kpi-top">
            <div className="st-kpi-label">Completed orders</div>
          </div>
          <div className={"st-kpi-value" + (loadingMain ? " st-kpi-value--loading" : "")}>
            {loadingMain ? "Loading" : orders}
          </div>
          <div className="st-kpi-sub">Delivered orders during the current reporting period.</div>
        </div>
      </section>

      <div className="st-shell">
        <div className="st-primary-column">
          <div className="st-card">
            <div className="st-card-header">
              <div>
                <div className="st-card-title">Daily approved income</div>
                <div className="st-card-sub">Trendline for approved revenue only, without clutter from unrelated series.</div>
              </div>
              <span className="st-pill st-pill--accent">{humanRange}</span>
            </div>

            <div className="st-card-body">
              {loadingMain ? (
                <div className="st-chart-placeholder">
                  <div className="st-chart-placeholder__bars">
                    <span className="st-chart-bar st-chart-bar--1" />
                    <span className="st-chart-bar st-chart-bar--2" />
                    <span className="st-chart-bar st-chart-bar--3" />
                    <span className="st-chart-bar st-chart-bar--4" />
                    <span className="st-chart-bar st-chart-bar--5" />
                    <span className="st-chart-bar st-chart-bar--6" />
                    <span className="st-chart-bar st-chart-bar--7" />
                  </div>
                </div>
              ) : series.length === 0 ? (
                <div className="st-empty-state">
                  <div className="st-empty-title">No reporting data in this window.</div>
                  <div className="st-muted">Try a wider range to compare a fuller set of approved income activity.</div>
                </div>
              ) : (
                <>
                  <div className="st-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={series} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" />
                        <XAxis dataKey="label" stroke={axisStroke} fontSize={11} tickMargin={8} />
                        <YAxis
                          stroke={axisStroke}
                          fontSize={11}
                          tickFormatter={(v) =>
                            v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : String(v)
                          }
                          domain={[0, maxIncome ? maxIncome * 1.1 : "auto"]}
                        />
                        <Tooltip
                          formatter={(value: number | string) => `${Number(value).toLocaleString("sw-TZ")} TZS`}
                          labelStyle={{ fontSize: 12 }}
                          contentStyle={{
                            borderRadius: 12,
                            borderColor: "rgba(148, 163, 184, 0.35)",
                            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
                            background: "rgba(255,255,255,0.92)",
                          }}
                        />
                        <Bar dataKey="income" fill={barFill} radius={[7, 7, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="st-chart-footer">
                    <div className="st-chart-highlight">
                      <span className="st-chart-highlight-label">Best day</span>
                      <span className="st-chart-highlight-value">
                        {insights.bestDay ? `${dateOnly(insights.bestDay.date)} - ${fmtTzs(insights.bestDay.income)} TZS` : "-"}
                      </span>
                    </div>
                    <div className="st-chart-highlight">
                      <span className="st-chart-highlight-label">Average per day</span>
                      <span className="st-chart-highlight-value">{fmtTzs(insights.avgIncome)} TZS</span>
                    </div>
                  </div>
                </>
              )}

              <div className="st-note">
                Profit remains an operating estimate based on approved income and the same period&apos;s recorded expenses.
              </div>
            </div>
          </div>

          <div className="st-card">
            <div className="st-card-header">
              <div>
                <div className="st-card-title">Top products</div>
                <div className="st-card-sub">Products that are driving delivered and paid order value.</div>
              </div>

              <div className="st-products-header">
                <input
                  className="st-input"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search SKU or name..."
                />
                <span className="st-chip">{loadingProducts ? "Updating products" : `${products.length} total`}</span>
              </div>
            </div>

            <div className="st-card-body">
              {loadingProducts ? (
                <div className="st-table-loading">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="st-table-loading__row">
                      <span className="st-loading-line st-loading-line--sm" />
                      <span className="st-loading-line st-loading-line--lg" />
                      <span className="st-loading-line st-loading-line--sm" />
                    </div>
                  ))}
                </div>
              ) : productsFiltered.length === 0 ? (
                <div className="st-empty-state">
                  <div className="st-empty-title">No products match this search.</div>
                  <div className="st-muted">Try another SKU or product name to reopen the product ranking view.</div>
                </div>
              ) : (
                <div className="st-table-wrap">
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Name</th>
                        <th className="st-td-right">Qty</th>
                        <th className="st-td-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsFiltered.map((p) => (
                        <tr key={p.sku}>
                          <td>{p.sku}</td>
                          <td>{p.name}</td>
                          <td className="st-td-right">{Math.floor(p.total_qty || 0)}</td>
                          <td className="st-td-right">{fmtTzs(p.total_revenue || 0)} TZS</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="st-secondary-column">
          <div className="st-card">
            <div className="st-card-header">
              <div>
                <div className="st-card-title">Operating signals</div>
                <div className="st-card-sub">A smaller summary for quick admin and owner review.</div>
              </div>
              <span className="st-pill">{humanRange}</span>
            </div>

            <div className="st-card-body">
              <div className="st-kv">
                <div className="st-kv-item">
                  <div className="st-kv-label">Avg income / day</div>
                  <div className="st-kv-value">{loadingMain ? "Loading" : `${fmtTzs(insights.avgIncome)} TZS`}</div>
                </div>

                <div className="st-kv-item">
                  <div className="st-kv-label">Avg orders / day</div>
                  <div className="st-kv-value">{loadingMain ? "Loading" : insights.avgOrders.toFixed(1)}</div>
                </div>

                <div className="st-kv-item">
                  <div className="st-kv-label">Profit margin</div>
                  <div className="st-kv-value">
                    {loadingMain ? "Loading" : Number.isFinite(insights.margin) ? `${insights.margin.toFixed(1)}%` : "-"}
                  </div>
                </div>

                <div className="st-kv-item">
                  <div className="st-kv-label">Delivery fees</div>
                  <div className="st-kv-value">{loadingMain ? "Loading" : `${fmtTzs(delivery)} TZS`}</div>
                </div>
              </div>

              <div className="st-note">
                {insights.bestDay ? (
                  <>
                    Strongest revenue day: <b>{dateOnly(insights.bestDay.date)}</b> with{" "}
                    <b>{fmtTzs(insights.bestDay.income)} TZS</b>.
                  </>
                ) : (
                  <>Strongest revenue day: -</>
                )}
              </div>
            </div>
          </div>

          <div className="st-card">
            <div className="st-card-header">
              <div>
                <div className="st-card-title">Finance split</div>
                <div className="st-card-sub">Profit versus expenses in the same reporting window.</div>
              </div>
              <span className="st-pill st-pill--accent">{humanRange}</span>
            </div>

            <div className="st-card-body">
              {loadingMain ? (
                <div className="st-split-loading">
                  <span className="st-loading-ring" />
                  <div className="st-table-loading">
                    <div className="st-table-loading__row">
                      <span className="st-loading-line st-loading-line--md" />
                      <span className="st-loading-line st-loading-line--sm" />
                    </div>
                    <div className="st-table-loading__row">
                      <span className="st-loading-line st-loading-line--md" />
                      <span className="st-loading-line st-loading-line--sm" />
                    </div>
                  </div>
                </div>
              ) : financeSplit.total <= 0 ? (
                <div className="st-empty-state">
                  <div className="st-empty-title">No finance split available.</div>
                  <div className="st-muted">This period does not yet have enough profit and expense activity to chart.</div>
                </div>
              ) : (
                <div className="st-split">
                  <div className="st-split-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={financeSplit.rows}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={78}
                          paddingAngle={2}
                        >
                          <Cell fill="var(--st-split-profit)" />
                          <Cell fill="var(--st-split-expenses)" />
                        </Pie>
                        <Tooltip
                          formatter={(value: number | string, name: string) => [
                            `${Number(value).toLocaleString("sw-TZ")} TZS`,
                            name,
                          ]}
                          contentStyle={{
                            borderRadius: 12,
                            borderColor: "rgba(148, 163, 184, 0.35)",
                            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
                            background: "rgba(255,255,255,0.92)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="st-split-center">
                      <div className="st-split-center-label">Total</div>
                      <div className="st-split-center-value">{fmtTzs(financeSplit.total)} TZS</div>
                    </div>
                  </div>

                  <div className="st-split-legend">
                    <div className="st-split-row">
                      <div className="st-split-left">
                        <span className="st-dot st-dot--profit" />
                        <span className="st-split-name">Profit</span>
                      </div>
                      <div className="st-split-val">
                        {fmtTzs(Math.max(0, profit))} TZS
                        <span className="st-split-pct">
                          {financeSplit.total > 0 ? ` - ${Math.round((Math.max(0, profit) / financeSplit.total) * 100)}%` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="st-split-row">
                      <div className="st-split-left">
                        <span className="st-dot st-dot--expenses" />
                        <span className="st-split-name">Expenses</span>
                      </div>
                      <div className="st-split-val">
                        {fmtTzs(Math.max(0, expenses))} TZS
                        <span className="st-split-pct">
                          {financeSplit.total > 0 ? ` - ${Math.round((Math.max(0, expenses) / financeSplit.total) * 100)}%` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="st-split-foot">
                      Profit is clamped to zero if negative to keep the split calm and readable.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
