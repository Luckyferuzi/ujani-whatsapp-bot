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

export default function StatsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TEMPORARY TREND DATA UNTIL BACKEND ADDS THE REAL API
  const profitTrend = [
    { date: "01 Jan", profit: 21000 },
    { date: "02 Jan", profit: 35000 },
    { date: "03 Jan", profit: 18000 },
    { date: "04 Jan", profit: 42000 },
    { date: "05 Jan", profit: 38000 },
    { date: "06 Jan", profit: 50000 },
    { date: "07 Jan", profit: 47000 },
  ];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api<OverviewStats>("/api/stats/overview");
        setOverview(data);
      } catch (err: any) {
        setError(err?.message ?? "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const earnings = overview?.total_revenue ?? 0;
  const expenses = overview?.total_expenses ?? 0;
  const profit = overview?.approximate_profit ?? earnings - expenses;
  const delivery = overview?.total_delivery_fees ?? 0;
  const orders = overview?.order_count ?? 0;

  return (
    <div className="page-root">
      <div className="page-inner space-y-6">

        {/* HEADER */}
        <div className="header-card">
          <h1 className="header-title">📊 Business Analytics</h1>
          <p className="header-sub">Overview of your business performance.</p>
        </div>

        {/* KPI CARDS */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon bg-emerald-100 text-emerald-600">💰</div>
            <p className="kpi-label">Income</p>
            <p className="kpi-value">{earnings.toLocaleString("sw-TZ")} TZS</p>
            <p className="kpi-sub">From completed/paid orders.</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-red-100 text-red-600">💸</div>
            <p className="kpi-label">Expenses</p>
            <p className="kpi-value">{expenses.toLocaleString("sw-TZ")} TZS</p>
            <p className="kpi-sub">Total recorded business costs.</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-blue-100 text-blue-600">📈</div>
            <p className="kpi-label">Profit</p>
            <p className="kpi-value">{profit.toLocaleString("sw-TZ")} TZS</p>
            <p className="kpi-sub">Income minus expenses.</p>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon bg-indigo-100 text-indigo-600">📦</div>
            <p className="kpi-label">Orders</p>
            <p className="kpi-value">{orders}</p>
            <p className="kpi-sub">Completed customer orders.</p>
          </div>
        </div>

        {/* GRAPH CARD */}
        <div className="panel-card">
          <h2 className="section-title mb-2">📈 Profit Trend (This Week)</h2>

          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={profitTrend}>
                <defs>
                  <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />

                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
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
        </div>

        {/* ORDERS SUMMARY */}
        <div className="panel-card">
          <h2 className="section-title mb-2">📘 Orders Summary</h2>

          <div className="text-sm space-y-1">
            <div>Completed orders: <b>{orders}</b></div>
            <div className="text-xs text-slate-500">
              Delivery fees collected:{" "}
              <b>{delivery.toLocaleString("sw-TZ")} TZS</b>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
