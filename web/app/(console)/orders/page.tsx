"use client";

import {Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";
import { formatPhonePretty } from "@/lib/phone";
import OperatorTimelineNotes from "@/components/OperatorTimelineNotes";
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
  payment_status?: string | null;
  paid_amount?: number | null;
};

type OrdersResponse = {
  items: OrderListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

function statusBadge(status: string | null): { label: string; className: string } {
  const s = status || "unknown";
  switch (s) {
    case "pending":
      return { label: "Pending", className: "or-badge or-badge--pending" };
    case "preparing":
      return { label: "Preparing", className: "or-badge or-badge--preparing" };
    case "verifying":
      return { label: "Verifying", className: "or-badge or-badge--verifying" };
    case "out_for_delivery":
      return { label: "Out for delivery", className: "or-badge or-badge--out_for_delivery" };
    case "delivered":
      return { label: "Delivered", className: "or-badge or-badge--delivered" };
    case "cancelled":
      return { label: "Cancelled", className: "or-badge or-badge--cancelled" };
    default:
      return { label: s, className: "or-badge" };
  }
}

function paymentBadge(
  payment_status: string | null | undefined,
  paid_amount: number | null | undefined,
  total_tzs: number
): { label: string; className: string } {
  const ps = (payment_status || "").toLowerCase();
  const paid = typeof paid_amount === "number" ? paid_amount : 0;

  if (ps === "paid" || paid >= total_tzs) {
    return { label: "Paid", className: "or-badge or-badge--paid" };
  }

  if (paid > 0 && paid < total_tzs) {
    return { label: `Partial (${formatTzs(paid)} TZS)`, className: "or-badge or-badge--partial" };
  }

  if (ps.includes("pending") || ps.includes("verify") || ps.includes("unverified")) {
    return { label: "Payment pending", className: "or-badge or-badge--paypending" };
  }

  return { label: "Unpaid", className: "or-badge or-badge--unpaid" };
}

function getStatusFilterOptions() {
  return [
    { key: "", label: "All orders", hint: "Everything in the current workspace" },
    { key: "pending", label: "Pending", hint: "New orders waiting to move" },
    { key: "verifying", label: "Payment verification", hint: "Proofs or payment checks in progress" },
    { key: "preparing", label: "Preparing", hint: "Orders being fulfilled now" },
    { key: "out_for_delivery", label: "Delivery", hint: "Orders currently with riders" },
    { key: "delivered", label: "Delivered", hint: "Completed orders" },
    { key: "cancelled", label: "Cancelled", hint: "Orders that will not continue" },
  ] as const;
}

function formatRelativeDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDateTime(value);
}


export default function OrdersPage() {
  const searchParams = useSearchParams();
  const initialPhone = searchParams.get("phone") ?? "";
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
const [bulkWorking, setBulkWorking] = useState(false);

  // Simple defaults
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [phoneFilter, setPhoneFilter] = useState(initialPhone);

  // Advanced (hidden by default)
  const [product, setProduct] = useState(searchParams.get("product") ?? "");
  const [minTotal, setMinTotal] = useState(searchParams.get("min_total") ?? "");
  const [maxTotal, setMaxTotal] = useState(searchParams.get("max_total") ?? "");
  const [showFilters, setShowFilters] = useState(false);

  // Data
  const [items, setItems] = useState<OrderListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination (backend supports it)
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Selection
  const [selectedOrder, setSelectedOrder] = useState<OrderListRow | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<OrderItemRow[] | null>(null);

  // Edit modal
  const [editingOrder, setEditingOrder] = useState<OrderListRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    customer_name: "",
    phone: "",
    status: "pending",
    delivery_mode: "pickup",
    region: "",
    km: "",
    fee_tzs: "",
    total_tzs: "",
    delivery_agent_phone: "",
  });

  // Manual order modal
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

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
  const [bulkAnchorIndex, setBulkAnchorIndex] = useState<number | null>(null);

  const manualItemsWithProducts = useMemo(() => {
    return manualItems.map((it) => {
      const productObj = products.find((p) => p.sku === it.product_sku) ?? null;
      const qty = Number(it.qty || "0") || 0;
      return { ...it, product: productObj, qty };
    });
  }, [manualItems, products]);

  const manualTotal = useMemo(() => {
    return manualItemsWithProducts.reduce((sum, row) => {
      if (!row.product || row.qty <= 0) return sum;
      return sum + row.product.price_tzs * row.qty;
    }, 0);
  }, [manualItemsWithProducts]);

  async function loadOrders() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (phoneFilter.trim()) params.set("phone", phoneFilter.trim());

      if (showFilters) {
        if (product.trim()) params.set("product", product.trim());
        if (minTotal.trim()) params.set("min_total", minTotal.trim());
        if (maxTotal.trim()) params.set("max_total", maxTotal.trim());
      }

      const data = await api<OrdersResponse>(`/api/orders?${params.toString()}`);

      setItems(data.items ?? []);
      setBulkSelected((prev) => {
  const next = new Set<number>();
  for (const o of data.items ?? []) {
    if (prev.has(o.id)) next.add(o.id);
  }
  return next;
});

      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);

      // If the selected order disappears after filtering, clear selection
      if (selectedOrder && !data.items.some((x) => x.id === selectedOrder.id)) {
        setSelectedOrder(null);
        setSelectedOrderItems(null);
      }
    } catch (err: any) {
      console.error("Failed to load orders", err);
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      setError(err?.message ?? "Failed to load orders. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Load orders when page changes
  useEffect(() => {
    void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Load products (manual order dropdown)
  useEffect(() => {
    let isMounted = true;

    const loadProducts = async () => {
      try {
        const data = await api<{ items: ProductOption[] }>("/api/products");
        if (isMounted) setProducts(data.items ?? []);
      } catch (err) {
        console.error("Failed to load products", err);
      }
    };

    void loadProducts();

    const s = socket();
    if (s) {
      const handler = () => void loadProducts();
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

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    void loadOrders();
  }

  function clearFilters() {
    setQ("");
    setStatus("");
    setPhoneFilter("");
    setProduct("");
    setMinTotal("");
    setMaxTotal("");
    setPage(1);
    setSelectedOrder(null);
    setSelectedOrderItems(null);
    setBulkSelected(new Set());
    void loadOrders();
  }

  async function selectOrder(order: OrderListRow) {
    if (selectedOrder?.id === order.id) {
      setSelectedOrder(null);
      setSelectedOrderItems(null);
      return;
    }

    try {
      setSelectedOrder(order);
      setSelectedOrderItems(null);
      const data = await api<{ items: OrderItemRow[] }>(`/api/orders/${order.id}/items`);
      setSelectedOrderItems(data.items ?? []);
    } catch (err) {
      console.error("Failed to load order items", err);
      toast.error("Failed to load order items");
    }
  }

  async function cancelOrder(order: OrderListRow) {
    if (!window.confirm("Cancel this order?")) return;

    try {
      await api(`/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      toast.success("Order cancelled");
      void loadOrders();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to cancel order");
    }
  }

  async function setOrderStatus(order: OrderListRow, newStatus: string) {
  try {
    await api(`/api/orders/${order.id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    toast.success(`Status updated: ${newStatus}`);
    void loadOrders();
  } catch (err) {
    console.error(err);
    toast.error("Failed to update status");
  }
}

const idToIndex = useMemo(() => {
  const m = new Map<number, number>();
  items.forEach((o, idx) => m.set(o.id, idx));
  return m;
}, [items]);

function toggleBulk(id: number, shiftKey: boolean) {
  const idx = idToIndex.get(id);
  const has = bulkSelected.has(id);
  const targetChecked = !has;

  setBulkSelected((prev) => {
    const next = new Set(prev);

    // Shift range selection (only within current visible items)
    if (shiftKey && bulkAnchorIndex != null && idx != null) {
      const start = Math.min(bulkAnchorIndex, idx);
      const end = Math.max(bulkAnchorIndex, idx);

      for (let i = start; i <= end; i += 1) {
        const rowId = items[i]?.id;
        if (!rowId) continue;
        if (targetChecked) next.add(rowId);
        else next.delete(rowId);
      }

      return next;
    }

    // Normal toggle
    if (targetChecked) next.add(id);
    else next.delete(id);

    return next;
  });

  // Update anchor (where shift selection starts from)
  setBulkAnchorIndex(idx ?? null);
}

function setAllVisible(checked: boolean) {
  if (!checked) {
    setBulkSelected(new Set());
    setBulkAnchorIndex(null);
    return;
  }
  setBulkSelected(new Set(items.map((o) => o.id)));
  setBulkAnchorIndex(items.length ? 0 : null);
}


const allVisibleSelected = useMemo(() => {
  if (!items.length) return false;
  for (const o of items) {
    if (!bulkSelected.has(o.id)) return false;
  }
  return true;
}, [items, bulkSelected]);

async function bulkSetStatus(newStatus: string) {
  const ids = Array.from(bulkSelected);
  if (!ids.length) return;

  const msg =
    newStatus === "cancelled"
      ? `Cancel ${ids.length} order(s)?`
      : `Set ${ids.length} order(s) to "${newStatus}"?`;

  if (!window.confirm(msg)) return;

  setBulkWorking(true);
  let ok = 0;
  let fail = 0;

  try {
    for (const id of ids) {
      try {
        await api(`/api/orders/${id}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    if (fail === 0) toast.success(`Updated ${ok} order(s).`);
    else toast.message(`Updated ${ok}. Failed ${fail}.`);
  } finally {
    setBulkWorking(false);
    setBulkSelected(new Set());
    void loadOrders();
  }
}

async function bulkDelete() {
  const ids = Array.from(bulkSelected);
  if (!ids.length) return;

  if (!window.confirm(`Delete ${ids.length} order(s)? This cannot be undone.`)) return;

  setBulkWorking(true);
  let ok = 0;
  let fail = 0;

  try {
    for (const id of ids) {
      try {
        await api(`/api/orders/${id}`, { method: "DELETE" });
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    if (fail === 0) toast.success(`Deleted ${ok} order(s).`);
    else toast.message(`Deleted ${ok}. Failed ${fail}.`);
  } finally {
    setBulkWorking(false);
    setBulkSelected(new Set());
    setSelectedOrder(null);
    setSelectedOrderItems(null);
    void loadOrders();
  }
}

function exportSelectedCsv() {
  const ids = Array.from(bulkSelected);
  if (!ids.length) return;

  const rows = items.filter((o) => bulkSelected.has(o.id));
  if (!rows.length) return;

  const header = [
    "Order ID",
    "Order Code",
    "Customer Name",
    "Phone",
    "Status",
    "Payment Status",
    "Paid Amount",
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
        o.payment_status ?? "",
        o.paid_amount ?? "",
        o.total_tzs ?? "",
        o.delivery_mode ?? "",
        o.region ?? "",
        o.created_at ?? "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-selected-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success(`Exported ${rows.length} order(s).`);
}

async function deleteOrder(order: OrderListRow) {
    if (!window.confirm("Delete this order?")) return;

    try {
      await api(`/api/orders/${order.id}`, { method: "DELETE" });
      toast.success("Order deleted");
      if (selectedOrder?.id === order.id) {
        setSelectedOrder(null);
        setSelectedOrderItems(null);
      }
      void loadOrders();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete order");
    }
  }

  async function exportCsv() {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (phoneFilter.trim()) params.set("phone", phoneFilter.trim());

      if (showFilters) {
        if (product.trim()) params.set("product", product.trim());
        if (minTotal.trim()) params.set("min_total", minTotal.trim());
        if (maxTotal.trim()) params.set("max_total", maxTotal.trim());
      }

      params.set("limit", "500");
      const data = await api<{ items: OrderListRow[] }>(`/api/orders?${params.toString()}`);

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

      const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error("Failed to export");
    }
  }

  function openEdit(order: OrderListRow) {
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
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingOrder) return;

    if (editForm.status === "out_for_delivery" && !editForm.delivery_agent_phone.trim()) {
      toast.error("Rider phone is required when status is out_for_delivery.");
      return;
    }

    setEditSaving(true);
    try {
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

      await api(`/api/orders/${editingOrder.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editForm.status,
          delivery_agent_phone: editForm.delivery_agent_phone || undefined,
        }),
      });

      toast.success("Order updated.");
      setEditingOrder(null);
      void loadOrders();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to update order", {
        description: err?.message ?? "Tafadhali jaribu tena muda mfupi baadaye.",
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    setManualSaving(true);
    setManualError(null);

    try {
      const name = manual.customer_name.trim();
      const phone = manual.phone.trim();

      if (!name || !phone) {
        const msg = "Jina la mteja na namba ya simu ni lazima.";
        setManualError(msg);
        setManualSaving(false);
        toast.error(msg);
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
        setManualError(msg);
        setManualSaving(false);
        toast.error(msg);
        return;
      }

      for (const item of cleanedItems) {
        const p = products.find((x) => x.sku === item.sku);
        if (!p) continue;
        const stock = p.stock_qty ?? null;
        if (typeof stock === "number" && item.qty > stock) {
          const msg = `Kiasi cha "${p.name}" kinazidi stock (${stock}).`;
          setManualError(msg);
          setManualSaving(false);
          toast.error(msg);
          return;
        }
      }

      const payload = {
        customer_name: name,
        phone,
        location_type: manual.location_type,
        region: manual.region.trim(),
        delivery_mode: manual.location_type === "outside" ? "delivery" : manual.delivery_mode,
        items: cleanedItems,
      };

      await api("/api/orders/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast.success("Manual order imeundwa.");
      setManual({
        customer_name: "",
        phone: "",
        location_type: "within",
        region: "",
        delivery_mode: "pickup",
      });
      setManualItems([{ product_sku: "", qty: "1" }]);
      setShowManualForm(false);
      setManualSaving(false);
      void loadOrders();
    } catch (err: any) {
      console.error(err);
      const msg = err?.message ?? "Imeshindikana kuunda order. Jaribu tena.";
      setManualError(msg);
      setManualSaving(false);
      toast.error("Imeshindikana kuunda order.");
    }
  }

  const resultSummary = useMemo(() => {
    if (loading) return "Loading...";
    return `${items.length} shown · ${total} total`;
  }, [items.length, total, loading]);

  const selectedBadge = statusBadge(selectedOrder?.status ?? null);
  const paymentSelectedBadge = paymentBadge(
    selectedOrder?.payment_status,
    selectedOrder?.paid_amount,
    selectedOrder?.total_tzs ?? 0
  );
  const statusFilters = getStatusFilterOptions();

  const queueCards = useMemo(() => {
    const countByStatus = new Map<string, number>();
    for (const row of items) {
      const key = String(row.status ?? "");
      countByStatus.set(key, (countByStatus.get(key) ?? 0) + 1);
    }
    return [
      {
        title: "Pending queue",
        value: countByStatus.get("pending") ?? 0,
        hint: "New orders waiting for action",
      },
      {
        title: "Payment checks",
        value: countByStatus.get("verifying") ?? 0,
        hint: "Orders in verification",
      },
      {
        title: "Preparing",
        value: countByStatus.get("preparing") ?? 0,
        hint: "Orders being fulfilled",
      },
      {
        title: "Out for delivery",
        value: countByStatus.get("out_for_delivery") ?? 0,
        hint: "Rider-handled orders",
      },
    ];
  }, [items]);

  const selectedRemaining = useMemo(() => {
    if (!selectedOrder) return null;
    const paid = typeof selectedOrder.paid_amount === "number" ? selectedOrder.paid_amount : 0;
    return Math.max(0, selectedOrder.total_tzs - paid);
  }, [selectedOrder]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (q.trim()) count += 1;
    if (status) count += 1;
    if (phoneFilter.trim()) count += 1;
    if (showFilters && product.trim()) count += 1;
    if (showFilters && minTotal.trim()) count += 1;
    if (showFilters && maxTotal.trim()) count += 1;
    return count;
  }, [maxTotal, minTotal, phoneFilter, product, q, showFilters, status]);

  const selectedTitle = selectedOrder
    ? `#${selectedOrder.order_code || selectedOrder.id}`
    : "No order selected";

  function applyStatusSegment(nextStatus: string) {
    setStatus(nextStatus);
    setPage(1);
    void loadOrders();
  }

  const grouped = useMemo(() => {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  const buckets: Record<"today" | "yesterday" | "older", OrderListRow[]> = {
    today: [],
    yesterday: [],
    older: [],
  };

  for (const o of items) {
    const d = new Date(o.created_at);
    if (!Number.isNaN(d.getTime()) && d >= startToday) buckets.today.push(o);
    else if (!Number.isNaN(d.getTime()) && d >= startYesterday) buckets.yesterday.push(o);
    else buckets.older.push(o);
  }

  const out: { key: "today" | "yesterday" | "older"; title: string; rows: OrderListRow[] }[] = [];
  if (buckets.today.length) out.push({ key: "today", title: "Today", rows: buckets.today });
  if (buckets.yesterday.length) out.push({ key: "yesterday", title: "Yesterday", rows: buckets.yesterday });
  if (buckets.older.length) out.push({ key: "older", title: "Older", rows: buckets.older });
  return out;
}, [items]);


  return (
    <div className="orders-page">
      {/* Topbar */}
      <div className="orders-topbar">
        <div>
          <div className="orders-kicker">Order operations</div>
          <div className="orders-title">Orders console</div>
          <div className="orders-subtitle">
            Process new orders, payment checks, fulfillment, and delivery transitions from one operator workspace.
          </div>
        </div>

        <div className="orders-top-actions">
          <Link href="/inbox" className="or-btn or-btn-link">
            Inbox
          </Link>

          <button type="button" className="or-btn" onClick={() => void exportCsv()} disabled={loading}>
            Export CSV
          </button>

          <button
            type="button"
            className="or-btn or-btn-primary"
            onClick={() => {
              setManualError(null);
              setShowManualForm(true);
            }}
          >
            + New order
          </button>
        </div>
      </div>

      <div className="orders-queue-grid">
        {queueCards.map((card) => (
          <div key={card.title} className="or-queue-card">
            <div className="or-queue-label">{card.title}</div>
            <div className="or-queue-value">{card.value}</div>
            <div className="or-queue-hint">{card.hint}</div>
          </div>
        ))}
      </div>

      <div className="orders-segments" role="tablist" aria-label="Order status segments">
        {statusFilters.map((option) => {
          const active = status === option.key;
          return (
            <button
              key={option.label}
              type="button"
              className={"orders-segment" + (active ? " orders-segment--active" : "")}
              onClick={() => applyStatusSegment(option.key)}
            >
              <span className="orders-segment-title">{option.label}</span>
              <span className="orders-segment-hint">{option.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Controls */}
      <form className="orders-controls" onSubmit={applyFilters}>
        <div className="orders-controls-head">
          <div>
            <div className="orders-controls-kicker">Queue controls</div>
            <div className="orders-controls-title">Refine the active fulfillment queue</div>
            <div className="orders-controls-copy">
              Search, segment, and hand off the live order ledger without leaving the page.
            </div>
          </div>
          <div className="orders-controls-meta">
            <span className="orders-controls-count">{activeFilterCount} active</span>
            <span className="orders-controls-summary">{resultSummary}</span>
          </div>
        </div>

        <div className="orders-controls-grid">
        <div className="or-field" style={{ minWidth: 240 }}>
          <div className="or-field-label">Search</div>
          <input
            className="or-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, order code..."
          />
        </div>

        <div className="or-field">
          <div className="or-field-label">Status</div>
          <select className="or-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="preparing">Preparing</option>
            <option value="verifying">Verifying</option>
            <option value="out_for_delivery">Out for delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="or-field">
          <div className="or-field-label">Phone</div>
          <input
            className="or-input"
            value={phoneFilter}
            onChange={(e) => setPhoneFilter(e.target.value)}
            placeholder="+255..."
          />
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <button type="button" className="or-btn" onClick={() => setShowFilters((s) => !s)}>
            {showFilters ? "Hide filters" : "More filters"}
          </button>

          <button type="submit" className="or-btn or-btn-primary" disabled={loading}>
            Apply
          </button>

          <button type="button" className="or-btn" onClick={clearFilters}>
            Clear
          </button>
        </div>
        </div>

        {showFilters && (
          <div className="or-more-filters">
            <div className="or-field">
              <div className="or-field-label">Product (name/SKU)</div>
              <input
                className="or-input"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Ujani herbal tea"
              />
            </div>

            <div className="or-field">
              <div className="or-field-label">Min total (TZS)</div>
              <input
                className="or-input"
                type="number"
                value={minTotal}
                onChange={(e) => setMinTotal(e.target.value)}
              />
            </div>

            <div className="or-field">
              <div className="or-field-label">Max total (TZS)</div>
              <input
                className="or-input"
                type="number"
                value={maxTotal}
                onChange={(e) => setMaxTotal(e.target.value)}
              />
            </div>

            <div className="or-field" style={{ alignSelf: "end" }}>
              <div className="or-field-label">Tip</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--or-muted)" }}>
                Keep filters minimal for faster search.
              </div>
            </div>
          </div>
        )}
      </form>

      {/* Main shell */}
      <div className="orders-shell">
        {/* Left: Table */}
        <div className="or-card">
          <div className="or-card-header">
            <div>
              <div className="or-card-title">Fulfillment ledger</div>
              <div className="or-card-sub">Live operational queue for payment, packing, and delivery handoff.</div>
            </div>

            <div className="or-card-header-meta">
              <span className="or-ledger-summary">{resultSummary}</span>
              {error ? <div className="or-inline-alert">{error}</div> : null}
            </div>
          </div>

          {bulkSelected.size > 0 && (
  <div className="or-bulk">
    <div className="or-bulk-left">
      <span className="or-bulk-count">
        {bulkSelected.size} selected
      </span>
      <span className="or-bulk-tip">Tip: Shift-click to select a range</span>
      <button
        type="button"
        className="or-bulk-link"
        onClick={() => setBulkSelected(new Set())}
        disabled={bulkWorking || loading}
      >
        Clear
      </button>
    </div>

    <div className="or-bulk-actions">
      <button
        type="button"
        className="or-btn"
        onClick={() => void bulkSetStatus("preparing")}
        disabled={bulkWorking || loading}
      >
        Preparing
      </button>

      <button
        type="button"
        className="or-btn"
        onClick={() => void bulkSetStatus("delivered")}
        disabled={bulkWorking || loading}
      >
        Delivered
      </button>

      <button
        type="button"
        className="or-btn"
        onClick={() => void bulkSetStatus("cancelled")}
        disabled={bulkWorking || loading}
      >
        Cancel
      </button>

      <button
        type="button"
        className="or-btn"
        onClick={() => exportSelectedCsv()}
        disabled={bulkWorking || loading}
      >
        Export
      </button>

      <button
        type="button"
        className="or-btn or-btn-danger"
        onClick={() => void bulkDelete()}
        disabled={bulkWorking || loading}
      >
        Delete
      </button>
    </div>
  </div>
)}

          <div className="or-table-wrap">
            <table className="or-table">
              <thead>
                <tr>
                  <th className="or-th-check">
  <input
    type="checkbox"
    className="or-check"
    checked={allVisibleSelected}
    onChange={(e) => setAllVisible(e.target.checked)}
    aria-label="Select all visible"
  />
</th>

                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Mode</th>
                  <th>Delivery</th>
                  <th className="or-td-right">Total</th>
                  <th>Created</th>
                  <th className="or-td-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <tr key={`loading-${index}`} className="or-row or-row--loading">
                      <td colSpan={10}>
                        <div className="or-loading-row">
                          <div className="or-loading-row__main">
                            <span className="or-loading-line or-loading-line--sm" />
                            <span className="or-loading-line or-loading-line--md" />
                          </div>
                          <div className="or-loading-row__meta">
                            <span className="or-loading-pill" />
                            <span className="or-loading-pill" />
                            <span className="or-loading-line or-loading-line--sm" />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="or-table-empty">
                      <div className="or-empty-state or-empty-state--table">
                        <div className="or-empty-title">No orders match this queue.</div>
                        <div className="or-empty">
                          Try clearing filters or switch to a broader status segment to reopen the active workload.
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
  grouped.map((group) => (
    <Fragment key={group.key}>
      <tr key={`grp-${group.key}`} className="or-group-row">
        <td colSpan={10}>{group.title}</td>
      </tr>

      {group.rows.map((order) => {
        const b = statusBadge(order.status);
        const pay = paymentBadge(order.payment_status, order.paid_amount, order.total_tzs);
        const isSel = selectedOrder?.id === order.id;

        const canPrep =
          order.status !== "preparing" && order.status !== "delivered" && order.status !== "cancelled";
        const canDeliver = order.status !== "delivered" && order.status !== "cancelled";

        return (
          <tr
            key={order.id}
            className={"or-row" + (isSel ? " or-row--selected" : "")}
            onClick={() => void selectOrder(order)}
          >
            <td className="or-td-check" onClick={(e) => e.stopPropagation()}>
  <input
    type="checkbox"
    className="or-check"
    checked={bulkSelected.has(order.id)}
    onClick={(e) => {
  e.stopPropagation();
  e.preventDefault();
  toggleBulk(order.id, (e as any).shiftKey === true);
}}
onChange={() => {}}

    aria-label={`Select order ${order.order_code || order.id}`}
  />
</td>

            <td>
              <button type="button" className="or-order-link" onClick={() => void selectOrder(order)}>
                #{order.order_code || order.id}
              </button>
            </td>

            <td>
              <div className="or-customer">
                <div className="or-customer-name">{order.customer_name || "—"}</div>
                <div className="or-customer-phone">
                  {order.phone ? formatPhonePretty(order.phone) : "—"}
                </div>
              </div>
            </td>

            <td>
              <span className={b.className}>{b.label}</span>
            </td>

            <td>
              <span className={pay.className}>{pay.label}</span>
            </td>

            <td>
              {order.delivery_mode ? (
                <span className="or-pill">{order.delivery_mode}</span>
              ) : (
                <span style={{ color: "var(--or-muted)" }}>—</span>
              )}
            </td>

            <td>
              <div className="or-delivery-cell">
                <div className="or-delivery-primary">{order.region || "No destination"}</div>
                <div className="or-delivery-secondary">
                  {order.delivery_agent_phone
                    ? `Rider ${formatPhonePretty(order.delivery_agent_phone)}`
                    : order.delivery_mode === "delivery"
                    ? "Awaiting rider"
                    : "Pickup"}
                </div>
              </div>
            </td>

            <td className="or-td-right">{formatTzs(order.total_tzs)} TZS</td>
            <td>
              <div className="or-time-cell">
                <div>{formatRelativeDate(order.created_at)}</div>
                <div className="or-time-sub">{formatDateTime(order.created_at)}</div>
              </div>
            </td>

            <td className="or-td-right">
              <div className="or-actions" onClick={(e) => e.stopPropagation()}>
                {/* Quick actions */}
                <button
                  type="button"
                  className="or-row-action"
                  title="Prep"
                  disabled={!canPrep}
                  onClick={() => void setOrderStatus(order, "preparing")}
                >
                  🧑‍🍳
                </button>

                <button
                  type="button"
                  className="or-row-action"
                  title="Done"
                  disabled={!canDeliver}
                  onClick={() => void setOrderStatus(order, "delivered")}
                >
                  ✅
                </button>

                {/* Existing actions */}
                <button type="button" className="or-row-action" title="Edit" onClick={() => openEdit(order)}>
                  ✏️
                </button>
                <button type="button" className="or-row-action" title="Cancel" onClick={() => void cancelOrder(order)}>
                  ❌
                </button>
                <button type="button" className="or-row-action or-row-action--danger" title="Delete" onClick={() => void deleteOrder(order)}>
                  🗑️
                </button>
              </div>
            </td>
          </tr>
        );
      })}
    </Fragment>
  ))
)
}
              </tbody>
            </table>
          </div>

          <div className="or-pagination">
            <div>
              Page <strong>{page}</strong> of <strong>{Math.max(1, totalPages)}</strong>
              {" · "}
              <span>{total} orders</span>
            </div>

            <div className="or-pagination-actions">
              <button
                type="button"
                className="or-btn"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>

              <button
                type="button"
                className="or-btn"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Right: Details */}
        <aside className="or-card">
          <div className="or-card-header">
            <div>
              <div className="or-card-title">Active order</div>
              <div className="or-card-sub">{selectedTitle}</div>
            </div>

            {selectedOrder ? <span className={selectedBadge.className}>{selectedBadge.label}</span> : null}
          </div>

          <div className="or-card-body">
            {!selectedOrder ? (
              <div className="or-empty-state">
                <div className="or-empty-title">Pick an order to open the detail rail.</div>
                <div className="or-empty">
                  Review customer info, delivery progress, payment state, product lines, and operator notes without leaving the list.
                </div>
                <div className="or-empty-callout">
                  Keep the queue on the left and use this sidecar for payment checks, delivery handoff, and customer context.
                </div>
              </div>
            ) : (
              <>
                <div className="or-detail-hero">
                  <div className="or-detail-top">
                    <div>
                      <div className="or-detail-code">#{selectedOrder.order_code || selectedOrder.id}</div>
                      <div className="or-detail-customer">{selectedOrder.customer_name || "Unknown customer"}</div>
                      <div className="or-detail-phone">
                        {selectedOrder.phone ? formatPhonePretty(selectedOrder.phone) : "No phone on record"}
                      </div>
                    </div>
                    <div className="or-detail-badges">
                      <span className={selectedBadge.className}>{selectedBadge.label}</span>
                      <span className={paymentSelectedBadge.className}>{paymentSelectedBadge.label}</span>
                    </div>
                  </div>

                  <div className="or-detail-stats">
                    <div className="or-detail-stat">
                      <div className="or-detail-stat-label">Order total</div>
                      <div className="or-detail-stat-value">{formatTzs(selectedOrder.total_tzs)} TZS</div>
                    </div>
                    <div className="or-detail-stat">
                      <div className="or-detail-stat-label">Paid</div>
                      <div className="or-detail-stat-value">
                        {typeof selectedOrder.paid_amount === "number" ? `${formatTzs(selectedOrder.paid_amount)} TZS` : "—"}
                      </div>
                    </div>
                    <div className="or-detail-stat">
                      <div className="or-detail-stat-label">Remaining</div>
                      <div className="or-detail-stat-value">
                        {selectedRemaining != null ? `${formatTzs(selectedRemaining)} TZS` : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="or-section-block">
                  <div className="or-section-heading">Order overview</div>
                <div className="or-kv">
                  <div className="or-kv-item">
                    <div className="or-kv-label">Customer</div>
                    <div className="or-kv-value">{selectedOrder.customer_name || "—"}</div>
                  </div>

                  <div className="or-kv-item">
                    <div className="or-kv-label">Phone</div>
                    <div className="or-kv-value">{selectedOrder.phone ? formatPhonePretty(selectedOrder.phone) : "—"}</div>
                  </div>

                  <div className="or-kv-item">
                    <div className="or-kv-label">Total</div>
                    <div className="or-kv-value">{formatTzs(selectedOrder.total_tzs)} TZS</div>
                  </div>

                  <div className="or-kv-item">
  <div className="or-kv-label">Paid amount</div>
  <div className="or-kv-value">
    {typeof selectedOrder.paid_amount === "number" ? `${formatTzs(selectedOrder.paid_amount)} TZS` : "—"}
  </div>
</div>


                  <div className="or-kv-item">
                    <div className="or-kv-label">Created</div>
                    <div className="or-kv-value">{formatDateTime(selectedOrder.created_at)}</div>
                  </div>

                  <div className="or-kv-item">
                    <div className="or-kv-label">Mode</div>
                    <div className="or-kv-value">{selectedOrder.delivery_mode || "—"}</div>
                  </div>

                  <div className="or-kv-item">
                    <div className="or-kv-label">Region</div>
                    <div className="or-kv-value">{selectedOrder.region || "—"}</div>
                  </div>

                  <div className="or-kv-item">
                    <div className="or-kv-label">Rider</div>
                    <div className="or-kv-value">
                      {selectedOrder.delivery_agent_phone ? formatPhonePretty(selectedOrder.delivery_agent_phone) : "—"}
                    </div>
                  </div>
                </div>
                </div>

                <div className="or-detail-actions">
                  <button
                    type="button"
                    className="or-btn"
                    onClick={() => void setOrderStatus(selectedOrder, "preparing")}
                    disabled={selectedOrder.status === "preparing" || selectedOrder.status === "delivered" || selectedOrder.status === "cancelled"}
                  >
                    Mark preparing
                  </button>
                  <button
                    type="button"
                    className="or-btn"
                    onClick={() => openEdit(selectedOrder)}
                  >
                    Edit order
                  </button>
                  {selectedOrder.phone ? (
                    <Link
                      href={`/inbox?phone=${encodeURIComponent(selectedOrder.phone)}`}
                      className="or-btn or-btn-link"
                    >
                      Open in Inbox
                    </Link>
                  ) : null}
                </div>

                <div className="or-items">
                  <div className="or-section-heading">Products</div>

                  {!selectedOrderItems ? (
                    <div className="or-items-loading">
                      <div className="or-loading-line or-loading-line--md" />
                      <div className="or-loading-line or-loading-line--lg" />
                      <div className="or-loading-line or-loading-line--sm" />
                    </div>
                  ) : selectedOrderItems.length === 0 ? (
                    <div className="or-items-empty">No items found.</div>
                  ) : (
                    <div className="or-items-list">
                      {selectedOrderItems.map((it) => (
                        <div key={`${it.sku}-${it.name}`} className="or-item">
                          <div className="or-item-name">{it.name}</div>
                          <div className="or-item-qty">x{it.qty}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="or-items">
                  <div className="or-section-heading">Timeline and notes</div>
                  <OperatorTimelineNotes
                    title="Timeline & Notes"
                    timelinePath={selectedOrder ? `/api/orders/${selectedOrder.id}/timeline` : null}
                    notePath={selectedOrder ? `/api/orders/${selectedOrder.id}/notes` : null}
                    emptyState="No operator history yet for this order."
                    notePlaceholder="Add an internal order note for fulfillment, payment review, or customer context."
                    refreshKey={selectedOrder?.id ?? null}
                  />
                </div>

                <div className="or-items" style={{ borderTop: "none", paddingTop: 12 }}>
                  <div className="or-section-heading">Administrative actions</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" className="or-btn or-btn-danger" onClick={() => void deleteOrder(selectedOrder)}>
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* ======================
          Manual order modal
         ====================== */}
      {showManualForm && (
        <div className="or-modal-backdrop" role="dialog" aria-modal="true">
          <div className="or-modal">
            <div className="or-modal-header">
              <div>
                <div className="or-modal-title">New manual order</div>
                <div className="or-modal-sub">For phone calls / walk-ins. Keep details short and accurate.</div>
              </div>

              <button
                type="button"
                className="or-close"
                onClick={() => {
                  setShowManualForm(false);
                  setManualError(null);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form className="or-form" onSubmit={(e) => void saveManual(e)}>
              {manualError ? <div className="or-error">{manualError}</div> : null}

              <div className="or-form-grid">
                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Customer name</div>
                  <input
                    className="or-input"
                    value={manual.customer_name}
                    onChange={(e) => setManual((m) => ({ ...m, customer_name: e.target.value }))}
                    placeholder="Mfano: Asha Mohamed"
                  />
                </div>

                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Phone</div>
                  <input
                    className="or-input"
                    value={manual.phone}
                    onChange={(e) => setManual((m) => ({ ...m, phone: e.target.value }))}
                    placeholder="07XXXXXXXX"
                  />
                </div>

                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Location type</div>
                  <select
                    className="or-select"
                    value={manual.location_type}
                    onChange={(e) =>
                      setManual((m) => ({ ...m, location_type: e.target.value as "within" | "outside" }))
                    }
                  >
                    <option value="within">Within Dar es Salaam</option>
                    <option value="outside">Outside region</option>
                  </select>
                </div>

                {manual.location_type === "within" ? (
                  <div className="or-field" style={{ minWidth: "unset" }}>
                    <div className="or-field-label">Delivery mode</div>
                    <select
                      className="or-select"
                      value={manual.delivery_mode}
                      onChange={(e) =>
                        setManual((m) => ({ ...m, delivery_mode: e.target.value as "pickup" | "delivery" }))
                      }
                    >
                      <option value="delivery">Delivery</option>
                      <option value="pickup">Pickup</option>
                    </select>
                  </div>
                ) : (
                  <div className="or-field" style={{ minWidth: "unset" }}>
                    <div className="or-field-label">Delivery mode</div>
                    <input className="or-input" value="delivery" disabled />
                  </div>
                )}

                <div className="or-field" style={{ minWidth: "unset", gridColumn: "1 / -1" }}>
                  <div className="or-field-label">
                    {manual.location_type === "within" ? "Address (Dar)" : "Region / Area"}
                  </div>
                  <input
                    className="or-input"
                    value={manual.region}
                    onChange={(e) => setManual((m) => ({ ...m, region: e.target.value }))}
                    placeholder={manual.location_type === "within" ? "Mfano: Mbagala, Kilungule" : "Mfano: Morogoro, Dodoma…"}
                  />
                </div>
              </div>

              <div className="or-form-row">
                <div className="or-form-note">Products</div>
                <button
                  type="button"
                  className="or-btn"
                  onClick={() => setManualItems((rows) => [...rows, { product_sku: "", qty: "1" }])}
                >
                  + Add product
                </button>
              </div>

              <div className="or-items-edit">
                {manualItems.map((row, idx) => {
                  const productObj = products.find((p) => p.sku === row.product_sku) ?? null;
                  const stock = productObj?.stock_qty ?? null;
                  const qtyNum = Number(row.qty || "0") || 0;
                  const stockBad = typeof stock === "number" && qtyNum > stock;

                  return (
                    <div key={idx} className="or-item-row">
                      <div className="or-field" style={{ minWidth: "unset" }}>
                        <div className="or-field-label">Product</div>
                        <select
                          className="or-select"
                          value={row.product_sku}
                          onChange={(e) =>
                            setManualItems((rows) =>
                              rows.map((it, i) => (i === idx ? { ...it, product_sku: e.target.value } : it))
                            )
                          }
                        >
                          <option value="">Select product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.sku}>
                              {p.name} — {p.price_tzs.toLocaleString("sw-TZ")} TZS
                              {typeof p.stock_qty === "number" ? ` (stock: ${p.stock_qty})` : ""}
                            </option>
                          ))}
                        </select>

                        {stockBad ? (
                          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 650, color: "#b91c1c" }}>
                            Quantity exceeds stock ({stock})
                          </div>
                        ) : null}
                      </div>

                      <div className="or-field" style={{ minWidth: "unset" }}>
                        <div className="or-field-label">Qty</div>
                        <input
                          className="or-input"
                          type="number"
                          min={1}
                          value={row.qty}
                          onChange={(e) =>
                            setManualItems((rows) =>
                              rows.map((it, i) =>
                                i === idx ? { ...it, qty: e.target.value.replace(/[^\d]/g, "") } : it
                              )
                            )
                          }
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        {manualItems.length > 1 ? (
                          <button
                            type="button"
                            className="or-mini"
                            title="Remove"
                            onClick={() => setManualItems((rows) => rows.filter((_, i) => i !== idx))}
                          >
                            ✕
                          </button>
                        ) : (
                          <div style={{ height: 38 }} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="or-form-row">
                <div className="or-form-note">
                  Total: <strong>{manualTotal > 0 ? `${manualTotal.toLocaleString("sw-TZ")} TZS` : "—"}</strong>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className="or-btn"
                    onClick={() => {
                      setShowManualForm(false);
                      setManualError(null);
                    }}
                  >
                    Cancel
                  </button>

                  <button type="submit" className="or-btn or-btn-primary" disabled={manualSaving}>
                    {manualSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================
          Edit modal
         ====================== */}
      {editingOrder && (
        <div className="or-modal-backdrop" role="dialog" aria-modal="true">
          <div className="or-modal">
            <div className="or-modal-header">
              <div>
                <div className="or-modal-title">Edit order #{editingOrder.order_code || editingOrder.id}</div>
                <div className="or-modal-sub">Update key fields only (keeps admin work fast).</div>
              </div>

              <button type="button" className="or-close" onClick={() => setEditingOrder(null)} aria-label="Close">
                ✕
              </button>
            </div>

            <form className="or-form" onSubmit={(e) => void saveEdit(e)}>
              <div className="or-form-grid">
                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Customer name</div>
                  <input
                    className="or-input"
                    value={editForm.customer_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, customer_name: e.target.value }))}
                  />
                </div>

                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Phone</div>
                  <input
                    className="or-input"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>

                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Status</div>
                  <select
                    className="or-select"
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="pending">Pending</option>
                    <option value="preparing">Preparing</option>
                    <option value="verifying">Verifying</option>
                    <option value="out_for_delivery">Out for delivery</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Mode</div>
                  <select
                    className="or-select"
                    value={editForm.delivery_mode}
                    onChange={(e) => setEditForm((f) => ({ ...f, delivery_mode: e.target.value }))}
                  >
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>

                <div className="or-field" style={{ minWidth: "unset", gridColumn: "1 / -1" }}>
                  <div className="or-field-label">Region / Address</div>
                  <input
                    className="or-input"
                    value={editForm.region}
                    onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))}
                    placeholder="Mfano: Keko, Kigamboni…"
                  />
                </div>

                {editForm.delivery_mode === "delivery" ? (
                  <>
                    <div className="or-field" style={{ minWidth: "unset" }}>
                      <div className="or-field-label">Distance (km)</div>
                      <input
                        className="or-input"
                        type="number"
                        value={editForm.km}
                        onChange={(e) => setEditForm((f) => ({ ...f, km: e.target.value }))}
                      />
                    </div>

                    <div className="or-field" style={{ minWidth: "unset" }}>
                      <div className="or-field-label">Delivery fee (TZS)</div>
                      <input
                        className="or-input"
                        type="number"
                        value={editForm.fee_tzs}
                        onChange={(e) => setEditForm((f) => ({ ...f, fee_tzs: e.target.value }))}
                      />
                    </div>
                  </>
                ) : null}

                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Total (TZS)</div>
                  <input
                    className="or-input"
                    type="number"
                    value={editForm.total_tzs}
                    onChange={(e) => setEditForm((f) => ({ ...f, total_tzs: e.target.value }))}
                  />
                </div>

                <div className="or-field" style={{ minWidth: "unset" }}>
                  <div className="or-field-label">Rider phone (if out_for_delivery)</div>
                  <input
                    className="or-input"
                    value={editForm.delivery_agent_phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, delivery_agent_phone: e.target.value }))}
                    placeholder="+255…"
                  />
                </div>
              </div>

              <div className="or-form-row">
                <div className="or-form-note">Tip: Keep totals accurate (products + delivery).</div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className="or-btn" onClick={() => setEditingOrder(null)} disabled={editSaving}>
                    Cancel
                  </button>

                  <button type="submit" className="or-btn or-btn-primary" disabled={editSaving}>
                    {editSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
