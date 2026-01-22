"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, get, post, put } from "@/lib/api";
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

function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function dateOnly(iso: string) {
  return (iso || "").slice(0, 10);
}

function formatTzs(v: number) {
  return Math.floor(v).toLocaleString("sw-TZ");
}

function badgeClassFor(category: string) {
  const c = (category || "other").toLowerCase();
  if (c === "rider") return "ex-badge ex-badge--rider";
  if (c === "rent") return "ex-badge ex-badge--rent";
  if (c === "salary") return "ex-badge ex-badge--salary";
  if (c === "marketing") return "ex-badge ex-badge--marketing";
  if (c === "utilities") return "ex-badge ex-badge--utilities";
  return "ex-badge ex-badge--other";
}

export default function ExpensesPage() {
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // selection + bulk
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [bulkAnchorIndex, setBulkAnchorIndex] = useState<number | null>(null);
  const [bulkCategory, setBulkCategory] = useState<Category>("other");


  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [form, setForm] = useState<FormState>({
    incurred_on: todayYmd(),
    category: "other",
    amount_tzs: "",
    description: "",
  });

  async function loadExpenses() {
    setLoading(true);
    setError(null);
    try {
      const res = await get<ListResponse>("/api/expenses?limit=200");
      const list = res.items ?? [];
      setItems(list);

      setSelectedId((prev) => (prev != null && list.some((x) => x.id === prev) ? prev : null));
      setBulkSelected((prev) => {
        const next = new Set<number>();
        for (const it of list) if (prev.has(it.id)) next.add(it.id);
        return next;
      });
    } catch (err: any) {
      console.error(err);
      setError("Imeshindikana kupakia matumizi.");
      toast.error("Imeshindikana kupakia matumizi.", {
        description: "Jaribu tena muda mfupi baadaye.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadExpenses();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((x) => {
      const d = dateOnly(x.incurred_on);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;

      if (categoryFilter !== "all") {
        if ((x.category || "").toLowerCase() !== categoryFilter) return false;
      }

      if (!q) return true;

      const hay = [x.category, x.description ?? "", String(x.amount_tzs), dateOnly(x.incurred_on)]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [items, search, categoryFilter, fromDate, toDate]);

  const selected = useMemo(() => {
    return selectedId == null ? null : items.find((x) => x.id === selectedId) ?? null;
  }, [items, selectedId]);

  const totals = useMemo(() => {
    const total = filtered.reduce((s, x) => s + x.amount_tzs, 0);

    const today = todayYmd();
    const todayTotal = filtered
      .filter((x) => dateOnly(x.incurred_on) === today)
      .reduce((s, x) => s + x.amount_tzs, 0);

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthTotal = filtered
      .filter((x) => dateOnly(x.incurred_on).slice(0, 7) === monthKey)
      .reduce((s, x) => s + x.amount_tzs, 0);

    return { count: filtered.length, total, todayTotal, thisMonthTotal };
  }, [filtered]);

  const monthlySummary = useMemo(() => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Summary range:
  // - If From/To are set: summarize that selected range
  // - Else: summarize this month
  const rangeLabel =
    fromDate || toDate
      ? `Range: ${fromDate || "…"} → ${toDate || "…"}`
      : `This month: ${monthKey}`;

  const base = items.filter((x) => {
    const d = dateOnly(x.incurred_on);

    if (fromDate || toDate) {
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
    } else {
      if (d.slice(0, 7) !== monthKey) return false;
    }

    if (categoryFilter !== "all") {
      if ((x.category || "").toLowerCase() !== categoryFilter) return false;
    }

    return true;
  });

  const total = base.reduce((s, x) => s + x.amount_tzs, 0);

  const byCategoryMap = new Map<string, number>();
  for (const x of base) {
    const c = (x.category || "other").toLowerCase();
    byCategoryMap.set(c, (byCategoryMap.get(c) ?? 0) + x.amount_tzs);
  }

  const byCategory = Array.from(byCategoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const top = byCategory.slice(0, 5);
  const rest = byCategory.slice(5).reduce((s, x) => s + x.amount, 0);

  return {
    rangeLabel,
    count: base.length,
    total,
    top,
    rest,
  };
}, [items, fromDate, toDate, categoryFilter]);


  const filteredIdToIndex = useMemo(() => {
    const m = new Map<number, number>();
    filtered.forEach((r, idx) => m.set(r.id, idx));
    return m;
  }, [filtered]);

  const allVisibleSelected = useMemo(() => {
    if (!filtered.length) return false;
    for (const r of filtered) if (!bulkSelected.has(r.id)) return false;
    return true;
  }, [filtered, bulkSelected]);

  function setAllVisible(checked: boolean) {
    if (!checked) {
      setBulkSelected(new Set());
      setBulkAnchorIndex(null);
      return;
    }
    setBulkSelected(new Set(filtered.map((r) => r.id)));
    setBulkAnchorIndex(filtered.length ? 0 : null);
  }

  function toggleBulk(id: number, shiftKey: boolean) {
    const idx = filteredIdToIndex.get(id);
    const has = bulkSelected.has(id);
    const targetChecked = !has;

    setBulkSelected((prev) => {
      const next = new Set(prev);

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

      if (targetChecked) next.add(id);
      else next.delete(id);

      return next;
    });

    setBulkAnchorIndex(idx ?? null);
  }

  function openNew() {
    setEditingId(null);
    setForm({
      incurred_on: todayYmd(),
      category: "other",
      amount_tzs: "",
      description: "",
    });
    setShowModal(true);
  }

  function openEdit(row: Expense) {
    setEditingId(row.id);
    setForm({
      incurred_on: dateOnly(row.incurred_on),
      category: (row.category as Category) || "other",
      amount_tzs: String(row.amount_tzs),
      description: row.description ?? "",
    });
    setShowModal(true);
  }

  async function handleDelete(row: Expense) {
    const ok = window.confirm("Unataka kufuta matumizi haya kabisa?");
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await api(`/api/expenses/${row.id}`, { method: "DELETE" });
      toast.success("Matumizi yamefutwa.");
      if (selectedId === row.id) setSelectedId(null);
      setBulkSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
      void loadExpenses();
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kufuta matumizi.");
    } finally {
      setDeletingId(null);
    }
  }

  async function bulkSetCategory() {
  const ids = Array.from(bulkSelected);
  if (!ids.length) return;

  if (!window.confirm(`Set category = "${bulkCategory}" for ${ids.length} expense(s)?`)) return;

  setBulkWorking(true);
  let ok = 0;
  let fail = 0;

  try {
    for (const id of ids) {
      try {
        await api(`/api/expenses/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: bulkCategory }),
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    if (fail === 0) toast.success(`Updated category for ${ok} expense(s).`);
    else toast.message(`Updated ${ok}. Failed ${fail}.`);
  } finally {
    setBulkWorking(false);
    setBulkSelected(new Set());
    setBulkAnchorIndex(null);
    void loadExpenses();
  }
}

  async function bulkDelete() {
    const ids = Array.from(bulkSelected);
    if (!ids.length) return;

    if (!window.confirm(`Delete ${ids.length} expense(s)? This cannot be undone.`)) return;

    setBulkWorking(true);
    let ok = 0;
    let fail = 0;

    try {
      for (const id of ids) {
        try {
          await api(`/api/expenses/${id}`, { method: "DELETE" });
          ok += 1;
        } catch {
          fail += 1;
        }
      }

      if (fail === 0) toast.success(`Deleted ${ok} expense(s).`);
      else toast.message(`Deleted ${ok}. Failed ${fail}.`);
    } finally {
      setBulkWorking(false);
      setBulkSelected(new Set());
      setBulkAnchorIndex(null);
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      void loadExpenses();
    }
  }

  function exportCsv(rows: Expense[], filename: string) {
    const header = ["Expense ID", "Date", "Category", "Amount TZS", "Description"];

    const csvLines = [
      header.join(","),
      ...rows.map((r) =>
        [r.id, dateOnly(r.incurred_on), r.category ?? "", r.amount_tzs ?? "", r.description ?? ""]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportFilteredCsv() {
    exportCsv(filtered, `expenses-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`Exported ${filtered.length} record(s).`);
  }

  function exportSelectedCsv() {
    const rows = filtered.filter((r) => bulkSelected.has(r.id));
    if (!rows.length) return;
    exportCsv(rows, `expenses-selected-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`Exported ${rows.length} record(s).`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    const amountNumeric = Number(form.amount_tzs);
    if (!Number.isFinite(amountNumeric) || amountNumeric <= 0) {
      toast.error("Kiasi si sahihi.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        incurred_on: form.incurred_on,
        category: form.category,
        amount_tzs: Math.round(amountNumeric),
        description: form.description.trim() || undefined,
      };

      if (!editingId) {
        await post<SingleResponse>("/api/expenses", payload);
        toast.success("Matumizi yameongezwa.");
      } else {
        await put<SingleResponse>(`/api/expenses/${editingId}`, payload);
        toast.success("Matumizi yamehaririwa.");
      }

      setShowModal(false);
      setEditingId(null);
      setForm({
        incurred_on: todayYmd(),
        category: "other",
        amount_tzs: "",
        description: "",
      });
      void loadExpenses();
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kuhifadhi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="expenses-page">
      {/* Topbar */}
      <div className="ex-topbar">
        <div>
          <div className="ex-title">Expenses</div>
          <div className="ex-subtitle">
            Rekodi na fuatilia matumizi ya biashara kwa mwonekano rahisi, safi, na wa admin.
          </div>
        </div>

        <div className="ex-top-actions">
          <Link
            href="/incomes"
            className="ex-btn"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            ← Income
          </Link>

          <button type="button" className="ex-btn" onClick={exportFilteredCsv} disabled={loading}>
            Export CSV
          </button>

          <button type="button" className="ex-btn ex-btn-primary" onClick={openNew}>
            + New expense
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="ex-controls">
        <div className="ex-field" style={{ minWidth: 260 }}>
          <div className="ex-label">Search</div>
          <input
            className="ex-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Category, amount, date, notes…"
          />
        </div>

        <div className="ex-field">
          <div className="ex-label">Category</div>
          <select
            className="ex-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
          >
            <option value="all">All</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="ex-field" style={{ minWidth: 160 }}>
          <div className="ex-label">From</div>
          <input className="ex-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>

        <div className="ex-field" style={{ minWidth: 160 }}>
          <div className="ex-label">To</div>
          <input className="ex-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>

        <div className="ex-chips">
          <span className="ex-chip">Records: {totals.count}</span>
          <span className="ex-chip ex-chip--danger">Total: {formatTzs(totals.total)} TZS</span>
          <span className="ex-chip ex-chip--warn">This month: {formatTzs(totals.thisMonthTotal)} TZS</span>
          <span className="ex-chip">Today: {formatTzs(totals.todayTotal)} TZS</span>
        </div>
      </div>

      <div className="ex-card ex-summary-card">
  <div className="ex-card-header">
    <div>
      <div className="ex-card-title">Monthly summary</div>
      <div className="ex-card-sub">{monthlySummary.rangeLabel}</div>
    </div>
    <div className="ex-card-sub">
      {monthlySummary.count} record(s)
    </div>
  </div>

  <div className="ex-card-body">
    <div className="ex-summary-grid">
      <div className="ex-summary-total">
        <div className="ex-summary-label">Total spend</div>
        <div className="ex-summary-value">{formatTzs(monthlySummary.total)} TZS</div>
        <div className="ex-summary-mini">
          Top categories below (kept simple).
        </div>
      </div>

      <div className="ex-summary-list">
        {monthlySummary.top.length === 0 ? (
          <div className="ex-summary-empty">No data in this period.</div>
        ) : (
          <>
            {monthlySummary.top.map((x) => {
              const pct =
                monthlySummary.total > 0
                  ? Math.round((x.amount / monthlySummary.total) * 100)
                  : 0;

              return (
                <div key={x.category} className="ex-summary-item">
                  <div className="ex-summary-item-left">
                    <span className={badgeClassFor(x.category)}>{x.category}</span>
                    <span className="ex-summary-pct">{pct}%</span>
                  </div>
                  <div className="ex-summary-amt">{formatTzs(x.amount)} TZS</div>
                </div>
              );
            })}

            {monthlySummary.rest > 0 && (
              <div className="ex-summary-item ex-summary-item--rest">
                <div className="ex-summary-item-left">
                  <span className={badgeClassFor("other")}>other</span>
                  <span className="ex-summary-pct">…</span>
                </div>
                <div className="ex-summary-amt">{formatTzs(monthlySummary.rest)} TZS</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  </div>
</div>


      {/* Shell */}
      <div className="ex-shell">
        {/* Left: Table */}
        <div className="ex-card">
          <div className="ex-card-header">
            <div>
              <div className="ex-card-title">Expense records</div>
              <div className="ex-card-sub">
                {loading ? "Loading…" : `${filtered.length} shown · ${items.length} total`}
              </div>
            </div>

            {error ? <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 650 }}>{error}</div> : null}
          </div>

          {bulkSelected.size > 0 && (
            <div className="ex-bulk">
              <div className="ex-bulk-left">
                <span className="ex-bulk-count">{bulkSelected.size} selected</span>
                <span className="ex-bulk-tip">Tip: Shift-click selects a range</span>

                <button
                  type="button"
                  className="ex-bulk-link"
                  onClick={() => {
                    setBulkSelected(new Set());
                    setBulkAnchorIndex(null);
                  }}
                  disabled={bulkWorking || loading}
                >
                  Clear
                </button>
              </div>

<div className="ex-bulk-actions">
  <div className="ex-bulk-category">
    <select
      className="ex-select ex-bulk-select"
      value={bulkCategory}
      onChange={(e) => setBulkCategory(e.target.value as Category)}
      disabled={bulkWorking || loading}
      aria-label="Bulk category"
    >
      {CATEGORY_OPTIONS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>

    <button
      type="button"
      className="ex-btn ex-btn-primary"
      onClick={() => void bulkSetCategory()}
      disabled={bulkWorking || loading}
    >
      Set category
    </button>
  </div>

  <button
    type="button"
    className="ex-btn"
    onClick={exportSelectedCsv}
    disabled={bulkWorking || loading}
  >
    Export selected
  </button>

  <button
    type="button"
    className="ex-btn ex-btn-danger"
    onClick={() => void bulkDelete()}
    disabled={bulkWorking || loading}
  >
    Delete
  </button>
</div>

            </div>
          )}

          <div className="ex-table-wrap">
            <table className="ex-table">
              <thead>
                <tr>
                  <th className="ex-th-check">
                    <input
                      type="checkbox"
                      className="ex-check"
                      checked={allVisibleSelected}
                      onChange={(e) => setAllVisible(e.target.checked)}
                      aria-label="Select all visible expenses"
                    />
                  </th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th className="ex-td-right">Amount</th>
                  <th className="ex-td-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 14, color: "var(--ex-muted)", fontWeight: 600 }}>
                      No expenses match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => {
                    const isSel = selectedId === row.id;
                    const busyDelete = deletingId === row.id;

                    return (
                      <tr
                        key={row.id}
                        className={"ex-row" + (isSel ? " ex-row--selected" : "")}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td className="ex-td-check" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="ex-check"
                            checked={bulkSelected.has(row.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              toggleBulk(row.id, (e as any).shiftKey === true);
                            }}
                            onChange={() => {}}
                            aria-label={`Select expense ${row.id}`}
                          />
                        </td>

                        <td>{dateOnly(row.incurred_on)}</td>

                        <td>
                          <span className={badgeClassFor(row.category)}>{row.category}</span>
                        </td>

                        <td>
                          {row.description?.trim() ? (
                            <span className="ex-desc">{row.description}</span>
                          ) : (
                            <span className="ex-desc">—</span>
                          )}
                        </td>

                        <td className="ex-td-right">{formatTzs(row.amount_tzs)} TZS</td>

                        <td className="ex-td-right">
                          <div className="ex-actions" onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="ex-icon-btn" title="Edit" onClick={() => openEdit(row)}>
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="ex-icon-btn"
                              title="Delete"
                              disabled={busyDelete}
                              onClick={() => void handleDelete(row)}
                            >
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
        <aside className="ex-card">
          <div className="ex-card-header">
            <div>
              <div className="ex-card-title">Expense details</div>
              <div className="ex-card-sub">{selected ? `#${selected.id}` : "Select a record"}</div>
            </div>

            {selected ? <span className={badgeClassFor(selected.category)}>{selected.category}</span> : null}
          </div>

          <div className="ex-card-body">
            {!selected ? (
              <div className="ex-empty">
                Click a row to view details. Use filters to focus on a period or category.
              </div>
            ) : (
              <>
                <div className="ex-kv">
                  <div className="ex-kv-item">
                    <div className="ex-kv-label">Amount</div>
                    <div className="ex-kv-value">{formatTzs(selected.amount_tzs)} TZS</div>
                  </div>

                  <div className="ex-kv-item">
                    <div className="ex-kv-label">Date</div>
                    <div className="ex-kv-value">{dateOnly(selected.incurred_on)}</div>
                  </div>

                  <div className="ex-kv-item">
                    <div className="ex-kv-label">Category</div>
                    <div className="ex-kv-value">{selected.category}</div>
                  </div>

                  <div className="ex-kv-item">
                    <div className="ex-kv-label">Updated</div>
                    <div className="ex-kv-value">{dateOnly(selected.updated_at)}</div>
                  </div>
                </div>

                <div className="ex-section">
                  <div className="ex-section-title">Notes</div>
                  <div className="ex-notes">{selected.description?.trim() ? selected.description : "—"}</div>

                  <div className="ex-detail-actions">
                    <button type="button" className="ex-btn ex-btn-primary" onClick={() => openEdit(selected)}>
                      Edit
                    </button>

                    <button
                      type="button"
                      className="ex-btn ex-btn-danger"
                      disabled={deletingId === selected.id}
                      onClick={() => void handleDelete(selected)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="ex-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ex-modal">
            <div className="ex-modal-header">
              <div>
                <div className="ex-modal-title">{editingId == null ? "New expense" : "Edit expense"}</div>
                <div className="ex-modal-sub">Tarehe + category + kiasi + maelezo mafupi. Simple and clear.</div>
              </div>

              <button
                type="button"
                className="ex-close"
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                  setForm({ incurred_on: todayYmd(), category: "other", amount_tzs: "", description: "" });
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form className="ex-form" onSubmit={(e) => void handleSubmit(e)}>
              <div className="ex-form-grid">
                <div className="ex-field" style={{ minWidth: "unset" }}>
                  <div className="ex-label">Date</div>
                  <input
                    className="ex-input"
                    type="date"
                    value={form.incurred_on}
                    onChange={(e) => setForm((f) => ({ ...f, incurred_on: e.target.value }))}
                  />
                </div>

                <div className="ex-field" style={{ minWidth: "unset" }}>
                  <div className="ex-label">Category</div>
                  <select
                    className="ex-select"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="ex-field" style={{ minWidth: "unset" }}>
                  <div className="ex-label">Amount (TZS)</div>
                  <input
                    className="ex-input"
                    value={form.amount_tzs}
                    onChange={(e) => setForm((f) => ({ ...f, amount_tzs: e.target.value.replace(/[^\d]/g, "") }))}
                    placeholder="Mfano: 12000"
                    inputMode="numeric"
                  />
                </div>

                <div className="ex-field" style={{ minWidth: "unset" }}>
                  <div className="ex-label">Short note</div>
                  <input
                    className="ex-input"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Mfano: malipo ya rider / umeme / rent…"
                  />
                </div>

                <div className="ex-field" style={{ minWidth: "unset", gridColumn: "1 / -1" }}>
                  <div className="ex-label">Notes (optional)</div>
                  <textarea
                    className="ex-textarea"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Andika maelezo kwa ufupi…"
                  />
                </div>
              </div>

              <div className="ex-form-row">
                <div className="ex-note">Tip: Use From/To filters to get monthly/weekly totals quickly.</div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className="ex-btn"
                    onClick={() => {
                      setShowModal(false);
                      setEditingId(null);
                      setForm({ incurred_on: todayYmd(), category: "other", amount_tzs: "", description: "" });
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button type="submit" className="ex-btn ex-btn-primary" disabled={saving}>
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
