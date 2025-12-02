"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, get, post } from "@/lib/api";
import { toast } from "sonner";
import { socket } from "@/lib/socket";

type Product = {
  id: number;
  sku: string; // still exists in backend but hidden from UI
  name: string;
  price_tzs: number;
  description: string;
  description_en: string | null;
  is_installment: boolean;
  is_active: boolean;
  stock_qty: number | null;
  created_at?: string;
};

type ProductForm = {
  name: string;
  price_tzs: string;
  description: string;
  description_en: string;
  is_installment: boolean;
  is_active: boolean;
  stock_qty: string;
};

type ListResponse = { items: Product[] };
type SingleResponse = { product: Product };

const emptyForm: ProductForm = {
  name: "",
  price_tzs: "",
  description: "",
  description_en: "",
  is_installment: false,
  is_active: true,
  stock_qty: "",
};


export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  const filteredItems = items.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q)
    );
  });

  const LOW_STOCK_THRESHOLD = 5;

  const lowStockItems = items.filter((p) => {
    const stock = p.stock_qty ?? 0;
    return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
  });

  const outOfStockItems = items.filter(
    (p) => (p.stock_qty ?? 0) === 0
  );



  const loadProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await get<ListResponse>("/api/products");
      setItems(res.items);
    } catch (err: any) {
      console.error("Failed to load products", err);
      const msg =
        err?.message ?? "Imeshindikana kupakia bidhaa. Jaribu tena.";
      setError(msg);
      toast.error("Imeshindikana kupakia bidhaa.", {
        description: "Tafadhali jaribu tena muda kidogo.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

   // Auto-refresh when backend notifies that products/stock changed
  useEffect(() => {
    const s = socket();
    if (!s) return;

    const handler = () => {
      void loadProducts();
    };

    s.on("products.updated", handler);

    return () => {
      s.off("products.updated", handler);
    };
  }, []);

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      price_tzs: String(product.price_tzs ?? ""),
      description: product.description ?? "",
      description_en: product.description_en ?? "",
      is_installment: !!product.is_installment,
      is_active: !!product.is_active,
      stock_qty:
        product.stock_qty != null ? String(product.stock_qty) : "",
    });
    setShowForm(true);
    toast("Unahariri bidhaa", {
      description: product.name,
    });
  };

  const handleNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true); // show form only when admin clicks
  };


  const handleDelete = async (product: Product) => {
    const ok = window.confirm(
      `Unataka kufuta kabisa bidhaa "${product.name}"? Hatua hii haiwezi kurudishwa.`
    );
    if (!ok) return;

    try {
      await api(`/api/products/${product.id}`, {
        method: "DELETE",
      });

      toast.success("Bidhaa imefutwa kwa mafanikio.", {
        description: `${product.name} imeondolewa kwenye orodha.`,
      });

      void loadProducts();
    } catch (err: any) {
      console.error("Failed to delete product", err);
      const msg =
        err?.message ?? "Imeshindikana kufuta bidhaa. Jaribu tena.";
      setError(msg);
      toast.error("Imeshindikana kufuta bidhaa.", {
        description: "Tafadhali jaribu tena au wasiliana na msimamizi.",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const priceNumeric = Number(form.price_tzs);
      if (!Number.isFinite(priceNumeric) || priceNumeric <= 0) {
        const msg = "Please enter a positive price.";
        setSaving(false);
        setError(msg);
        toast.error("Invalid price", {
          description: msg,
        });
        return;
      }

      const stockNumeric =
        form.stock_qty === "" ? 0 : Number(form.stock_qty);
      if (!Number.isFinite(stockNumeric) || stockNumeric < 0) {
        const msg = "Please enter a non-negative stock quantity.";
        setSaving(false);
        setError(msg);
        toast.error("Invalid stock", {
          description: msg,
        });
        return;
      }

      const payload = {
        ...form,
        price_tzs: priceNumeric,
        stock_qty: stockNumeric,
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

      setSaving(false);
      setEditingId(null);
      setForm(emptyForm);
      setShowForm(false);
      void loadProducts();

      toast.success(
        isNew
          ? "Bidhaa imeongezwa kwa mafanikio."
          : "Bidhaa imesasishwa kwa mafanikio."
      );
    } catch (err: any) {
      console.error("Failed to save product", err);
      const msg =
        err?.message ?? "Imeshindikana kuhifadhi bidhaa. Jaribu tena.";
      setSaving(false);
      setError(msg);
      toast.error("Imeshindikana kuhifadhi bidhaa.", {
        description: "Tafadhali angalia taarifa na ujaribu tena.",
      });
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

          {/* Low stock / out of stock reminders */}
{items.length > 0 && (
  <div className="products-alert-stack">
    {outOfStockItems.length > 0 && (
      <div className="products-alert products-alert--danger">
        <div className="products-alert-icon">!</div>
        <div className="products-alert-body">
          <div className="products-alert-title">Bidhaa zimeisha stock</div>
          <div className="products-alert-text">
            Bidhaa zifuatazo kwa sasa hazina stock:
            {" "}
            {outOfStockItems.map((p) => p.name).join(", ")}
          </div>
        </div>
      </div>
    )}

    {lowStockItems.length > 0 && (
      <div className="products-alert products-alert--warning">
        <div className="products-alert-icon">!</div>
        <div className="products-alert-body">
          <div className="products-alert-title">
            Onyo la stock ndogo
          </div>
          <div className="products-alert-text">
            Bidhaa zifuatazo zina stock ndogo (≤{LOW_STOCK_THRESHOLD}):
            {" "}
            {lowStockItems
              .map((p) => `${p.name} (${p.stock_qty ?? 0})`)
              .join(", ")}
          </div>
        </div>
      </div>
    )}
  </div>
)}

          {items.length === 0 && !loading ? (
            <div className="panel-card-body--muted">Loading products…</div>
          ) : filteredItems.length === 0 ? (
            <div className="panel-card-body--muted">
              Hakuna bidhaa zinazolingana na utafutaji.
            </div>
          ) : (
<table className="products-table">
  <thead>
    <tr>
      <th>Jina la bidhaa</th>
      <th className="text-right">Bei (TZS)</th>
      <th className="text-right">Stock</th>
      <th>Installment</th>
      <th>Status</th>
      <th className="text-right">Vitendo</th>
    </tr>
  </thead>
  <tbody>
    {filteredItems.map((p) => (
      <tr key={p.id}>
        <td>
          <div className="font-semibold">{p.name}</div>
        </td>
        <td className="text-right">
          {Math.floor(p.price_tzs).toLocaleString("sw-TZ")}
        </td>
        <td className="text-right">
          {p.stock_qty != null
            ? Math.floor(p.stock_qty).toLocaleString("sw-TZ")
            : "—"}
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
        <td className="text-right">
          <button
            type="button"
            className="btn btn-xs mr-2"
            onClick={() => handleEdit(p)}
          >
            Edit
          </button>
          <button
            type="button"
            className="btn btn-xs btn-danger"
            onClick={() => handleDelete(p)}
          >
            Remove
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
      {showForm && (
        <div className="products-form-card">
          <div className="products-form-header">
            <div>
              <div className="products-form-title">
                {editingId == null ? "Add new product" : "Edit product"}
              </div>
              <div className="products-form-subtitle">
                {editingId == null
                  ? "Ongeza bidhaa mpya kwenye duka lako."
                  : "Sasisha taarifa za bidhaa hii."}
              </div>
            </div>

            <div className="products-form-header-right">
              <span
                className={
                  "products-form-badge " +
                  (editingId == null
                    ? "products-form-badge--new"
                    : "products-form-badge--edit")
                }
              >
                {editingId == null ? "NEW" : "EDIT"}
              </span>
              <button
                type="button"
                className="products-form-close-btn"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <form className="products-form" onSubmit={handleSubmit}>
            {/* Top grid: name, price, stock */}
            <div className="products-form-grid">
              <div className="products-field products-field--wide">
                <label className="products-label">Product name</label>
                <input
                  type="text"
                  className="products-input"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Mfano: Ujani Herbals Super Tea"
                  required
                />
                <p className="products-help">
                  Jina la bidhaa litakaloonekana kwa wateja na ndani ya mfumo.
                </p>
              </div>

              <div className="products-field">
                <label className="products-label">Price (TZS)</label>
                <input
                  type="text"
                  className="products-input"
                  value={form.price_tzs}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      price_tzs: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  placeholder="Mfano: 30000"
                  required
                />
                <p className="products-help">
                  Bei ya rejareja kwa kila kipande.
                </p>
              </div>

              <div className="products-field">
                <label className="products-label">Stock quantity</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="products-input"
                  value={form.stock_qty}
                  onChange={(e) =>
                    setForm((f) => {
                      const raw = e.target.value;
                      const cleaned = raw.replace(/[^\d]/g, "");
                      return { ...f, stock_qty: cleaned };
                    })
                  }
                  placeholder="Mfano: 100"
                />
                <p className="products-help">
                  Idadi ya vipande vilivyopo sasa (stock iliyo tayari kuuzwa).
                </p>
              </div>
            </div>

            {/* Descriptions */}
            <div className="products-form-section">
              <label className="products-label">
                Maelezo kamili (Swahili)
              </label>
              <textarea
                className="products-textarea"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Andika maelezo ya bidhaa kwa Kiswahili..."
                rows={3}
              />
            </div>

            <div className="products-form-section">
              <label className="products-label">
                Full description (English) (optional)
              </label>
              <textarea
                className="products-textarea"
                value={form.description_en}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description_en: e.target.value }))
                }
                placeholder="Write the product description in English (optional)..."
                rows={3}
              />
            </div>

            {/* Flags + footer */}
            <div className="products-form-footer">
              <div className="products-form-flags">
                <label className="products-flag">
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
                  <span>
                    Hii bidhaa inaruhusu malipo kwa awamu (installment)
                  </span>
                </label>

                <label className="products-flag">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        is_active: e.target.checked,
                      }))
                    }
                  />
                  <span>Product is active</span>
                </label>
              </div>

              <div className="products-form-actions">
                <button
                  type="button"
                  className="products-secondary-btn"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="products-primary-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingId == null
                    ? "Save product"
                    : "Update product"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
