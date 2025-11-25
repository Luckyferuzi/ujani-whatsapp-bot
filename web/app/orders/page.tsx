"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { toast } from "sonner";

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

type OrdersResponse = {
  items?: OrderListRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
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
  // NEW:
const [page, setPage] = useState(1);
const [pageSize] = useState(50); // or 20
const [total, setTotal] = useState(0);
const [editingOrder, setEditingOrder] = useState<OrderListRow | null>(null);
const [editForm, setEditForm] = useState({
  customer_name: "",
  phone: "",
  status: "",
  delivery_mode: "",
  total_tzs: "",
  delivery_agent_phone: "",
});

const [manual, setManual] = useState({
  customer_name: "",
  phone: "",
  delivery_mode: "pickup",
  total_tzs: "",
  km: "",
  fee_tzs: "",
});



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

    // 👇 tell TypeScript the shape of the response
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
  }, [page]);

const handleSubmitFilters = (e: React.FormEvent) => {
  e.preventDefault();
  setPage(1);          // reset to first page when filters change
  void loadOrders();
};

const handleClearFilters = () => {
  setQ("");
  setStatus("");
  setProduct("");
  setMinTotal("");
  setMaxTotal("");
  setPhoneFilter("");
  setPage(1);
  void loadOrders();
};

  const handleOpenConversation = (order: OrderListRow) => {
    if (!order.phone) return;
    const params = new URLSearchParams({ phone: order.phone });
    router.push(`/inbox?${params.toString()}`);
  };

const handleCancelOrder = async (order: OrderListRow) => {
  try {
    await api(`/api/orders/${order.id}/cancel`, {
      method: "POST",
    });
    void loadOrders();
  } catch (err: any) {
    console.error("Failed to cancel order", err);
    alert("Failed to cancel order. Please try again.");
  }
};


const handleDeleteOrder = async (order: OrderListRow) => {
  try {
    await api(`/api/orders/${order.id}`, { method: "DELETE" });
    void loadOrders();
    toast.success("Order deleted");
  } catch (err) {
    console.error("Failed to delete order", err);
    toast.error("Failed to delete order");
  }
};


const handleExportCsv = async () => {
  try {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (product.trim()) params.set("product", product.trim());
    if (minTotal.trim()) params.set("min_total", minTotal.trim());
    if (maxTotal.trim()) params.set("max_total", maxTotal.trim());
    if (phoneFilter.trim()) params.set("phone", phoneFilter.trim());

    // export more rows at once
    params.set("limit", "500");

    const path = `/api/orders?${params.toString()}`;

    // 👇 type the response here too
    const data = await api<{ items: OrderListRow[] }>(path);
    const rows = data.items ?? [];

    const header = [
      "Order ID",
      "Order Code",
      "Customer Name",
      "Phone",
      "Status",
      "Total TZS",
      "Delivery Mode",
      "Region",
      "Created At",
    ];

    const csvLines = [
      header.join(","),
      ...rows.map((o) =>
        [
          o.id,
          o.order_code ?? "",
          o.customer_name ?? "",
          o.phone ?? "",
          o.status ?? "",
          o.total_tzs,
          o.delivery_mode ?? "",
          o.region ?? "",
          o.created_at,
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to export orders", err);
    alert("Failed to export. Please try again.");
  }
};

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
      <div className="panel-card flex-1 flex flex-col">
        {/* Header row with title + filter buttons */}
        <div className="flex items-center gap-2">
  <button
    type="button"
    className="btn btn-xs"
    onClick={() => setShowFilters((s) => !s)}
  >
    {showFilters ? "Hide filters" : "Show filters"}
  </button>
  <button
    type="button"
    className="btn btn-xs"
    onClick={handleExportCsv}
    disabled={loading}
  >
    Export to Excel
  </button>
</div>

<div className="panel-card mb-4">
  <div className="panel-card-header">Add manual order</div>
  <div className="panel-card-body grid md:grid-cols-3 gap-3">
    <input
      className="history-edit-input"
      placeholder="Customer name"
      value={manual.customer_name}
      onChange={(e) =>
        setManual((m) => ({ ...m, customer_name: e.target.value }))
      }
    />
    <input
      className="history-edit-input"
      placeholder="Phone"
      value={manual.phone}
      onChange={(e) => setManual((m) => ({ ...m, phone: e.target.value }))}
    />
    <select
      className="history-edit-input"
      value={manual.delivery_mode}
      onChange={(e) =>
        setManual((m) => ({ ...m, delivery_mode: e.target.value }))
      }
    >
      <option value="pickup">Pickup</option>
      <option value="delivery">Delivery</option>
    </select>
    <input
      type="number"
      className="history-edit-input"
      placeholder="Total TZS"
      value={manual.total_tzs}
      onChange={(e) =>
        setManual((m) => ({ ...m, total_tzs: e.target.value }))
      }
    />
    <input
      type="number"
      className="history-edit-input"
      placeholder="KM (optional)"
      value={manual.km}
      onChange={(e) => setManual((m) => ({ ...m, km: e.target.value }))}
    />
    <input
      type="number"
      className="history-edit-input"
      placeholder="Delivery fee TZS (optional)"
      value={manual.fee_tzs}
      onChange={(e) =>
        setManual((m) => ({ ...m, fee_tzs: e.target.value }))
      }
    />
  </div>
  <div className="panel-card-footer flex justify-end">
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await api("/api/orders/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_name: manual.customer_name,
              phone: manual.phone,
              delivery_mode: manual.delivery_mode,
              total_tzs: Number(manual.total_tzs || 0),
              km: Number(manual.km || 0) || undefined,
              fee_tzs: Number(manual.fee_tzs || 0) || undefined,
            }),
          });
          toast.success("Manual order created");
          setManual({
            customer_name: "",
            phone: "",
            delivery_mode: "pickup",
            total_tzs: "",
            km: "",
            fee_tzs: "",
          });
          void loadOrders();
        } catch (err) {
          console.error("Failed to create manual order", err);
          toast.error("Failed to create manual order");
        }
      }}
    >
      Save manual order
    </button>
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
            {editingOrder && (
  <div className="mb-4 p-3 border rounded bg-ui-subtle">
    <h3 className="font-semibold mb-2">Edit order #{editingOrder.id}</h3>

    <div className="grid md:grid-cols-3 gap-3">
      {/* Name */}
      <div>
        <label className="block text-xs font-semibold mb-1">Name</label>
        <input
          className="history-edit-input"
          value={editForm.customer_name}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, customer_name: e.target.value }))
          }
        />
      </div>

      {/* Phone */}
      <div>
        <label className="block text-xs font-semibold mb-1">Phone</label>
        <input
          className="history-edit-input"
          value={editForm.phone}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, phone: e.target.value }))
          }
        />
      </div>

      {/* Status */}
      <div>
        <label className="block text-xs font-semibold mb-1">Status</label>
        <select
          className="history-edit-input"
          value={editForm.status}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, status: e.target.value }))
          }
        >
          <option value="pending">Pending</option>
          <option value="preparing">Preparing</option>
          <option value="verifying">Verifying</option>
          <option value="out_for_delivery">Out for delivery</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Mode */}
      <div>
        <label className="block text-xs font-semibold mb-1">Mode</label>
        <select
          className="history-edit-input"
          value={editForm.delivery_mode}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, delivery_mode: e.target.value }))
          }
        >
          <option value="pickup">Pickup</option>
          <option value="delivery">Delivery</option>
        </select>
      </div>

      {/* Total */}
      <div>
        <label className="block text-xs font-semibold mb-1">Total (TZS)</label>
        <input
          type="number"
          className="history-edit-input"
          value={editForm.total_tzs}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, total_tzs: e.target.value }))
          }
        />
      </div>

      {/* Rider phone for out_for_delivery */}
      <div>
        <label className="block text-xs font-semibold mb-1">
          Rider phone (if out_for_delivery)
        </label>
        <input
          className="history-edit-input"
          value={editForm.delivery_agent_phone}
          onChange={(e) =>
            setEditForm((f) => ({
              ...f,
              delivery_agent_phone: e.target.value,
            }))
          }
        />
      </div>
    </div>

    <div className="mt-3 flex gap-2">
      <button
        type="button"
        className="btn btn-sm"
        onClick={async () => {
          if (!editingOrder) return;

          // 1) basic fields
          await api(`/api/orders/${editingOrder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_name: editForm.customer_name,
              phone: editForm.phone,
              delivery_mode: editForm.delivery_mode,
              total_tzs: Number(editForm.total_tzs || 0),
            }),
          });

          // 2) status (includes WhatsApp side effects)
          await api(`/api/orders/${editingOrder.id}/status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: editForm.status,
              delivery_agent_phone:
                editForm.delivery_agent_phone || undefined,
            }),
          });

          setEditingOrder(null);
          void loadOrders();
        }}
      >
        Save
      </button>
      <button
        type="button"
        className="btn btn-sm btn-secondary"
        onClick={() => setEditingOrder(null)}
      >
        Cancel
      </button>
    </div>
  </div>
)}

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
    setEditingOrder(order);
    setEditForm({
      customer_name: order.customer_name ?? "",
      phone: order.phone ?? "",
      status: order.status ?? "pending",
      delivery_mode: order.delivery_mode ?? "pickup",
      total_tzs: String(order.total_tzs ?? ""),
      delivery_agent_phone: order.delivery_agent_phone ?? "",
    });
  }}
>
  ✏️
</button>

<button
  type="button"
  className="orders-action-button"
  onClick={(e) => {
    e.stopPropagation();
    void handleCancelOrder(order);
  }}
>
  ❌
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
          {items.length > 0 && (
  <div className="flex items-center justify-between mt-2 text-xs">
    <div>
      Page {page} of {Math.max(1, Math.ceil(total / pageSize))}{" "}
      ({total} orders)
    </div>
    <div className="flex gap-2">
      <button
        type="button"
        className="btn btn-xs"
        disabled={page <= 1 || loading}
        onClick={() => setPage((p) => Math.max(1, p - 1))}
      >
        Previous
      </button>
      <button
        type="button"
        className="btn btn-xs"
        disabled={page >= Math.ceil(total / pageSize) || loading}
        onClick={() => setPage((p) => p + 1)}
      >
        Next
      </button>
    </div>
  </div>
)}
        </div>
      </div>
    </div>
  );
}
