"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type OverviewStats = {
  order_count: number;
  total_revenue: number;
  total_delivery_fees: number;
};

export default function StatsPage() {
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const o = await api<OverviewStats>("/api/stats/overview");
        setOverview(o);
      } catch (err: any) {
        console.error("Failed to load stats", err);
        setError(err?.message ?? "Failed to load stats");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const earnings = overview?.total_revenue ?? 0;
  const expenses = overview?.total_delivery_fees ?? 0;
  const profit = earnings - expenses;

  return (
    <div className="page-root">
      <div className="page-inner">
        <div className="panel-card">
          <div className="panel-card-header flex items-center justify-between">
            <span>📊 Business statistics</span>
          </div>
          <div className="panel-card-body text-xs space-y-4">
            {error && <div className="text-red-600 mb-2">{error}</div>}

            {loading && (
              <div className="panel-card-body--muted">
                Loading statistics…
              </div>
            )}

            {!loading && overview && (
              <div className="grid md:grid-cols-3 gap-3">
                <div className="panel-card">
                  <div className="panel-card-header">Total earnings</div>
                  <div className="panel-card-body text-2xl font-semibold">
                    {earnings.toLocaleString("sw-TZ")} TZS
                  </div>
                  <div className="panel-card-body text-xs text-slate-500">
                    Sum of all PAID / DELIVERED orders.
                  </div>
                </div>

                <div className="panel-card">
                  <div className="panel-card-header">Total expenses</div>
                  <div className="panel-card-body text-2xl font-semibold">
                    {expenses.toLocaleString("sw-TZ")} TZS
                  </div>
                  <div className="panel-card-body text-xs text-slate-500">
                    Delivery fees (“spend”) recorded on orders.
                  </div>
                </div>

                <div className="panel-card">
                  <div className="panel-card-header">Profit</div>
                  <div className="panel-card-body text-2xl font-semibold">
                    {profit.toLocaleString("sw-TZ")} TZS
                  </div>
                  <div className="panel-card-body text-xs text-slate-500">
                    Earnings minus expenses.
                  </div>
                </div>
              </div>
            )}

            {!loading && !overview && !error && (
              <div className="panel-card-body--muted">
                No completed orders yet.
              </div>
            )}

            {overview && (
              <div className="panel-card mt-4">
                <div className="panel-card-header">Orders summary</div>
                <div className="panel-card-body text-sm">
                  Completed orders:{" "}
                  <strong>{overview.order_count}</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
