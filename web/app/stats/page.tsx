"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type OverviewStats = {
  order_count: number;
  total_revenue: number;
  total_delivery_fees: number;
  total_expenses: number;
  approximate_profit: number;
};

type DailyPoint = {
  date: string; // e.g. "2025-12-02"
  total_tzs: number;
};

type DailyResponse = {
  points: DailyPoint[];
};

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

export default function StatsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [trend, setTrend] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("week"); // default: 7 days

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const days = RANGE_TO_DAYS[range];

      try {
        const [ov, daily] = await Promise.all([
          api<OverviewStats>(`/api/stats/overview?days=${days}`),
          api<DailyResponse>(`/api/stats/daily-incomes?days=${days}`),
        ]);
        setOverview(ov);
        setTrend(daily.points ?? []);
      } catch (err: any) {
        console.error("Failed to load stats", err);
        setError(err?.message ?? "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [range]);

  const earnings = overview?.total_revenue ?? 0;
  const expenses = overview?.total_expenses ?? 0;
  const profit =
    overview?.approximate_profit ?? earnings - expenses;
  const delivery = overview?.total_delivery_fees ?? 0;
  const orders = overview?.order_count ?? 0;

  // Prepare chart data
  const profitTrend = useMemo(
    () =>
      trend.length > 0
        ? trend.map((row) => {
            const d = new Date(row.date);
            const label = d.toLocaleDateString("en-US", {
              day: "2-digit",
              month: "short",
            });
            return {
              date: label,
              profit: row.total_tzs,
            };
          })
        : [],
    [trend]
  );

  const maxProfit =
    profitTrend.length > 0
      ? Math.max(...profitTrend.map((p) => p.profit))
      : 0;

  // e.g. "22 Dec – 28 Dec" at the top of the chart
  const periodDateLabel = useMemo(() => {
    if (trend.length === 0) return "";
    const first = new Date(trend[0].date);
    const last = new Date(trend[trend.length - 1].date);

    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "short",
      });

    if (RANGE_TO_DAYS[range] === 1) {
      return fmt(last);
    }

    return `${fmt(first)} – ${fmt(last)}`;
  }, [trend, range]);

  const humanRange = RANGE_HUMAN[range];

  return (
    <div className="page-root">
      <div className="page-inner space-y-6">
        {/* HEADER + FILTERS */}
        <div className="header-card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="header-title">📊 Business Analytics</h1>
            <p className="header-sub">
              View income, expenses and approximate profit over a
              specific period.
            </p>
            {error && (
              <p className="header-note text-red-200 text-xs mt-3">
                {error}
              </p>
            )}
          </div>

          {/* Day / Week / Month toggle */}
          <div className="inline-flex rounded-full border border-ui-border bg-ui-panel p-1 text-xs">
            {([
              ["day", "Day"],
              ["week", "Week"],
              ["month", "Month"],
            ] as [RangeKey, string][]).map(([key, label]) => {
              const active = range === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRange(key)}
                  className={
                    "px-3 py-1 rounded-full transition-colors" +
                    (active
                      ? " bg-indigo-600 text-white"
                      : " text-ui-dim hover:bg-ui-subtle")
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* KPI CARDS (all filtered by range) */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon bg-emerald-100 text-emerald-600">
              💰
            </div>
            <p className="kpi-label">
              Income (approved, {humanRange})
            </p>
            <p className="kpi-value">
              {earnings.toLocaleString("sw-TZ")} TZS
            </p>
            <p className="kpi-sub">
              From all approved income records in this period.
            </p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-red-100 text-red-600">
              💸
            </div>
            <p className="kpi-label">Expenses ({humanRange})</p>
            <p className="kpi-value">
              {expenses.toLocaleString("sw-TZ")} TZS
            </p>
            <p className="kpi-sub">
              Total recorded business costs in this period.
            </p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-amber-100 text-amber-600">
              📈
            </div>
            <p className="kpi-label">Approx. Profit ({humanRange})</p>
            <p className="kpi-value">
              {profit.toLocaleString("sw-TZ")} TZS
            </p>
            <p className="kpi-sub">
              Income minus expenses (rough estimate) for this period.
            </p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-indigo-100 text-indigo-600">
              📦
            </div>
            <p className="kpi-label">
              Completed orders ({humanRange})
            </p>
            <p className="kpi-value">{orders}</p>
            <p className="kpi-sub">
              Orders marked as delivered in this period.
            </p>
          </div>
        </div>

        {/* DAILY PROFIT BAR CHART (also filtered by range) */}
        <div className="panel-card">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="section-title">
              📊 Daily Profit ({humanRange})
            </h2>
            {periodDateLabel && (
              <span className="text-[10px] md:text-xs text-ui-dim border border-ui-border rounded-full px-2 py-0.5">
                {periodDateLabel}
              </span>
            )}
          </div>

          {loading && (
            <p className="muted">Inapakia takwimu za kila siku...</p>
          )}

          {!loading && profitTrend.length === 0 && (
            <p className="muted">
              Hakuna approved income ya kutosha kuonyesha chati.
            </p>
          )}

          {!loading && profitTrend.length > 0 && (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={profitTrend}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    opacity={0.15}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickMargin={8}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}M`
                        : v >= 1_000
                        ? `${(v / 1_000).toFixed(0)}k`
                        : v.toString()
                    }
                    domain={[0, maxProfit ? maxProfit * 1.1 : "auto"]}
                  />
                  <Tooltip
                    formatter={(value: any) =>
                      `${Number(value).toLocaleString("sw-TZ")} TZS`
                    }
                    labelStyle={{ fontSize: 12 }}
                    contentStyle={{
                      borderRadius: 12,
                      borderColor: "#e2e8f0",
                      boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                    }}
                  />
                  <Bar
                    dataKey="profit"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-2">
            *Each bar shows profit per day for the selected period
            (approved incomes only).
          </p>
        </div>

        {/* SUMMARY CARD */}
        <div className="panel-card">
          <h2 className="section-title mb-2">
            📌 Quick summary ({humanRange})
          </h2>
          <div className="text-sm space-y-1">
            <div>
              Completed orders: <b>{orders}</b>
            </div>
            <div className="text-xs text-slate-500">
              Delivery fees collected:{" "}
              <b>{delivery.toLocaleString("sw-TZ")} TZS</b>
            </div>
            <div className="text-xs text-slate-500">
              Net (income − expenses):{" "}
              <b>{profit.toLocaleString("sw-TZ")} TZS</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
