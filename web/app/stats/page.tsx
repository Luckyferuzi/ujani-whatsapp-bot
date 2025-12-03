"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  LineChart,
  Line,
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
  date: string;        // "2025-12-02"
  total_tzs: number;   // sum of approved incomes for that day
};

type DailyResponse = {
  points: DailyPoint[];
};

export default function StatsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [trend, setTrend] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [ov, daily] = await Promise.all([
          api<OverviewStats>("/api/stats/overview"),
          api<DailyResponse>("/api/stats/daily-incomes?days=7"),
        ]);
        setOverview(ov);
        setTrend(daily.points);
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const earnings = overview?.total_revenue ?? 0;
  const expenses = overview?.total_expenses ?? 0;
  const profit =
    overview?.approximate_profit ?? earnings - expenses;
  const delivery = overview?.total_delivery_fees ?? 0;
  const orders = overview?.order_count ?? 0;

  // Map backend daily points to chart data
  const profitTrend =
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
      : [];

  return (
    <div className="page-root">
      <div className="page-inner space-y-6">
        {/* HEADER */}
        <div className="header-card">
          <h1 className="header-title">📊 Business Analytics</h1>
          <p className="header-sub">
            Overview of your business performance based on approved
            incomes and recorded expenses.
          </p>
          {error && (
            <p className="header-note text-red-200 text-xs mt-3">
              {error}
            </p>
          )}
        </div>

        {/* KPI CARDS */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon bg-emerald-100 text-emerald-600">
              💰
            </div>
            <p className="kpi-label">Income (approved)</p>
            <p className="kpi-value">
              {earnings.toLocaleString("sw-TZ")} TZS
            </p>
            <p className="kpi-sub">
              From all approved income records.
            </p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-red-100 text-red-600">
              💸
            </div>
            <p className="kpi-label">Expenses</p>
            <p className="kpi-value">
              {expenses.toLocaleString("sw-TZ")} TZS
            </p>
            <p className="kpi-sub">
              Total recorded business costs.
            </p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-amber-100 text-amber-600">
              📈
            </div>
            <p className="kpi-label">Approx. Profit</p>
            <p className="kpi-value">
              {profit.toLocaleString("sw-TZ")} TZS
            </p>
            <p className="kpi-sub">
              Income minus expenses (rough view).
            </p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-indigo-100 text-indigo-600">
              📦
            </div>
            <p className="kpi-label">Orders</p>
            <p className="kpi-value">{orders}</p>
            <p className="kpi-sub">Delivered customer orders.</p>
          </div>
        </div>

        {/* GRAPH CARD */}
        <div className="panel-card">
          <h2 className="section-title mb-2">
            📈 Profit Trend (last 7 days)
          </h2>

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
                <LineChart data={profitTrend}>
                  <defs>
                    <linearGradient
                      id="profitGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#10b981"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="#10b981"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={11}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                  />

                  <CartesianGrid
                    strokeDasharray="3 3"
                    opacity={0.2}
                  />
                  <Tooltip />

                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                    fill="url(#profitGradient)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-2">
            *Trend inategemea mapato yaliyothibitishwa (approved
            incomes) kwa kila siku.
          </p>
        </div>

        {/* SUMMARY CARD */}
        <div className="panel-card">
          <h2 className="section-title mb-2">
            📌 Quick summary
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
