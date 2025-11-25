"use client";

import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";

type Product = {
  id: number;
  sku: string;
  name: string;
  price_tzs: number; // from backend
  short_description: string;
  short_description_en: string | null;
  description: string;
  description_en: string | null;
  is_installment: boolean;
  is_active: boolean;
  created_at?: string;
};

type ProductForm = {
  sku: string;
  name: string;
  price_tzs: string; // <- string in form
  short_description: string;
  short_description_en: string;
  description: string;
  description_en: string;
  is_installment: boolean;
  is_active: boolean;
};


type ListResponse = { items: Product[] };
type SingleResponse = { product: Product };

const emptyForm: ProductForm = {
  sku: "",
  name: "",
  price_tzs: "",
  short_description: "",
  short_description_en: "",
  description: "",
  description_en: "",
  is_installment: false,
  is_active: true,
};

type ProductStat = {
  sku: string;
  name: string;
  total_qty: number;
  total_revenue: number;
};

type OverviewStats = {
  order_count: number;
  total_revenue: number;
  total_delivery_fees: number;
};


export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<ProductStat[]>([]);
const [overview, setOverview] = useState<OverviewStats | null>(null);


useEffect(() => {
  void loadProducts();

  const loadStats = async () => {
    try {
      const o = await api<OverviewStats>("/api/stats/overview");
      const p = await api<{ items: ProductStat[] }>("/api/stats/products");
      setOverview(o);
      setStats(p.items ?? []);
    } catch (err) {
      console.error("Failed to load stats", err);
    }
  };

  void loadStats();
}, []);


  const filteredItems = items.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.short_description ?? "").toLowerCase().includes(q)
    );
  });

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<ListResponse>("/api/products");
      setItems(data.items ?? []);
    } catch (err: any) {
      console.error("Failed to load products", err);
      setError(err?.message ?? "Failed to load products");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

 const handleEdit = (product: Product) => {
  setEditingId(product.id);
  setForm({
    sku: product.sku,
    name: product.name,
    price_tzs: String(product.price_tzs ?? ""), // <- string
    short_description: product.short_description ?? "",
    short_description_en: product.short_description_en ?? "",
    description: product.description ?? "",
    description_en: product.description_en ?? "",
    is_installment: !!product.is_installment,
    is_active: !!product.is_active,
  });
};


  const handleNew = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (product: Product) => {
    const ok = window.confirm(
      `Unataka kuondoa bidhaa "${product.name}"? Itakuwa inactive.`
    );
    if (!ok) return;

    try {
      await api(`/api/products/${product.id}`, {
        method: "DELETE",
      });
      void loadProducts();
    } catch (err) {
      console.error("Failed to delete product", err);
      alert("Failed to delete product. Please try again.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
     const priceNumeric = Number(form.price_tzs);
if (!Number.isFinite(priceNumeric) || priceNumeric <= 0) {
  setSaving(false);
  setError("Please enter a positive price.");
  return;
}

const payload = {
  ...form,
  price_tzs: priceNumeric,
};


      if (editingId == null) {
        await post<SingleResponse>("/api/products", payload);
      } else {
        await api<SingleResponse>(`/api/products/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setSaving(false);
      setEditingId(null);
      setForm(emptyForm);
      void loadProducts();
    } catch (err: any) {
      console.error("Failed to save product", err);
      setSaving(false);
      setError(err?.message ?? "Failed to save product");
    }
  };

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
      {/* List + search */}
      <div className="panel-card flex-1 flex flex-col">
        <div className="panel-card-header flex items-center justify-between">
          <div className="panel-card-title">
            Bidhaa
            <span className="text-xs text-gray-500 ml-2">
              ({items.length} total)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by name / SKU..."
              className="conversation-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" className="btn btn-secondary" onClick={handleNew}>
              + New product
            </button>
          </div>
        </div>

        <div className="panel-card-body flex-1 overflow-auto text-xs">
          {error && <div className="text-red-600 mb-2">{error}</div>}
          {overview && (
  <div className="grid md:grid-cols-3 gap-3 mb-4">
    <div className="panel-card">
      <div className="panel-card-header">Total revenue</div>
      <div className="panel-card-body text-2xl font-semibold">
        {overview.total_revenue.toLocaleString("sw-TZ")} TZS
      </div>
    </div>
    <div className="panel-card">
      <div className="panel-card-header">Total orders</div>
      <div className="panel-card-body text-2xl font-semibold">
        {overview.order_count}
      </div>
    </div>
    <div className="panel-card">
      <div className="panel-card-header">Delivery fees (“spend”)</div>
      <div className="panel-card-body text-2xl font-semibold">
        {overview.total_delivery_fees.toLocaleString("sw-TZ")} TZS
      </div>
    </div>
  </div>
)}

{stats.length > 0 && (
  <div className="panel-card mb-4">
    <div className="panel-card-header">Top products by revenue</div>
    <div className="panel-card-body space-y-2">
      {stats.map((s, i) => (
        <div key={s.sku}>
          <div className="flex justify-between text-xs mb-1">
            <span>
              {i + 1}. {s.name}
            </span>
            <span>{s.total_revenue.toLocaleString("sw-TZ")} TZS</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-ui-primary"
              style={{
                width:
                  (s.total_revenue / (stats[0]?.total_revenue || 1)) * 100 +
                  "%",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
)}

          {loading ? (
            <div className="panel-card-body--muted">Loading products…</div>
          ) : filteredItems.length === 0 ? (
            <div className="panel-card-body--muted">
              Hakuna bidhaa zinazolingana na utafutaji.
            </div>
          ) : (
            <table className="products-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Jina la bidhaa</th>
                  <th className="text-right">Bei (TZS)</th>
                  <th>Installment</th>
                  <th>Status</th>
                  <th className="text-right">Vitendo</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((p) => (
                  <tr key={p.id} className="products-row">
                    <td>{p.sku}</td>
                    <td>
                      <div className="products-name">{p.name}</div>
                      <div className="products-short">
                        {p.short_description || "—"}
                      </div>
                    </td>
                    <td className="text-right">
                      {Math.floor(p.price_tzs).toLocaleString("sw-TZ")}
                    </td>
                    <td>{p.is_installment ? "Ndiyo" : "Hapana"}</td>
                    <td>
                      <span
                        className={
                          "products-status-badge " +
                          (p.is_active
                            ? "products-status--active"
                            : "products-status--inactive")
                        }
                      >
                        {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="products-actions">
                      <button
                        type="button"
                        className="orders-action-button"
                        onClick={() => handleEdit(p)}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        className="orders-action-button"
                        onClick={() => handleDelete(p)}
                      >
                        🗑️ Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="panel-card">
        <div className="panel-card-title">
          {editingId == null ? "Add new product" : "Edit product"}
        </div>
        <form
          className="panel-card-body space-y-4 text-xs"
          onSubmit={handleSubmit}
        >
          {/* Basic info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-semibold">SKU</label>
              <input
                type="text"
                className="history-edit-input"
                value={form.sku}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))
                }
                placeholder="PROMAX, KIBOKO..."
                required
              />
            </div>

            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="font-semibold">Product name</label>
              <input
                type="text"
                className="history-edit-input"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>

           <div className="flex flex-col gap-1">
  <label className="font-semibold">Price (TZS)</label>
  <input
    type="number"
    min={0}
    step={1}
    className="history-edit-input"
    value={form.price_tzs}
    onChange={(e) =>
      setForm((f) => {
        const raw = e.target.value;
        // Disallow minus, keep only digits
        const cleaned = raw.replace(/[^\d]/g, "");
        return { ...f, price_tzs: cleaned };
      })
    }
    placeholder="e.g. 140000"
    required
  />
</div>


            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_installment}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      is_installment: e.target.checked,
                    }))
                  }
                />
                <span>Installment / Promax-style payments</span>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_active: e.target.checked }))
                  }
                />
                <span>Active (visible in menu)</span>
              </label>
            </div>
          </div>

          {/* Short descriptions */}
          <div className="border-t border-gray-200 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase text-gray-500 mb-1">
                maelezo mafupi · Swahili
              </div>
           <textarea
  className="history-edit-input"
  rows={2}
  value={form.short_description}
  onChange={(e) =>
    setForm((f) => ({
      ...f,
      short_description: e.target.value, // <-- ONLY this field
    }))
  }
  placeholder="Muhtasari mfupi wa bidhaa kwa Kiswahili…"
/>

            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-500 mb-1">
                Short description · English
              </div>
 <textarea
  className="history-edit-input"
  rows={2}
  value={form.short_description_en ?? ""}
  onChange={(e) =>
    setForm((f) => ({
      ...f,
      short_description_en: e.target.value, // <-- ONLY this field
    }))
  }
  placeholder="Short English summary of the product…"
/>
            </div>
          </div>

          {/* Full descriptions */}
          <div className="border-t border-gray-200 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase text-gray-500 mb-1">
                Full description · Swahili
              </div>
              <textarea
                className="history-edit-input"
                rows={4}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Maelezo marefu ya bidhaa kwa Kiswahili. Unaweza kuandika kila pointi kwenye mstari mpya."
              />
            </div>
            <div>
              <div className="text-[11px] uppercase text-gray-500 mb-1">
                Full description · English
              </div>
              <textarea
  className="history-edit-input"
  rows={4}
  value={form.description_en ?? ""}
  onChange={(e) =>
    setForm((f) => ({ ...f, description_en: e.target.value }))
  }
  placeholder="Long English description. You can put each bullet on its own line."
/>

            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleNew}
              disabled={saving}
            >
              Clear
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving
                ? "Saving…"
                : editingId == null
                ? "Create product"
                : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
