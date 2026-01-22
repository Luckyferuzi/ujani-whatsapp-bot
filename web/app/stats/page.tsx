"use client";

import { useEffect, useMemo, useState } from "react";
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

type OverviewStats = {
  order_count: number;
  total_revenue: number;
  total_delivery_fees: number;
  total_expenses: number;
  approximate_profit: number;
};

type DailyPoint = {
  date: string; // YYYY-MM-DD
  total_tzs: number; // approved incomes sum
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
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [trendRaw, setTrendRaw] = useState<DailyPoint[]>([]);
  const [products, setProducts] = useState<ProductStat[]>([]);

  const [range, setRange] = useState<RangeKey>("week");
  const [productSearch, setProductSearch] = useState("");

  const [loadingMain, setLoadingMain] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = RANGE_TO_DAYS[range];
  const humanRange = RANGE_HUMAN[range];

  async function loadMain() {
    setLoadingMain(true);
    setError(null);
    try {
      const [ov, daily] = await Promise.all([
        api<OverviewStats>(`/api/stats/overview?days=${days}`),
        api<DailyResponse>(`/api/stats/daily-incomes?days=${days}`),
      ]);
      setOverview(ov);
      setTrendRaw(daily.points ?? []);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to load stats");
    } finally {
      setLoadingMain(false);
    }
  }

  async function loadProducts() {
    setLoadingProducts(true);
    try {
      const r = await api<ProductsResponse>(`/api/stats/products`);
      setProducts(r.items ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    void loadMain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    void loadProducts();
  }, []);

  const earnings = overview?.total_revenue ?? 0;
  const expenses = overview?.total_expenses ?? 0;
  const profit = overview?.approximate_profit ?? earnings - expenses;
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

  const delivery = overview?.total_delivery_fees ?? 0;
  const orders = overview?.order_count ?? 0;

  const series = useMemo(() => buildSeries(trendRaw, days), [trendRaw, days]);

  const maxIncome = useMemo(() => {
    if (!series.length) return 0;
    return Math.max(...series.map((p) => p.income));
  }, [series]);

  const periodLabel = useMemo(() => {
    if (!series.length) return "";
    if (days === 1) return series[0]?.label ?? "";
    return `${series[0]?.label ?? ""} – ${series[series.length - 1]?.label ?? ""}`;
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
      .filter((p) => {
        const hay = [p.sku, p.name].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [products, productSearch]);

  const axisStroke = "var(--st-axis)";
  const gridStroke = "var(--st-grid)";
  const barFill = "var(--st-accent)";

  return (
    <div className="stats-page">
      {/* Topbar */}
      <div className="st-topbar">
        <div>
          <div className="st-title">Business Stats</div>
          <div className="st-subtitle">
            Clear overview of revenue, costs, approximate profit, and best-selling products — without clutter.
          </div>
        </div>

        <div className="st-top-actions">
          <Link href="/incomes" className="st-btn">
            Income
          </Link>
          <Link href="/expenses" className="st-btn">
            Expenses
          </Link>
          <button type="button" className="st-btn st-btn-primary" onClick={() => void loadMain()} disabled={loadingMain}>
            Refresh
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="st-controls">
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {periodLabel ? <span className="st-chip">{periodLabel}</span> : <span className="st-chip">{humanRange}</span>}
          {loadingMain ? <span className="st-chip">Loading…</span> : <span className="st-chip">Period: {humanRange}</span>}
          {error ? <span className="st-error">{error}</span> : null}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="st-kpi-grid">
        <div className="st-kpi">
          <div className="st-kpi-top">
            <div className="st-kpi-label">Income (approved)</div>
            <div className="st-kpi-icon">💰</div>
          </div>
          <div className="st-kpi-value">{fmtTzs(earnings)} TZS</div>
          <div className="st-kpi-sub">Approved income records within {humanRange}.</div>
        </div>

        <div className="st-kpi">
          <div className="st-kpi-top">
            <div className="st-kpi-label">Expenses</div>
            <div className="st-kpi-icon">💸</div>
          </div>
          <div className="st-kpi-value">{fmtTzs(expenses)} TZS</div>
          <div className="st-kpi-sub">Recorded business costs within {humanRange}.</div>
        </div>

        <div className="st-kpi">
          <div className="st-kpi-top">
            <div className="st-kpi-label">Approx. profit</div>
            <div className="st-kpi-icon">📈</div>
          </div>
          <div className="st-kpi-value">{fmtTzs(profit)} TZS</div>
          <div className="st-kpi-sub">Income minus expenses (rough estimate) in {humanRange}.</div>
        </div>

        <div className="st-kpi">
          <div className="st-kpi-top">
            <div className="st-kpi-label">Completed orders</div>
            <div className="st-kpi-icon">📦</div>
          </div>
          <div className="st-kpi-value">{orders}</div>
          <div className="st-kpi-sub">Orders marked delivered within {humanRange}.</div>
        </div>
      </div>

      {/* Main shell */}
      <div className="st-shell">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Trend */}
          <div className="st-card">
            <div className="st-card-header">
              <div>
                <div className="st-card-title">Daily approved income</div>
                <div className="st-card-sub">Bars represent approved income per day (not expenses).</div>
              </div>
              <span className="st-pill st-pill--accent">{humanRange}</span>
            </div>

            <div className="st-card-body">
              {loadingMain ? (
                <div className="st-muted">Loading trend…</div>
              ) : series.length === 0 ? (
                <div className="st-muted">No data available for this period.</div>
              ) : (
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
                        formatter={(value: any) => `${Number(value).toLocaleString("sw-TZ")} TZS`}
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
              )}

              <div className="st-note">
                Note: Profit is shown in KPI using total expenses for the same period (approximation).
              </div>
            </div>
          </div>

          {/* Products */}
          <div className="st-card">
            <div className="st-card-header">
              <div>
                <div className="st-card-title">Top products</div>
                <div className="st-card-sub">Based on paid + delivered orders (overall).</div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  className="st-input"
                  style={{ width: 260 }}
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search SKU or name…"
                />
                {loadingProducts ? <span className="st-chip">Loading…</span> : <span className="st-chip">{products.length} total</span>}
              </div>
            </div>

            <div className="st-card-body">
              {productsFiltered.length === 0 ? (
                <div className="st-muted">No matching products.</div>
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

        {/* Right column: insights */}
<aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
  {/* Quick insights */}
  <div className="st-card">
    <div className="st-card-header">
      <div>
        <div className="st-card-title">Quick insights</div>
        <div className="st-card-sub">A few signals admins care about.</div>
      </div>
      <span className="st-pill">{humanRange}</span>
    </div>

    <div className="st-card-body">
      <div className="st-kv">
        <div className="st-kv-item">
          <div className="st-kv-label">Avg income / day</div>
          <div className="st-kv-value">{fmtTzs(insights.avgIncome)} TZS</div>
        </div>

        <div className="st-kv-item">
          <div className="st-kv-label">Avg orders / day</div>
          <div className="st-kv-value">{insights.avgOrders.toFixed(1)}</div>
        </div>

        <div className="st-kv-item">
          <div className="st-kv-label">Profit margin</div>
          <div className="st-kv-value">{Number.isFinite(insights.margin) ? `${insights.margin.toFixed(1)}%` : "—"}</div>
        </div>

        <div className="st-kv-item">
          <div className="st-kv-label">Delivery fees</div>
          <div className="st-kv-value">{fmtTzs(delivery)} TZS</div>
        </div>
      </div>

      <div className="st-note">
        {insights.bestDay ? (
          <>
            Best income day: <b>{dateOnly(insights.bestDay.date)}</b> —{" "}
            <b>{fmtTzs(insights.bestDay.income)} TZS</b>.
          </>
        ) : (
          <>Best income day: —</>
        )}
      </div>
    </div>
  </div>

  {/* Finance split */}
  <div className="st-card">
    <div className="st-card-header">
      <div>
        <div className="st-card-title">Finance split</div>
        <div className="st-card-sub">Profit vs Expenses (same period).</div>
      </div>
      <span className="st-pill st-pill--accent">{humanRange}</span>
    </div>

    <div className="st-card-body">
      {loadingMain ? (
        <div className="st-muted">Loading…</div>
      ) : financeSplit.total <= 0 ? (
        <div className="st-muted">No profit/expense data for this period.</div>
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
                  {/* Do not hardcode colors; use CSS variables so theme controls it */}
                  <Cell fill="var(--st-split-profit)" />
                  <Cell fill="var(--st-split-expenses)" />
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any) => [`${Number(value).toLocaleString("sw-TZ")} TZS`, name]}
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
                  {financeSplit.total > 0 ? ` · ${Math.round((Math.max(0, profit) / financeSplit.total) * 100)}%` : ""}
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
                  {financeSplit.total > 0 ? ` · ${Math.round((Math.max(0, expenses) / financeSplit.total) * 100)}%` : ""}
                </span>
              </div>
            </div>

            <div className="st-split-foot">
              Profit is clamped to 0 if negative (keeps chart readable).
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
