"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";

type OrderListRow = {
  id: number;
  status: string | null;
  delivery_mode: string | null;
  km?: number | null;
  fee_tzs?: number | null;
  total_tzs: number;
  phone?: string | null;
  region?: string | null;
  created_at: string;
  delivery_agent_phone?: string | null;
  order_code?: string | null;
  customer_name?: string | null;
  payment_id?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
};

function formatTzs(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return Math.floor(value).toLocaleString("sw-TZ");
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("sw-TZ", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusBadge(
  status: string | null
): { label: string; className: string } {
  const s = status || "unknown";
  switch (s) {
    case "pending":
      return {
        label: "Pending",
        className: "orders-status-badge orders-status--pending",
      };
    case "preparing":
      return {
        label: "Preparing",
        className: "orders-status-badge orders-status--preparing",
      };
    case "verifying":
      return {
        label: "Verifying",
        className: "orders-status-badge orders-status--verifying",
      };
    case "out_for_delivery":
      return {
        label: "Out for delivery",
        className: "orders-status-badge orders-status--out_for_delivery",
      };
    case "delivered":
      return {
        label: "Delivered",
        className: "orders-status-badge orders-status--delivered",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        className: "orders-status-badge orders-status--cancelled",
      };
    case "failed":
      return {
        label: "Failed",
        className: "orders-status-badge orders-status--failed",
      };
    default:
      return { label: s, className: "orders-status-badge" };
  }
}

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialPhone = searchParams.get("phone") ?? "";
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [product, setProduct] = useState(searchParams.get("product") ?? "");
  const [minTotal, setMinTotal] = useState(
    searchParams.get("min_total") ?? ""
  );
  const [maxTotal, setMaxTotal] = useState(
    searchParams.get("max_total") ?? ""
  );
  const [phoneFilter, setPhoneFilter] = useState(initialPhone);

  const [items, setItems] = useState<OrderListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = useMemo(
    () =>
      !!(
        q.trim() ||
        status ||
        product.trim() ||
        minTotal.trim() ||
        maxTotal.trim() ||
        phoneFilter.trim()
      ),
    [q, status, product, minTotal, maxTotal, phoneFilter]
  );

  const loadOrders = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (product.trim()) params.set("product", product.trim());
      if (minTotal.trim()) params.set("min_total", minTotal.trim());
      if (maxTotal.trim()) params.set("max_total", maxTotal.trim());
      if (phoneFilter.trim()) params.set("phone", phoneFilter.trim());

      const qs = params.toString();
      const path = qs ? `/api/orders?${qs}` : "/api/orders";

      const data = await api<{ items: OrderListRow[] }>(path);
      setItems(data.items ?? []);
    } catch (err: any) {
      console.error("Failed to load orders", err);
      setItems([]);
      setError("Failed to load orders. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const handleSubmitFilters = (e: React.FormEvent) => {
    e.preventDefault();
    void loadOrders();
  };

  const handleClearFilters = () => {
    setQ("");
    setStatus("");
    setProduct("");
    setMinTotal("");
    setMaxTotal("");
    setPhoneFilter("");
    void loadOrders();
  };

  const handleOpenConversation = (order: OrderListRow) => {
    if (!order.phone) return;
    const params = new URLSearchParams({ phone: order.phone });
    router.push(`/inbox?${params.toString()}`);
  };

  const handleEditOrder = async (order: OrderListRow) => {
    const current = order.status || "pending";
    const next = window.prompt(
      "Update status (pending, preparing, out_for_delivery, delivered, cancelled):",
      current
    );
    if (!next || next === current) return;

    const payload: any = { status: next };

    if (next === "out_for_delivery") {
      const phone = window.prompt(
        "Enter rider phone number:",
        order.delivery_agent_phone || ""
      );
      if (!phone) {
        alert("Rider phone is required for 'out_for_delivery'.");
        return;
      }
      payload.delivery_agent_phone = phone.trim();
    }

    try {
      await api(`/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      void loadOrders();
    } catch (err) {
      console.error("Failed to update order status", err);
      alert("Failed to update order. Please try again.");
    }
  };

  const handleDeleteOrder = async (order: OrderListRow) => {
    const ok = window.confirm(
      `Are you sure you want to cancel order #${order.order_code || order.id}?`
    );
    if (!ok) return;

    try {
      await api(`/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      void loadOrders();
    } catch (err) {
      console.error("Failed to cancel order", err);
      alert("Failed to cancel order. Please try again.");
    }
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
      <div className="panel-card flex-1 flex flex-col">
        {/* Header row with title + filter buttons */}
        <div className="panel-card-header">
          <div className="panel-card-title">
            Orders{" "}
            <span className="text-xs text-gray-500">
              ({items.length} result{items.length === 1 ? "" : "s"})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={
                "orders-filter-toggle" +
                (showFilters ? " orders-filter-toggle--active" : "")
              }
              onClick={() => setShowFilters((prev) => !prev)}
            >
              ☰ Filters
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                className="orders-filter-clear"
                onClick={handleClearFilters}
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Filter form (collapsible) */}
        {showFilters && (
          <form
            className="panel-card-body grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mb-2"
            onSubmit={handleSubmitFilters}
          >
            <div className="flex flex-col gap-1">
              <label className="font-semibold">Search</label>
              <input
                type="text"
                className="history-edit-input"
                placeholder="Name, phone, order code..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold">Status</label>
              <select
                className="history-edit-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="preparing">Preparing</option>
                <option value="out_for_delivery">Out for delivery</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold">Product name / SKU</label>
              <input
                type="text"
                className="history-edit-input"
                placeholder="e.g. Ujani herbal tea"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold">Min total (TZS)</label>
              <input
                type="number"
                className="history-edit-input"
                value={minTotal}
                onChange={(e) => setMinTotal(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold">Max total (TZS)</label>
              <input
                type="number"
                className="history-edit-input"
                value={maxTotal}
                onChange={(e) => setMaxTotal(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold">Customer phone</label>
              <input
                type="text"
                className="history-edit-input"
                placeholder="+255..."
                value={phoneFilter}
                onChange={(e) => setPhoneFilter(e.target.value)}
              />
            </div>
            <div className="md:col-span-3 flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                className="btn btn-xs"
                onClick={handleClearFilters}
              >
                Clear
              </button>
              <button
                type="submit"
                className="btn btn-xs btn-primary"
                disabled={loading}
              >
                {loading ? "Loading…" : "Apply filters"}
              </button>
            </div>
          </form>
        )}

        {/* Orders table */}
        <div className="panel-card-body flex-1 overflow-auto text-xs">
          {error && <div className="text-red-600 mb-2">{error}</div>}
          {items.length === 0 && !loading ? (
            <div className="panel-card-body--muted">
              No orders match the current filters.
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Mode</th>
                  <th className="text-right">Total (TZS)</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => {
                  const badge = getStatusBadge(order.status);
                  return (
                    <tr
                      key={order.id}
                      className="orders-row"
                      onClick={() => handleOpenConversation(order)}
                    >
                      <td>#{order.order_code || order.id}</td>
                      <td>
                        <div className="orders-customer-name">
                          {order.customer_name || "—"}
                        </div>
                        <div className="orders-customer-phone">
                          {order.phone
                            ? formatPhonePretty(order.phone)
                            : "—"}
                        </div>
                      </td>
                      <td>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td>
                        {order.delivery_mode && (
                          <span className="orders-mode-pill">
                            {order.delivery_mode}
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        {formatTzs(order.total_tzs)}
                      </td>
                      <td>{formatDateTime(order.created_at)}</td>
                      <td className="orders-actions">
                        <button
                          type="button"
                          className="orders-action-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleEditOrder(order);
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="orders-action-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteOrder(order);
                          }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
