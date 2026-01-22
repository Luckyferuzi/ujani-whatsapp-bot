"use client";

import { Fragment,useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, get, post } from "@/lib/api";
import { socket } from "@/lib/socket";
import { toast } from "sonner";

type Product = {
  id: number;
  sku: string; // exists in backend; kept for search only (not shown)
  name: string;
  price_tzs: number;
  description: string;
  description_en: string | null;
  is_installment: boolean;
  is_active: boolean;
  stock_qty: number | null;
  created_at?: string;
};

type ListResponse = { items: Product[] };
type SingleResponse = { product: Product };

type ProductForm = {
  name: string;
  price_tzs: string;
  stock_qty: string;
  description: string;
  description_en: string;
  is_installment: boolean;
  is_active: boolean;
};

const emptyForm: ProductForm = {
  name: "",
  price_tzs: "",
  stock_qty: "",
  description: "",
  description_en: "",
  is_installment: false,
  is_active: true,
};

type StatusFilter = "all" | "active" | "inactive";
type StockFilter = "all" | "low" | "out";

const LOW_STOCK_THRESHOLD = 5;

function formatTzs(value: number): string {
  return Math.floor(value).toLocaleString("sw-TZ");
}

function stockBadge(stock_qty: number | null) {
  const s = stock_qty ?? 0;
  if (s === 0) return { label: "Out", className: "pr-badge pr-badge--out" };
  if (s > 0 && s <= LOW_STOCK_THRESHOLD) return { label: `Low (${s})`, className: "pr-badge pr-badge--low" };
  return { label: String(s), className: "pr-badge pr-badge--stockok" };
}

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
const [bulkWorking, setBulkWorking] = useState(false);
const [bulkStock, setBulkStock] = useState<string>("");
const [bulkAnchorIndex, setBulkAnchorIndex] = useState<number | null>(null);

  // Quick stock update in details panel
  const [stockEdit, setStockEdit] = useState<string>("");

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const res = await get<ListResponse>("/api/products");
      setItems(res.items ?? []);
      setBulkSelected((prev) => {
  const next = new Set<number>();
  for (const p of res.items ?? []) {
    if (prev.has(p.id)) next.add(p.id);
  }
  return next;
});

      // Keep selection if still exists
      setSelectedId((prev) => (prev != null && (res.items ?? []).some((p) => p.id === prev) ? prev : null));
    } catch (err: any) {
      console.error("Failed to load products", err);
      const msg = err?.message ?? "Imeshindikana kupakia bidhaa. Jaribu tena.";
      setError(msg);
      toast.error("Imeshindikana kupakia bidhaa.", { description: "Jaribu tena muda mfupi." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  // Auto-refresh when backend notifies products/stock changed
  useEffect(() => {
    const s = socket();
    if (!s) return;

    const handler = () => void loadProducts();
    s.on("products.updated", handler);

    return () => {
      s.off("products.updated", handler);
    };
  }, []);

  const selected = useMemo(() => {
    return selectedId == null ? null : items.find((p) => p.id === selectedId) ?? null;
  }, [items, selectedId]);

  useEffect(() => {
    if (!selected) {
      setStockEdit("");
      return;
    }
    setStockEdit(selected.stock_qty != null ? String(selected.stock_qty) : "0");
  }, [selected]);

  const stats = useMemo(() => {
    const total = items.length;
    const active = items.filter((p) => p.is_active).length;
    const out = items.filter((p) => (p.stock_qty ?? 0) === 0).length;
    const low = items.filter((p) => {
      const s = p.stock_qty ?? 0;
      return s > 0 && s <= LOW_STOCK_THRESHOLD;
    }).length;

    return { total, active, low, out };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((p) => {
      // Search (name/sku/description)
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.description ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }

      // Status filter
      if (statusFilter === "active" && !p.is_active) return false;
      if (statusFilter === "inactive" && p.is_active) return false;

      // Stock filter
      const s = p.stock_qty ?? 0;
      if (stockFilter === "out" && s !== 0) return false;
      if (stockFilter === "low" && !(s > 0 && s <= LOW_STOCK_THRESHOLD)) return false;

      return true;
    });
  }, [items, search, statusFilter, stockFilter]);

const filteredIdToIndex = useMemo(() => {
  const m = new Map<number, number>();
  filtered.forEach((p, idx) => m.set(p.id, idx));
  return m;
}, [filtered]);


  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name ?? "",
      price_tzs: String(p.price_tzs ?? ""),
      stock_qty: p.stock_qty != null ? String(p.stock_qty) : "0",
      description: p.description ?? "",
      description_en: p.description_en ?? "",
      is_installment: !!p.is_installment,
      is_active: !!p.is_active,
    });
    setShowModal(true);
  }

  async function handleDelete(p: Product) {
    const ok = window.confirm(`Delete "${p.name}"? This cannot be undone.`);
    if (!ok) return;

    try {
      await api(`/api/products/${p.id}`, { method: "DELETE" });
      toast.success("Product deleted.");
      if (selectedId === p.id) setSelectedId(null);
      void loadProducts();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to delete product.", { description: err?.message ?? "Try again." });
    }
  }

  async function toggleActive(p: Product) {
    try {
      const payload = {
        name: p.name,
        price_tzs: p.price_tzs,
        stock_qty: p.stock_qty ?? 0,
        description: p.description ?? "",
        description_en: p.description_en ?? "",
        is_installment: !!p.is_installment,
        is_active: !p.is_active,
      };

      await api<SingleResponse>(`/api/products/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast.success(payload.is_active ? "Product activated." : "Product deactivated.");
      void loadProducts();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to update status.", { description: err?.message ?? "Try again." });
    }
  }

  async function saveStockOnly() {
    if (!selected) return;

    const stockNumeric = stockEdit.trim() === "" ? 0 : Number(stockEdit);
    if (!Number.isFinite(stockNumeric) || stockNumeric < 0) {
      toast.error("Invalid stock quantity.");
      return;
    }

    try {
      const payload = {
        name: selected.name,
        price_tzs: selected.price_tzs,
        stock_qty: Math.floor(stockNumeric),
        description: selected.description ?? "",
        description_en: selected.description_en ?? "",
        is_installment: !!selected.is_installment,
        is_active: !!selected.is_active,
      };

      await api<SingleResponse>(`/api/products/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast.success("Stock updated.");
      void loadProducts();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to update stock.", { description: err?.message ?? "Try again." });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const name = form.name.trim();
      if (!name) {
        setSaving(false);
        toast.error("Product name is required.");
        return;
      }

      const priceNumeric = Number(form.price_tzs);
      if (!Number.isFinite(priceNumeric) || priceNumeric <= 0) {
        setSaving(false);
        toast.error("Invalid price (must be > 0).");
        return;
      }

      const stockNumeric = form.stock_qty.trim() === "" ? 0 : Number(form.stock_qty);
      if (!Number.isFinite(stockNumeric) || stockNumeric < 0) {
        setSaving(false);
        toast.error("Invalid stock (must be >= 0).");
        return;
      }

      const payload = {
        name,
        price_tzs: Math.floor(priceNumeric),
        stock_qty: Math.floor(stockNumeric),
        description: form.description ?? "",
        description_en: form.description_en ?? "",
        is_installment: !!form.is_installment,
        is_active: !!form.is_active,
      };

      const isNew = editingId == null;

      if (isNew) {
        await post<SingleResponse>("/api/products", payload);
      } else {
        await api<SingleResponse>(`/api/products/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      toast.success(isNew ? "Product created." : "Product updated.");
      setShowModal(false);
      setEditingId(null);
      setForm(emptyForm);
      void loadProducts();
    } catch (err: any) {
      console.error("Failed to save product", err);
      const msg = err?.message ?? "Imeshindikana kuhifadhi bidhaa. Jaribu tena.";
      setError(msg);
      toast.error("Failed to save product.", { description: msg });
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const rows = filtered;

    const header = [
      "Product ID",
      "SKU",
      "Name",
      "Price TZS",
      "Stock",
      "Installment",
      "Active",
    ];

    const csvLines = [
      header.join(","),
      ...rows.map((p) =>
        [
          p.id,
          p.sku ?? "",
          p.name ?? "",
          p.price_tzs ?? "",
          p.stock_qty ?? 0,
          p.is_installment ? "yes" : "no",
          p.is_active ? "yes" : "no",
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${rows.length} product(s).`);
  }

function toggleBulk(id: number, shiftKey: boolean) {
  const idx = filteredIdToIndex.get(id);
  const has = bulkSelected.has(id);
  const targetChecked = !has;

  setBulkSelected((prev) => {
    const next = new Set(prev);

    // Shift range selection (only within current filtered/visible list)
    if (shiftKey && bulkAnchorIndex != null && idx != null) {
      const start = Math.min(bulkAnchorIndex, idx);
      const end = Math.max(bulkAnchorIndex, idx);

      for (let i = start; i <= end; i += 1) {
        const rowId = filtered[i]?.id;
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

  setBulkAnchorIndex(idx ?? null);
}


const allVisibleSelected = useMemo(() => {
  if (!filtered.length) return false;
  for (const p of filtered) {
    if (!bulkSelected.has(p.id)) return false;
  }
  return true;
}, [filtered, bulkSelected]);

function setAllVisible(checked: boolean) {
  if (!checked) {
    setBulkSelected(new Set());
    setBulkAnchorIndex(null);
    return;
  }
  setBulkSelected(new Set(filtered.map((p) => p.id)));
  setBulkAnchorIndex(filtered.length ? 0 : null);
}


async function bulkSetActive(is_active: boolean) {
  const ids = Array.from(bulkSelected);
  if (!ids.length) return;

  if (!window.confirm(`${is_active ? "Activate" : "Deactivate"} ${ids.length} product(s)?`)) return;

  setBulkWorking(true);
  let ok = 0;
  let fail = 0;

  try {
    for (const id of ids) {
      const p = items.find((x) => x.id === id);
      if (!p) continue;

      const payload = {
        name: p.name,
        price_tzs: p.price_tzs,
        stock_qty: p.stock_qty ?? 0,
        description: p.description ?? "",
        description_en: p.description_en ?? "",
        is_installment: !!p.is_installment,
        is_active,
      };

      try {
        await api(`/api/products/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    if (fail === 0) toast.success(`Updated ${ok} product(s).`);
    else toast.message(`Updated ${ok}. Failed ${fail}.`);
  } finally {
    setBulkWorking(false);
    setBulkSelected(new Set());
    void loadProducts();
  }
}

async function bulkSetStock() {
  const ids = Array.from(bulkSelected);
  if (!ids.length) return;

  const stockNumeric = bulkStock.trim() === "" ? NaN : Number(bulkStock);
  if (!Number.isFinite(stockNumeric) || stockNumeric < 0) {
    toast.error("Enter a valid stock number (0 or more).");
    return;
  }

  if (!window.confirm(`Set stock = ${Math.floor(stockNumeric)} for ${ids.length} product(s)?`)) return;

  setBulkWorking(true);
  let ok = 0;
  let fail = 0;

  try {
    for (const id of ids) {
      const p = items.find((x) => x.id === id);
      if (!p) continue;

      const payload = {
        name: p.name,
        price_tzs: p.price_tzs,
        stock_qty: Math.floor(stockNumeric),
        description: p.description ?? "",
        description_en: p.description_en ?? "",
        is_installment: !!p.is_installment,
        is_active: !!p.is_active,
      };

      try {
        await api(`/api/products/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    if (fail === 0) toast.success(`Updated stock for ${ok} product(s).`);
    else toast.message(`Updated ${ok}. Failed ${fail}.`);
  } finally {
    setBulkWorking(false);
    setBulkSelected(new Set());
    setBulkStock("");
    void loadProducts();
  }
}

async function bulkDelete() {
  const ids = Array.from(bulkSelected);
  if (!ids.length) return;

  if (!window.confirm(`Delete ${ids.length} product(s)? This cannot be undone.`)) return;

  setBulkWorking(true);
  let ok = 0;
  let fail = 0;

  try {
    for (const id of ids) {
      try {
        await api(`/api/products/${id}`, { method: "DELETE" });
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    if (fail === 0) toast.success(`Deleted ${ok} product(s).`);
    else toast.message(`Deleted ${ok}. Failed ${fail}.`);
  } finally {
    setBulkWorking(false);
    setBulkSelected(new Set());
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
    void loadProducts();
  }
}

function exportSelectedCsv() {
  const rows = filtered.filter((p) => bulkSelected.has(p.id));
  if (!rows.length) return;

  const header = ["Product ID", "SKU", "Name", "Price TZS", "Stock", "Installment", "Active"];

  const csvLines = [
    header.join(","),
    ...rows.map((p) =>
      [
        p.id,
        p.sku ?? "",
        p.name ?? "",
        p.price_tzs ?? "",
        p.stock_qty ?? 0,
        p.is_installment ? "yes" : "no",
        p.is_active ? "yes" : "no",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `products-selected-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success(`Exported ${rows.length} product(s).`);
}



  return (
    <div className="products-page">
      {/* Topbar */}
      <div className="pr-topbar">
        <div>
          <div className="pr-title">Products</div>
          <div className="pr-subtitle">
            Manage product name, price, stock, installment, and active status — in a clear admin view.
          </div>
        </div>

        <div className="pr-top-actions">
          <Link href="/orders" className="pr-btn" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
            ← Orders
          </Link>

          <button type="button" className="pr-btn" onClick={exportCsv} disabled={loading}>
            Export CSV
          </button>

          <button type="button" className="pr-btn pr-btn-primary" onClick={openNew}>
            + New product
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="pr-controls">
        <div className="pr-field" style={{ minWidth: 260 }}>
          <div className="pr-label">Search</div>
          <input
            className="pr-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, SKU, description…"
          />
        </div>

        <div className="pr-field">
          <div className="pr-label">Status</div>
          <select className="pr-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>

        <div className="pr-field">
          <div className="pr-label">Stock</div>
          <select className="pr-select" value={stockFilter} onChange={(e) => setStockFilter(e.target.value as StockFilter)}>
            <option value="all">All</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </div>

        <div className="pr-chips" style={{ marginLeft: "auto" }}>
          <button
            type="button"
            className={"pr-chip" + (stockFilter === "all" ? " pr-chip--active" : "")}
            onClick={() => setStockFilter("all")}
          >
            Total: {stats.total}
          </button>
          <button
            type="button"
            className="pr-chip pr-chip--active"
            onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
            title="Toggle active filter"
          >
            Active: {stats.active}
          </button>
          <button
            type="button"
            className={"pr-chip pr-chip--warn" + (stockFilter === "low" ? " pr-chip--active" : "")}
            onClick={() => setStockFilter("low")}
          >
            Low: {stats.low}
          </button>
          <button
            type="button"
            className={"pr-chip pr-chip--danger" + (stockFilter === "out" ? " pr-chip--active" : "")}
            onClick={() => setStockFilter("out")}
          >
            Out: {stats.out}
          </button>
        </div>
      </div>

      {/* Shell */}
      <div className="pr-shell">
        {/* Left: Table */}
        <div className="pr-card">
          <div className="pr-card-header">
            <div>
              <div className="pr-card-title">Products</div>
              <div className="pr-card-sub">
                {loading ? "Loading…" : `${filtered.length} shown · ${items.length} total`}
              </div>
            </div>

            {error ? <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 650 }}>{error}</div> : null}
          </div>

          {bulkSelected.size > 0 && (
  <div className="pr-bulk">
    <div className="pr-bulk-left">
      <span className="pr-bulk-count">{bulkSelected.size} selected</span>
      <span className="pr-bulk-tip">Tip: Shift-click to select a range</span>

      <button
        type="button"
        className="pr-bulk-link"
        onClick={() => setBulkSelected(new Set())}
        disabled={bulkWorking || loading}
      >
        Clear
      </button>
    </div>

    <div className="pr-bulk-actions">
      <button
        type="button"
        className="pr-btn"
        onClick={() => void bulkSetActive(true)}
        disabled={bulkWorking || loading}
      >
        Activate
      </button>

      <button
        type="button"
        className="pr-btn"
        onClick={() => void bulkSetActive(false)}
        disabled={bulkWorking || loading}
      >
        Deactivate
      </button>

      <div className="pr-bulk-stock">
        <input
          className="pr-input"
          style={{ width: 120, height: 34 }}
          type="number"
          min={0}
          value={bulkStock}
          onChange={(e) => setBulkStock(e.target.value)}
          placeholder="Stock…"
          disabled={bulkWorking || loading}
        />
        <button
          type="button"
          className="pr-btn pr-btn-primary"
          onClick={() => void bulkSetStock()}
          disabled={bulkWorking || loading}
        >
          Set
        </button>
      </div>

      <button
        type="button"
        className="pr-btn"
        onClick={() => exportSelectedCsv()}
        disabled={bulkWorking || loading}
      >
        Export
      </button>

      <button
        type="button"
        className="pr-btn pr-btn-danger"
        onClick={() => void bulkDelete()}
        disabled={bulkWorking || loading}
      >
        Delete
      </button>
    </div>
  </div>
)}


          <div className="pr-table-wrap">
            <table className="pr-table">
              <thead>
                <tr>
                  <th className="pr-th-check">
  <input
    type="checkbox"
    className="pr-check"
    checked={allVisibleSelected}
    onChange={(e) => setAllVisible(e.target.checked)}
    aria-label="Select all visible products"
  />
</th>

                  <th>Name</th>
                  <th className="pr-td-right">Price</th>
                  <th>Stock</th>
                  <th>Installment</th>
                  <th>Status</th>
                  <th className="pr-td-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 14, color: "var(--pr-muted)", fontWeight: 600 }}>
                      No products match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const isSel = selectedId === p.id;
                    const sb = stockBadge(p.stock_qty);

                    return (
                      <tr
                        key={p.id}
                        className={"pr-row" + (isSel ? " pr-row--selected" : "")}
                        onClick={() => setSelectedId(p.id)}
                      >
                        <td className="pr-td-check" onClick={(e) => e.stopPropagation()}>
<input
  type="checkbox"
  className="pr-check"
  checked={bulkSelected.has(p.id)}
  onClick={(e) => {
    e.stopPropagation();
    e.preventDefault();
    toggleBulk(p.id, (e as any).shiftKey === true);
  }}
  onChange={() => {}}
  aria-label={`Select product ${p.name}`}
/>

</td>

                        <td>
                          <div className="pr-name">
                            <div className="pr-name-title">{p.name}</div>
                            <div className="pr-name-sub">
                              {p.is_active ? "Active" : "Inactive"}
                              {p.is_installment ? " · Installment" : ""}
                            </div>
                          </div>
                        </td>

                        <td className="pr-td-right">{formatTzs(p.price_tzs)} TZS</td>

                        <td>
                          <span className={sb.className}>{sb.label}</span>
                        </td>

                        <td>
                          {p.is_installment ? <span className="pr-badge pr-badge--installment">Yes</span> : <span className="pr-badge">No</span>}
                        </td>

                        <td>
                          <span className={"pr-badge " + (p.is_active ? "pr-badge--active" : "pr-badge--inactive")}>
                            {p.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="pr-td-right">
                          <div className="pr-actions" onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="pr-icon-btn" title="Edit" onClick={() => openEdit(p)}>
                              ✏️
                            </button>
                            <button type="button" className="pr-icon-btn" title="Toggle active" onClick={() => void toggleActive(p)}>
                              {p.is_active ? "⏸️" : "▶️"}
                            </button>
                            <button type="button" className="pr-icon-btn" title="Delete" onClick={() => void handleDelete(p)}>
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Details */}
        <aside className="pr-card">
          <div className="pr-card-header">
            <div>
              <div className="pr-card-title">Product details</div>
              <div className="pr-card-sub">{selected ? selected.name : "Select a product"}</div>
            </div>

            {selected ? (
              <span className={"pr-badge " + (selected.is_active ? "pr-badge--active" : "pr-badge--inactive")}>
                {selected.is_active ? "Active" : "Inactive"}
              </span>
            ) : null}
          </div>

          <div className="pr-card-body">
            {!selected ? (
              <div className="pr-empty">
                Click a product row to view details and update stock quickly.
              </div>
            ) : (
              <>
                <div className="pr-kv">
                  <div className="pr-kv-item">
                    <div className="pr-kv-label">Price</div>
                    <div className="pr-kv-value">{formatTzs(selected.price_tzs)} TZS</div>
                  </div>

                  <div className="pr-kv-item">
                    <div className="pr-kv-label">Stock</div>
                    <div className="pr-kv-value">{selected.stock_qty ?? 0}</div>
                  </div>

                  <div className="pr-kv-item">
                    <div className="pr-kv-label">Installment</div>
                    <div className="pr-kv-value">{selected.is_installment ? "Yes" : "No"}</div>
                  </div>

                  <div className="pr-kv-item">
                    <div className="pr-kv-label">Status</div>
                    <div className="pr-kv-value">{selected.is_active ? "Active" : "Inactive"}</div>
                  </div>
                </div>

                <div className="pr-section">
                  <div className="pr-section-title">Quick stock update</div>
                  <div className="pr-stock-row">
                    <div className="pr-field" style={{ minWidth: 180 }}>
                      <div className="pr-label">Stock qty</div>
                      <input
                        className="pr-input"
                        type="number"
                        min={0}
                        step={1}
                        value={stockEdit}
                        onChange={(e) => setStockEdit(e.target.value)}
                      />
                    </div>

                    <button type="button" className="pr-btn pr-btn-primary" onClick={() => void saveStockOnly()}>
                      Save stock
                    </button>

                    <button type="button" className="pr-btn" onClick={() => openEdit(selected)}>
                      Edit
                    </button>

                    <button type="button" className="pr-btn" onClick={() => void toggleActive(selected)}>
                      {selected.is_active ? "Deactivate" : "Activate"}
                    </button>

                    <button type="button" className="pr-btn pr-btn-danger" onClick={() => void handleDelete(selected)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div className="pr-section">
                  <div className="pr-section-title">Description (Swahili)</div>
                  <div className="pr-desc">{selected.description?.trim() ? selected.description : "—"}</div>
                </div>

                <div className="pr-section">
                  <div className="pr-section-title">Description (English)</div>
                  <div className="pr-desc">{selected.description_en?.trim() ? selected.description_en : "—"}</div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="pr-modal-backdrop" role="dialog" aria-modal="true">
          <div className="pr-modal">
            <div className="pr-modal-header">
              <div>
                <div className="pr-modal-title">{editingId == null ? "New product" : "Edit product"}</div>
                <div className="pr-modal-sub">Keep it simple: name, price, stock, and status.</div>
              </div>

              <button
                type="button"
                className="pr-close"
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form className="pr-form" onSubmit={(e) => void handleSubmit(e)}>
              {error ? <div className="pr-error">{error}</div> : null}

              <div className="pr-form-grid">
                <div className="pr-field" style={{ minWidth: "unset" }}>
                  <div className="pr-label">Product name</div>
                  <input
                    className="pr-input"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Mfano: Ujani Super Tea"
                    required
                  />
                </div>

                <div className="pr-field" style={{ minWidth: "unset" }}>
                  <div className="pr-label">Price (TZS)</div>
                  <input
                    className="pr-input"
                    value={form.price_tzs}
                    onChange={(e) => setForm((f) => ({ ...f, price_tzs: e.target.value.replace(/[^\d]/g, "") }))}
                    placeholder="30000"
                    required
                  />
                </div>

                <div className="pr-field" style={{ minWidth: "unset" }}>
                  <div className="pr-label">Stock qty</div>
                  <input
                    className="pr-input"
                    type="number"
                    min={0}
                    step={1}
                    value={form.stock_qty}
                    onChange={(e) => setForm((f) => ({ ...f, stock_qty: e.target.value.replace(/[^\d]/g, "") }))}
                    placeholder="0"
                  />
                </div>

                <div className="pr-field" style={{ minWidth: "unset" }}>
                  <div className="pr-label">Flags</div>
                  <div className="pr-flags">
                    <label className="pr-flag">
                      <input
                        type="checkbox"
                        checked={form.is_installment}
                        onChange={(e) => setForm((f) => ({ ...f, is_installment: e.target.checked }))}
                      />
                      <span>Installment</span>
                    </label>

                    <label className="pr-flag">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      />
                      <span>Active</span>
                    </label>
                  </div>
                </div>

                <div className="pr-field" style={{ minWidth: "unset", gridColumn: "1 / -1" }}>
                  <div className="pr-label">Description (Swahili)</div>
                  <textarea
                    className="pr-textarea"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Maelezo kwa Kiswahili (optional)…"
                    rows={3}
                  />
                </div>

                <div className="pr-field" style={{ minWidth: "unset", gridColumn: "1 / -1" }}>
                  <div className="pr-label">Description (English)</div>
                  <textarea
                    className="pr-textarea"
                    value={form.description_en}
                    onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value }))}
                    placeholder="English description (optional)…"
                    rows={3}
                  />
                </div>
              </div>

              <div className="pr-form-row">
                <div className="pr-note">Tip: If stock is unknown, set it to 0 to avoid overselling.</div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className="pr-btn"
                    onClick={() => {
                      setShowModal(false);
                      setEditingId(null);
                      setForm(emptyForm);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button type="submit" className="pr-btn pr-btn-primary" disabled={saving}>
                    {saving ? "Saving…" : editingId == null ? "Save" : "Update"}
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
