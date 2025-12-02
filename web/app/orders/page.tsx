"use client";

import { useCallback,useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";
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

type ProductOption = {
  id: number;
  sku: string;
  name: string;
  price_tzs: number;
  stock_qty: number | null;
};

type ManualOrderItem = {
  product_sku: string;
  qty: string;
};

type OrderItemRow = {
  sku: string;
  name: string;
  qty: number;
  unit_price_tzs?: number | null;
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
    default:
      return { label: s, className: "orders-status-badge" };
  }
}

export default function OrdersPage() {
  const searchParams = useSearchParams();
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
const [total] = useState(0);
const [editingOrder, setEditingOrder] = useState<OrderListRow | null>(null);
const [editForm, setEditForm] = useState({
  customer_name: "",
  phone: "",
  status: "",
  delivery_mode: "",
  region: "",
  km: "",
  fee_tzs: "",
  total_tzs: "",
  delivery_agent_phone: "",
});
const [editSaving, setEditSaving] = useState(false);

const [products, setProducts] = useState<ProductOption[]>([]);


const [showManualForm, setShowManualForm] = useState(false);

const [manual, setManual] = useState({
  customer_name: "",
  phone: "",
  location_type: "within" as "within" | "outside",
  region: "",
  delivery_mode: "pickup" as "pickup" | "delivery",
});

const [manualItems, setManualItems] = useState<ManualOrderItem[]>([
  { product_sku: "", qty: "1" },
]);

const [manualSaving, setManualSaving] = useState(false);
const [manualError, setManualError] = useState<string | null>(null);


  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<
    OrderItemRow[] | null
  >(null);

const handleSaveManualOrder = async (e: React.FormEvent) => {
  e.preventDefault();
  setManualSaving(true);
  setManualError(null);

  try {
    const name = manual.customer_name.trim();
    const phone = manual.phone.trim();
    const regionOrAddress = manual.region.trim();

    if (!name || !phone) {
      const msg = "Jina la mteja na namba ya simu ni lazima.";
      setManualSaving(false);
      setManualError(msg);
      toast.error("Taarifa hazijakamilika", { description: msg });
      return;
    }

    const cleanedItems = manualItems
      .map((row) => ({
        sku: row.product_sku.trim(),
        qty: Number(row.qty || "0"),
      }))
      .filter((it) => it.sku && it.qty > 0);

    if (!cleanedItems.length) {
      const msg = "Ongeza angalau bidhaa moja na ujaze kiasi.";
      setManualSaving(false);
      setManualError(msg);
      toast.error("Hakuna bidhaa kwenye order", { description: msg });
      return;
    }

    // Validate stock (if we know it)
    for (const item of cleanedItems) {
      const product = products.find((p) => p.sku === item.sku);
      if (!product) continue;

      const stock = product.stock_qty ?? null;
      if (typeof stock === "number" && item.qty > stock) {
        const msg = `Kiasi cha "${product.name}" kinazidi stock (${stock}).`;
        setManualSaving(false);
        setManualError(msg);
        toast.error("Stock haitoshi", { description: msg });
        return;
      }
    }

    const payload = {
      customer_name: name,
      phone,
      location_type: manual.location_type,
      region: regionOrAddress,
      delivery_mode:
        manual.location_type === "outside"
          ? "delivery"
          : manual.delivery_mode,
      items: cleanedItems,
    };

    await api("/api/orders/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    toast.success("Manual order imeundwa kwa mafanikio.");

    // Reset
    setManual({
      customer_name: "",
      phone: "",
      location_type: "within",
      region: "",
      delivery_mode: "pickup",
    });
    setManualItems([{ product_sku: "", qty: "1" }]);
    setManualSaving(false);
    setShowManualForm(false);
    void loadOrders();
  } catch (err: any) {
    console.error("Failed to create manual order", err);
    const msg =
      err?.message ?? "Imeshindikana kuunda order. Jaribu tena.";
    setManualSaving(false);
    setManualError(msg);
    toast.error("Imeshindikana kuunda order.", {
      description: "Tafadhali jaribu tena muda mfupi baadaye.",
    });
  }
};


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

  // Load products for manual order form and keep in sync with stock changes
  useEffect(() => {
    let isMounted = true;

    const loadProducts = async () => {
      try {
        const data = await api<{ items: ProductOption[] }>("/api/products");
        if (isMounted) {
          setProducts(data.items ?? []);
        }
      } catch (err) {
        console.error("Failed to load products", err);
      }
    };

    // initial load
    void loadProducts();

    // keep in sync with backend stock/product changes
    const s = socket();
    if (s) {
      const handler = () => {
        void loadProducts();
      };
      s.on("products.updated", handler);

      return () => {
        isMounted = false;
        s.off("products.updated", handler);
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);



const manualItemsWithProducts = manualItems.map((it) => {
  const product = products.find((p) => p.sku === it.product_sku) ?? null;
  const qty = Number(it.qty || "0") || 0;
  return { ...it, product, qty };
});

const manualTotal = manualItemsWithProducts.reduce((sum, item) => {
  if (!item.product || item.qty <= 0) return sum;
  return sum + item.product.price_tzs * item.qty;
}, 0);


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

const handleViewItems = async (order: OrderListRow) => {
  // If this order is already selected, clicking again will close the panel
  if (selectedOrderId === order.id) {
    setSelectedOrderId(null);
    setSelectedOrderItems(null);
    return;
  }

  try {
    const data = await api<{ items: OrderItemRow[] }>(
      `/api/orders/${order.id}/items`
    );
    setSelectedOrderId(order.id);
    setSelectedOrderItems(data.items ?? []);
  } catch (err: any) {
    console.error("Failed to load order items", err);
    toast.error("Failed to load order items");
  }
};

const handleCancelOrder = async (order: OrderListRow) => {
  if (!window.confirm("Cancel this order?")) return;

  try {
    await api(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
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

const handleAddManualItemRow = () => {
  setManualItems((rows) => [...rows, { product_sku: "", qty: "1" }]);
};

const handleRemoveManualItemRow = (index: number) => {
  setManualItems((rows) =>
    rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)
  );
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

   <button
    type="button"
    className="btn btn-xs btn-success"
    onClick={() => setShowManualForm((v) => !v)}
  >
    {showManualForm ? "Close manual order" : "Add order"}
  </button>
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

{showManualForm && (
  <div className="orders-form-card">
    <div className="orders-form-header">
      <div>
        <div className="orders-form-title">New manual order</div>
        <div className="orders-form-subtitle">
          Unda order ya mteja aliye kupigia simu au aliye ofisini.
        </div>
      </div>
      <div className="orders-form-header-right">
        <span className="orders-form-badge">MANUAL</span>
        <button
          type="button"
          className="orders-form-close-btn"
          onClick={() => {
            setShowManualForm(false);
            setManualError(null);
          }}
        >
          ✕
        </button>
      </div>
    </div>

    <form className="orders-form" onSubmit={handleSaveManualOrder}>
      {manualError && (
        <div className="orders-form-error">{manualError}</div>
      )}

      {/* Customer details */}
      <div className="orders-form-grid">
        <div className="orders-field">
          <label className="orders-label">Customer name</label>
          <input
            className="orders-input"
            value={manual.customer_name}
            onChange={(e) =>
              setManual((m) => ({ ...m, customer_name: e.target.value }))
            }
            placeholder="Mfano: Asha Mohamed"
            required
          />
        </div>

        <div className="orders-field">
          <label className="orders-label">Phone</label>
          <input
            className="orders-input"
            value={manual.phone}
            onChange={(e) =>
              setManual((m) => ({ ...m, phone: e.target.value }))
            }
            placeholder="Mfano: 07XXXXXXXX"
            required
          />
        </div>
      </div>

      {/* Location / address */}
      <div className="orders-form-grid">
        <div className="orders-field">
          <label className="orders-label">Location type</label>
          <select
            className="orders-input"
            value={manual.location_type}
            onChange={(e) =>
              setManual((m) => ({
                ...m,
                location_type: e.target.value as "within" | "outside",
              }))
            }
          >
            <option value="within">Within Dar es Salaam</option>
            <option value="outside">Outside region</option>
          </select>
          <p className="orders-help">
            Chagua kama mteja yupo ndani ya Dar au nje ya mkoa.
          </p>
        </div>

        <div className="orders-field">
          <label className="orders-label">
            {manual.location_type === "within"
              ? "Address"
              : "Region / Area"}
          </label>
          <input
            className="orders-input"
            value={manual.region}
            onChange={(e) =>
              setManual((m) => ({ ...m, region: e.target.value }))
            }
            placeholder={
              manual.location_type === "within"
                ? "Mfano: Mbagala, Kilungule"
                : "Mfano: Morogoro, Dodoma..."
            }
          />
          <p className="orders-help">
            {manual.location_type === "within"
              ? "Andika anuani ya mteja ndani ya Dar es Salaam."
              : "Andika mkoa / eneo la mteja kama yupo nje ya Dar."}
          </p>
        </div>

        {manual.location_type === "within" && (
          <div className="orders-field">
            <label className="orders-label">Delivery mode</label>
            <select
              className="orders-input"
              value={manual.delivery_mode}
              onChange={(e) =>
                setManual((m) => ({
                  ...m,
                  delivery_mode: e.target.value as "pickup" | "delivery",
                }))
              }
            >
              <option value="delivery">Delivery</option>
              <option value="pickup">Pickup</option>
            </select>
            <p className="orders-help">
              Kama ni ndani ya Dar, chagua kama ni kufikishiwa au kuchukua.
            </p>
          </div>
        )}
      </div>

      {/* Products list */}
      <div className="orders-section">
        <div className="orders-section-header">
          <div>
            <div className="orders-section-title">
              Products in this order
            </div>
            <div className="orders-section-subtitle">
              Ongeza bidhaa moja au zaidi kwenye order hii.
            </div>
          </div>
          <button
            type="button"
            className="orders-secondary-btn orders-secondary-btn--sm"
            onClick={() =>
              setManualItems((rows) => [
                ...rows,
                { product_sku: "", qty: "1" },
              ])
            }
          >
            + Add product
          </button>
        </div>

        <div className="orders-items-stack">
          {manualItems.map((row, index) => {
            const product =
              products.find((p) => p.sku === row.product_sku) ?? null;
            const stock = product?.stock_qty ?? null;
            const qtyNum = Number(row.qty || "0") || 0;

            return (
              <div key={index} className="orders-item-row">
                <div className="orders-field orders-field--grow">
                  <label className="orders-label">Product</label>
                  <select
                    className="orders-input"
                    value={row.product_sku}
                    onChange={(e) =>
                      setManualItems((rows) =>
                        rows.map((it, i) =>
                          i === index
                            ? { ...it, product_sku: e.target.value }
                            : it
                        )
                      )
                    }
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.sku}>
                        {p.name} —{" "}
                        {p.price_tzs.toLocaleString("sw-TZ")} TZS
                        {typeof p.stock_qty === "number"
                          ? ` (stock: ${p.stock_qty})`
                          : ""}
                      </option>
                    ))}
                  </select>
                  {product && (
                    <div className="orders-help">
                      {typeof stock === "number"
                        ? `Stock available: ${stock}`
                        : "No stock information for this product."}
                    </div>
                  )}
                </div>

                <div className="orders-field orders-field--qty">
                  <label className="orders-label">Qty</label>
                  <input
                    type="number"
                    min={1}
                    className="orders-input"
                    value={row.qty}
                    onChange={(e) =>
                      setManualItems((rows) =>
                        rows.map((it, i) =>
                          i === index
                            ? {
                                ...it,
                                qty: e.target.value.replace(/[^\d]/g, ""),
                              }
                            : it
                        )
                      )
                    }
                  />
                  {product &&
                    typeof stock === "number" &&
                    qtyNum > stock && (
                      <div className="orders-help orders-help--error">
                        Quantity exceeds available stock!
                      </div>
                    )}
                </div>

                <div className="orders-item-actions">
                  {manualItems.length > 1 && (
                    <button
                      type="button"
                      className="orders-secondary-btn orders-secondary-btn--danger orders-secondary-btn--icon"
                      onClick={() =>
                        setManualItems((rows) =>
                          rows.filter((_, i) => i !== index)
                        )
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Total + footer */}
      <div className="orders-form-footer">
        <div className="orders-total-block">
          <div className="orders-total-label">Calculated total</div>
          <div className="orders-total-value">
            {manualTotal > 0
              ? `${manualTotal.toLocaleString("sw-TZ")} TZS`
              : "—"}
          </div>
        </div>
        <div className="orders-form-buttons">
          <button
            type="button"
            className="orders-secondary-btn"
            onClick={() => {
              setShowManualForm(false);
              setManualError(null);
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="orders-primary-btn"
            disabled={manualSaving}
          >
            {manualSaving ? "Saving..." : "Save manual order"}
          </button>
        </div>
      </div>
    </form>
  </div>
)}


        {/* Orders table */}
        <div className="panel-card-body flex-1 overflow-auto text-xs">
{editingOrder && (
  <div className="orders-form-card orders-form-card--edit">
    <div className="orders-form-header">
      <div>
        <div className="orders-form-title">
          Edit order #{editingOrder.order_code || editingOrder.id}
        </div>
        <div className="orders-form-subtitle">
          Update customer details, totals and delivery info for this order.
        </div>
      </div>
      <div className="orders-form-header-right">
        <span className="orders-form-badge">
          {getStatusBadge(editingOrder.status || "unknown").label}
        </span>
        <button
          type="button"
          className="orders-form-close-btn"
          onClick={() => setEditingOrder(null)}
        >
          ×
        </button>
      </div>
    </div>

    <form
      className="orders-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!editingOrder) return;

        if (
          editForm.status === "out_for_delivery" &&
          !editForm.delivery_agent_phone.trim()
        ) {
          toast.error("Rider phone is required when status is out_for_delivery.");
          return;
        }

        setEditSaving(true);
        try {
          // 1) basic fields + delivery info
          await api(`/api/orders/${editingOrder.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_name: editForm.customer_name,
              phone: editForm.phone,
              delivery_mode: editForm.delivery_mode,
              region: editForm.region || undefined,
              km: editForm.km ? Number(editForm.km) : undefined,
              fee_tzs: editForm.fee_tzs ? Number(editForm.fee_tzs) : undefined,
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

          toast.success("Order updated.");
          setEditingOrder(null);
          void loadOrders();
        } catch (err: any) {
          console.error(err);
          toast.error("Failed to update order", {
            description:
              (err as any)?.message ??
              "Tafadhali jaribu tena muda mfupi baadaye.",
          });
        } finally {
          setEditSaving(false);
        }
      }}
    >
      <div className="orders-form-grid">
        {/* Customer name */}
        <div className="orders-field">
          <label className="orders-label">Customer name</label>
          <input
            className="orders-input"
            value={editForm.customer_name}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, customer_name: e.target.value }))
            }
          />
          <p className="orders-help">
            Jina la mteja litakalotumika kwenye order na risiti.
          </p>
        </div>

        {/* Phone */}
        <div className="orders-field">
          <label className="orders-label">Phone</label>
          <input
            className="orders-input"
            value={editForm.phone}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, phone: e.target.value }))
            }
          />
          <p className="orders-help">
            Namba ya simu ya mawasiliano kwa huyu mteja.
          </p>
        </div>

        {/* Status */}
        <div className="orders-field">
          <label className="orders-label">Status</label>
          <select
            className="orders-input"
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
          </select>
          <p className="orders-help">
            Hii ina-control hatua ambayo order imefikia kwa sasa.
          </p>
        </div>

        {/* Mode */}
        <div className="orders-field">
          <label className="orders-label">Mode</label>
          <select
            className="orders-input"
            value={editForm.delivery_mode}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, delivery_mode: e.target.value }))
            }
          >
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
          <p className="orders-help">
            Chagua kama order inachukuliwa dukani au inapelekwa kwa mteja.
          </p>
        </div>

        {/* Region / address */}
        <div className="orders-field">
          <label className="orders-label">
            {editForm.delivery_mode === "delivery"
              ? "Delivery region / address"
              : "Region / notes"}
          </label>
          <input
            className="orders-input"
            value={editForm.region}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, region: e.target.value }))
            }
            placeholder={
              editForm.delivery_mode === "delivery"
                ? "Mfano: Keko, Kigamboni, Mbagala..."
                : "Mfano: Kigamboni, Keko (hiari)"
            }
          />
          <p className="orders-help">
            Maelezo mafupi ya eneo la mteja au maelezo ya ziada ya order.
          </p>
        </div>

        {/* Distance & fee – only relevant for delivery */}
        {editForm.delivery_mode === "delivery" && (
          <>
            <div className="orders-field">
              <label className="orders-label">Distance (km)</label>
              <input
                type="number"
                className="orders-input"
                value={editForm.km}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, km: e.target.value }))
                }
              />
              <p className="orders-help">
                Umbali wa makadirio kutoka kituo hadi kwa mteja.
              </p>
            </div>

            <div className="orders-field">
              <label className="orders-label">Delivery fee (TZS)</label>
              <input
                type="number"
                className="orders-input"
                value={editForm.fee_tzs}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, fee_tzs: e.target.value }))
                }
              />
              <p className="orders-help">
                Gharama ya delivery (bila kujumuisha products).
              </p>
            </div>
          </>
        )}

        {/* Total */}
        <div className="orders-field">
          <label className="orders-label">Total (TZS)</label>
          <input
            type="number"
            className="orders-input"
            value={editForm.total_tzs}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, total_tzs: e.target.value }))
            }
          />
          <p className="orders-help">
            Jumla yote ya order (products + delivery kama ipo).
          </p>
        </div>

        {/* Rider phone */}
        <div className="orders-field">
          <label className="orders-label">
            Rider phone (if out_for_delivery)
          </label>
          <input
            className="orders-input"
            value={editForm.delivery_agent_phone}
            onChange={(e) =>
              setEditForm((f) => ({
                ...f,
                delivery_agent_phone: e.target.value,
              }))
            }
          />
          <p className="orders-help">
            Weka namba ya rider endapo status ni out_for_delivery.
          </p>
        </div>
      </div>

      <div className="orders-form-footer">
        <button
          type="button"
          className="orders-secondary-btn"
          onClick={() => setEditingOrder(null)}
          disabled={editSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="orders-primary-btn"
          disabled={editSaving}
        >
          {editSaving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </form>
  </div>
)}

          {error && <div className="text-red-600 mb-2">{error}</div>}

          {selectedOrderId != null && selectedOrderItems && (
            <div className="orders-items-panel">
              <div className="orders-items-title">
                Products for order #{selectedOrderId}
              </div>
              {selectedOrderItems.length === 0 ? (
                <div className="orders-items-empty">No items found.</div>
              ) : (
                <ul className="orders-items-list">
                  {selectedOrderItems.map((it) => (
                    <li key={`${it.sku}-${it.name}`} className="orders-items-item">
                      <span className="orders-items-name">{it.name}</span>
                      <span className="orders-items-qty">x{it.qty}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

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
      <tr key={order.id} className="orders-row">
        <td>
          <button
            type="button"
            className="orders-link-button"
            onClick={() => handleViewItems(order)}
          >
            #{order.order_code || order.id}
          </button>
        </td>
        <td>
          <div className="orders-customer-name">
            {order.customer_name || "—"}
          </div>
          <div className="orders-customer-phone">
            {order.phone ? formatPhonePretty(order.phone) : "—"}
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
  region: order.region ?? "",
  km: order.km != null ? String(order.km) : "",
  fee_tzs: order.fee_tzs != null ? String(order.fee_tzs) : "",
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
