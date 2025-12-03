"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

type Expense = {
  id: number;
  incurred_on: string;
  category: string;
  amount_tzs: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type ListResponse = { items: Expense[] };
type SingleResponse = { expense: Expense };

const CATEGORY_OPTIONS = [
  "rider",
  "rent",
  "salary",
  "marketing",
  "utilities",
  "other",
] as const;

type Category = (typeof CATEGORY_OPTIONS)[number];

type FormState = {
  incurred_on: string;
  category: Category;
  amount_tzs: string;
  description: string;
};

const CATEGORY_BADGE_CLASSES: Record<Category, string> = {
  rider: "badge badge--bot",
  rent: "badge badge--bot",
  salary: "badge badge--bot",
  marketing: "badge badge--bot",
  utilities: "badge badge--bot",
  other: "badge badge--bot",
};

export default function ExpensesPage() {
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isFormVisible, setIsFormVisible] = useState(false);

  const [form, setForm] = useState<FormState>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return {
      incurred_on: `${yyyy}-${mm}-${dd}`,
      category: "other",
      amount_tzs: "",
      description: "",
    };
  });

  const loadExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<ListResponse>("/api/expenses?limit=100");
      setItems(res.items);
    } catch (err: any) {
      console.error(err);
      setError("Imeshindikana kupakia matumizi.");
      toast.error("Imeshindikana kupakia matumizi.", {
        description: "Jaribu tena muda mfupi baadaye.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadExpenses();
  }, []);

  const resetForm = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");

    setForm({
      incurred_on: `${yyyy}-${mm}-${dd}`,
      category: "other",
      amount_tzs: "",
      description: "",
    });
    setEditingId(null);
  };

  const handleEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setForm({
      incurred_on: expense.incurred_on.slice(0, 10),
      category: expense.category as Category,
      amount_tzs: String(expense.amount_tzs),
      description: expense.description ?? "",
    });
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (expense: Expense) => {
    const ok = window.confirm("Unataka kufuta matumizi haya kabisa?");
    if (!ok) return;

    setDeletingId(expense.id);
    try {
      await api(`/api/expenses/${expense.id}`, { method: "DELETE" });
      toast.success("Matumizi yamefutwa.");
      void loadExpenses();
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kufuta matumizi.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setSaving(true);

    const amountNumeric = Number(form.amount_tzs);
    if (!amountNumeric || amountNumeric <= 0) {
      toast.error("Kiasi si sahihi.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        incurred_on: form.incurred_on,
        category: form.category,
        amount_tzs: Math.round(amountNumeric),
        description: form.description.trim() || undefined,
      };

      if (!editingId) {
        await api<SingleResponse>("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Matumizi yameongezwa.");
      } else {
        await api<SingleResponse>(`/api/expenses/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Matumizi yamehaririwa.");
      }

      resetForm();
      void loadExpenses();
      setIsFormVisible(false);
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kuhifadhi.");
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = items.reduce((s, e) => s + e.amount_tzs, 0);
  const highestExpense = items.reduce(
    (m, e) => (e.amount_tzs > m ? e.amount_tzs : m),
    0
  );
  const averageExpense =
    items.length > 0 ? Math.round(totalAmount / items.length) : 0;

  const lastExpenseDate = items[0]?.incurred_on?.slice(0, 10) ?? null;

  return (
    <div className="page-root">
      <div className="page-inner space-y-6">
        {/* HEADER */}
        <div className="header-card">
          <div>
            <h1 className="header-title">💸 Matumizi ya Biashara</h1>
            <p className="header-sub">
              Rekodi na fuatilia matumizi yote ya biashara yako kwa urahisi.
            </p>
          </div>

          <div className="kpi-grid">
            <div className="kpi-card">
              <p className="kpi-label">Rekodi</p>
              <p className="kpi-value">{items.length}</p>
            </div>

            <div className="kpi-card kpi-green">
              <p className="kpi-label">Jumla matumizi</p>
              <p className="kpi-value">
                {totalAmount.toLocaleString("sw-TZ")} TZS
              </p>
            </div>

            <div className="kpi-card">
              <p className="kpi-label">Wastani</p>
              <p className="kpi-value">
                {averageExpense.toLocaleString("sw-TZ")} TZS
              </p>
            </div>

            <div className="kpi-card flex items-center justify-center">
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={() => {
                  resetForm();
                  setIsFormVisible(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <span>➕</span>
                <span>Ongeza matumizi</span>
              </button>
            </div>

            <div className="kpi-card">
              <p className="kpi-label">Gharama kubwa</p>
              <p className="kpi-value">
                {highestExpense.toLocaleString("sw-TZ")} TZS
              </p>
            </div>
          </div>

          {lastExpenseDate && (
            <p className="header-note">
              Rekodi ya mwisho: <b>{lastExpenseDate}</b>
            </p>
          )}
        </div>

        {/* FORM – only visible when isFormVisible is true */}
        {isFormVisible && (
          <form onSubmit={handleSubmit} className="panel-card form-card">
    <div className="section-header flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="section-title">
          {editingId ? "✏️ Hariri matumizi" : "➕ Ongeza matumizi mapya"}
        </h2>
        {editingId && (
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={resetForm}
          >
            Futa uchaguzi
          </button>
        )}
      </div>

      {/* CLOSE ICON BUTTON */}
      <button
        type="button"
        className="btn-ghost text-lg leading-none"
        onClick={() => {
          resetForm();
          setIsFormVisible(false);
        }}
        aria-label="Funga fomu ya matumizi"
      >
        ✖
      </button>
    </div>


            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="field-label">Tarehe</label>
                <input
                  type="date"
                  className="field-input"
                  value={form.incurred_on}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, incurred_on: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="field-label">Aina ya matumizi</label>
                <select
                  className="field-input"
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: e.target.value as Category,
                    }))
                  }
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label">Kiasi (TZS)</label>
                <input
                  type="number"
                  className="field-input"
                  value={form.amount_tzs}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount_tzs: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="field-label">Maelezo</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Mf. malipo ya rider"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
            </div>

            <button className="btn-primary mt-4" disabled={saving}>
              {saving
                ? "Inahifadhi..."
                : editingId
                ? "Hifadhi mabadiliko"
                : "Hifadhi matumizi"}
            </button>
          </form>
        )}

        {/* TABLE */}
        <div className="panel-card">
          <div className="section-header">
            <h2 className="section-title">📘 Historia ya matumizi</h2>
            <p className="section-sub">Rekodi 100 za hivi karibuni.</p>
          </div>

          {loading && <p className="muted">Inapakia...</p>}

          {!loading && error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="muted">Bado hujaongeza matumizi yoyote.</p>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarehe</th>
                    <th>Aina</th>
                    <th className="text-right">Kiasi</th>
                    <th>Maelezo</th>
                    <th className="text-right">Vitendo</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => {
                    const badge =
                      CATEGORY_BADGE_CLASSES[e.category as Category];

                    return (
                      <tr key={e.id}>
                        <td>{e.incurred_on.slice(0, 10)}</td>
                        <td>
                          <span
                            className={badge}
                          >
                            {e.category}
                          </span>
                        </td>
                        <td className="text-right">
                          {e.amount_tzs.toLocaleString("sw-TZ")} TZS
                        </td>
                        <td>
                          {e.description || (
                            <span className="muted">(Hakuna)</span>
                          )}
                        </td>
                        <td className="text-right space-x-2">
                          <button
                            className="btn-ghost"
                            type="button"
                            onClick={() => handleEdit(e)}
                          >
                            Hariri
                          </button>
                          <button
                            className="btn-ghost text-red-600"
                            type="button"
                            onClick={() => handleDelete(e)}
                          >
                            {deletingId === e.id ? "Inafuta..." : "Futa"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
