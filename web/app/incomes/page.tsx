"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, get } from "@/lib/api";
import { toast } from "sonner";

type IncomeStatus = "pending" | "approved" | "rejected";

type IncomeRow = {
  id: number;
  order_id: number | null;
  amount_tzs: number;
  status: IncomeStatus;
  source: string;
  description: string | null;
  recorded_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
  order_code?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
};

type ListResponse = { items: IncomeRow[] };

type StatusFilter = "all" | IncomeStatus;

type FormState = {
  amount_tzs: string;
  description: string;
};

const badgeClass: Record<IncomeStatus, string> = {
  pending: "ic-badge ic-badge--pending",
  approved: "ic-badge ic-badge--approved",
  rejected: "ic-badge ic-badge--rejected",
};

function formatTzs(v: number) {
  return Math.floor(v).toLocaleString("sw-TZ");
}

function dateOnly(iso: string) {
  // safe: recorded_at is ISO
  return (iso || "").slice(0, 10);
}

export default function IncomesPage() {
  const [items, setItems] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState<string>("");
const [toDate, setToDate] = useState<string>("");

const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
const [bulkWorking, setBulkWorking] = useState(false);
const [bulkAnchorIndex, setBulkAnchorIndex] = useState<number | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Modal (add/edit manual income)
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  const [form, setForm] = useState<FormState>({
    amount_tzs: "",
    description: "",
  });

  async function loadIncomes() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await get<ListResponse>(`/api/incomes?${params.toString()}`);
      setItems(res.items ?? []);
      setBulkSelected((prev) => {
  const next = new Set<number>();
  for (const it of res.items ?? []) {
    if (prev.has(it.id)) next.add(it.id);
  }
  return next;
});


      setSelectedId((prev) => {
        if (prev == null) return null;
        return (res.items ?? []).some((x) => x.id === prev) ? prev : null;
      });
    } catch (err: any) {
      console.error(err);
      setError("Imeshindikana kupakia mapato.");
      toast.error("Imeshindikana kupakia mapato.", {
        description: "Jaribu tena muda mfupi baadaye.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadIncomes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const selected = useMemo(() => {
    return selectedId == null ? null : items.find((x) => x.id === selectedId) ?? null;
  }, [items, selectedId]);

const filtered = useMemo(() => {
  const q = search.trim().toLowerCase();

  return items.filter((x) => {
    // Date range (YYYY-MM-DD string compare is safe)
    const d = dateOnly(x.recorded_at);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;

    // Search
    if (!q) return true;

    const hay =
      [
        x.source,
        x.description ?? "",
        x.order_code ?? "",
        x.customer_name ?? "",
        x.customer_phone ?? "",
        String(x.amount_tzs),
        x.status,
      ]
        .join(" ")
        .toLowerCase();

    return hay.includes(q);
  });
}, [items, search, fromDate, toDate]);


  const totals = useMemo(() => {
    const approvedSum = items
      .filter((x) => x.status === "approved")
      .reduce((s, x) => s + x.amount_tzs, 0);

    const pendingSum = items
      .filter((x) => x.status === "pending")
      .reduce((s, x) => s + x.amount_tzs, 0);

    const today = new Date().toISOString().slice(0, 10);
    const todayApproved = items
      .filter((x) => x.status === "approved" && dateOnly(x.recorded_at) === today)
      .reduce((s, x) => s + x.amount_tzs, 0);

    return {
      count: items.length,
      approvedSum,
      pendingSum,
      todayApproved,
    };
  }, [items]);

  const grouped = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);

    const buckets: Record<"today" | "yesterday" | "older", IncomeRow[]> = {
      today: [],
      yesterday: [],
      older: [],
    };

    for (const it of filtered) {
      const d = new Date(it.recorded_at);
      if (!Number.isNaN(d.getTime()) && d >= startToday) buckets.today.push(it);
      else if (!Number.isNaN(d.getTime()) && d >= startYesterday) buckets.yesterday.push(it);
      else buckets.older.push(it);
    }

    const out: { key: "today" | "yesterday" | "older"; title: string; rows: IncomeRow[] }[] = [];
    if (buckets.today.length) out.push({ key: "today", title: "Today", rows: buckets.today });
    if (buckets.yesterday.length) out.push({ key: "yesterday", title: "Yesterday", rows: buckets.yesterday });
    if (buckets.older.length) out.push({ key: "older", title: "Older", rows: buckets.older });
    return out;
  }, [filtered]);

  const filteredIdToIndex = useMemo(() => {
  const m = new Map<number, number>();
  filtered.forEach((r, idx) => m.set(r.id, idx));
  return m;
}, [filtered]);

const allVisibleSelected = useMemo(() => {
  if (!filtered.length) return false;
  for (const r of filtered) {
    if (!bulkSelected.has(r.id)) return false;
  }
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

    // Shift range selection within current filtered list
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

async function bulkSetStatus(status: IncomeStatus) {
  const ids = Array.from(bulkSelected);
  if (!ids.length) return;

  const label = status === "approved" ? "Approve" : status === "rejected" ? "Reject" : "Update";

  if (!window.confirm(`${label} ${ids.length} record(s)?`)) return;

  setBulkWorking(true);
  let ok = 0;
  let fail = 0;

  try {
    for (const id of ids) {
      try {
        await api(`/api/incomes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        ok += 1;
      } catch {
        fail += 1;
      }
    }

    if (fail === 0) toast.success(`${label}d ${ok} record(s).`);
    else toast.message(`${label}d ${ok}. Failed ${fail}.`);
  } finally {
    setBulkWorking(false);
    setBulkSelected(new Set());
    setBulkAnchorIndex(null);
    void loadIncomes();
  }
}

function exportSelectedCsv() {
  const rows = filtered.filter((r) => bulkSelected.has(r.id));
  if (!rows.length) return;

  const header = [
    "Income ID",
    "Recorded date",
    "Source",
    "Status",
    "Amount TZS",
    "Order code",
    "Customer name",
    "Customer phone",
    "Description",
  ];

  const csvLines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.id,
        dateOnly(r.recorded_at),
        r.source ?? "",
        r.status ?? "",
        r.amount_tzs ?? "",
        r.order_code ?? "",
        r.customer_name ?? "",
        r.customer_phone ?? "",
        r.description ?? "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `incomes-selected-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success(`Exported ${rows.length} record(s).`);
}


  function openNew() {
    setEditingId(null);
    setForm({ amount_tzs: "", description: "" });
    setShowModal(true);
  }

  function openEdit(row: IncomeRow) {
    setEditingId(row.id);
    setForm({
      amount_tzs: String(row.amount_tzs),
      description: row.description ?? "",
    });
    setShowModal(true);
  }

  async function handleDelete(row: IncomeRow) {
    const ok = window.confirm("Unataka kufuta kipato hiki kabisa? (Hakikisha ni sahihi)");
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await api(`/api/incomes/${row.id}`, { method: "DELETE" });
      toast.success("Kipato kimefutwa.");
      if (selectedId === row.id) setSelectedId(null);
      void loadIncomes();
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kufuta kipato.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStatusChange(row: IncomeRow, status: IncomeStatus) {
    if (row.status === status) return;

    const label =
      status === "approved" ? "Approve" : status === "rejected" ? "Reject" : "Badilisha hali";

    const ok = window.confirm(`${label}: una uhakika?`);
    if (!ok) return;

    setUpdatingStatusId(row.id);
    try {
      const updated = await api<{ income: IncomeRow }>(`/api/incomes/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      toast.success("Hali ya kipato imebadilishwa.");
      setItems((cur) => cur.map((x) => (x.id === row.id ? updated.income : x)));
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kubadilisha hali ya kipato.");
    } finally {
      setUpdatingStatusId(null);
    }
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
        amount_tzs: Math.round(amountNumeric),
        description: form.description.trim() || undefined,
      };

      if (!editingId) {
        await api<{ income: IncomeRow }>("/api/incomes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Kipato kipya kimeongezwa.");
      } else {
        await api<{ income: IncomeRow }>(`/api/incomes/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Kipato kimehaririwa.");
      }

      setShowModal(false);
      setEditingId(null);
      setForm({ amount_tzs: "", description: "" });
      void loadIncomes();
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kuhifadhi kipato.");
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const rows = filtered;
    const header = [
      "Income ID",
      "Recorded date",
      "Source",
      "Status",
      "Amount TZS",
      "Order code",
      "Customer name",
      "Customer phone",
      "Description",
    ];

    const csvLines = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.id,
          dateOnly(r.recorded_at),
          r.source ?? "",
          r.status ?? "",
          r.amount_tzs ?? "",
          r.order_code ?? "",
          r.customer_name ?? "",
          r.customer_phone ?? "",
          r.description ?? "",
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incomes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${rows.length} record(s).`);
  }

  return (
    <div className="incomes-page">
      {/* Topbar */}
      <div className="ic-topbar">
        <div>
          <div className="ic-title">Income</div>
          <div className="ic-subtitle">
            Mapato ya biashara: order income + manual income. Chagua rekodi ili kuona details na kufanya approve/reject.
          </div>
        </div>

        <div className="ic-top-actions">
          <Link
            href="/orders"
            className="ic-btn"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            ← Orders
          </Link>

          <button type="button" className="ic-btn" onClick={exportCsv} disabled={loading}>
            Export CSV
          </button>

          <button type="button" className="ic-btn ic-btn-primary" onClick={openNew}>
            + Manual income
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="ic-controls">
        <div className="ic-field" style={{ minWidth: 260 }}>
          <div className="ic-label">Search</div>
          <input
            className="ic-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order code, customer, phone, amount, description…"
          />
        </div>

        <div className="ic-field">
          <div className="ic-label">Status</div>
          <select
            className="ic-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div className="ic-field" style={{ minWidth: 160 }}>
  <div className="ic-label">From</div>
  <input
    className="ic-input"
    type="date"
    value={fromDate}
    onChange={(e) => setFromDate(e.target.value)}
  />
</div>

<div className="ic-field" style={{ minWidth: 160 }}>
  <div className="ic-label">To</div>
  <input
    className="ic-input"
    type="date"
    value={toDate}
    onChange={(e) => setToDate(e.target.value)}
  />
</div>


        <div className="ic-chips">
          <span className="ic-chip">Records: {totals.count}</span>
          <span className="ic-chip ic-chip--ok">Approved: {formatTzs(totals.approvedSum)} TZS</span>
          <span className="ic-chip ic-chip--warn">Pending: {formatTzs(totals.pendingSum)} TZS</span>
          <span className="ic-chip">Today approved: {formatTzs(totals.todayApproved)} TZS</span>
        </div>
      </div>

      {/* Shell */}
      <div className="ic-shell">
        {/* Left: Table */}
        <div className="ic-card">
          <div className="ic-card-header">
            <div>
              <div className="ic-card-title">Income records</div>
              <div className="ic-card-sub">
                {loading ? "Loading…" : `${filtered.length} shown · ${items.length} total`}
              </div>
            </div>

            {error ? (
              <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 650 }}>{error}</div>
            ) : null}
          </div>

            {bulkSelected.size > 0 && (
  <div className="ic-bulk">
    <div className="ic-bulk-left">
      <span className="ic-bulk-count">{bulkSelected.size} selected</span>
      <span className="ic-bulk-tip">Tip: Shift-click selects a range</span>

      <button
        type="button"
        className="ic-bulk-link"
        onClick={() => {
          setBulkSelected(new Set());
          setBulkAnchorIndex(null);
        }}
        disabled={bulkWorking || loading}
      >
        Clear
      </button>
    </div>

    <div className="ic-bulk-actions">
      <button
        type="button"
        className="ic-btn ic-btn-primary"
        onClick={() => void bulkSetStatus("approved")}
        disabled={bulkWorking || loading}
      >
        Approve
      </button>

      <button
        type="button"
        className="ic-btn ic-btn-danger"
        onClick={() => void bulkSetStatus("rejected")}
        disabled={bulkWorking || loading}
      >
        Reject
      </button>

      <button
        type="button"
        className="ic-btn"
        onClick={() => exportSelectedCsv()}
        disabled={bulkWorking || loading}
      >
        Export selected
      </button>
    </div>
  </div>
)}


          <div className="ic-table-wrap">
            <table className="ic-table">
              <thead>
                <tr>
                  <th className="ic-th-check">
  <input
    type="checkbox"
    className="ic-check"
    checked={allVisibleSelected}
    onChange={(e) => setAllVisible(e.target.checked)}
    aria-label="Select all visible income records"
  />
</th>

                  <th>Date</th>
                  <th>Source</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th className="ic-td-right">Amount</th>
                  <th>Status</th>
                  <th className="ic-td-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 14, color: "var(--ic-muted)", fontWeight: 600 }}>
                      No income records match your filters.
                    </td>
                  </tr>
                ) : (
                  grouped.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="ic-group-row">
                        <td colSpan={8}>{g.title}</td>
                      </tr>

                      {g.rows.map((row) => {
                        const isSel = selectedId === row.id;
                        const isPending = row.status === "pending";
                        const busyStatus = updatingStatusId === row.id;
                        const busyDelete = deletingId === row.id;

                        return (
                          <tr
                            key={row.id}
                            className={"ic-row" + (isSel ? " ic-row--selected" : "")}
                            onClick={() => setSelectedId(row.id)}
                          >
                            <td className="ic-td-check" onClick={(e) => e.stopPropagation()}>
  <input
    type="checkbox"
    className="ic-check"
    checked={bulkSelected.has(row.id)}
    onClick={(e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleBulk(row.id, (e as any).shiftKey === true);
    }}
    onChange={() => {}}
    aria-label={`Select income ${row.id}`}
  />
</td>

                            <td>{dateOnly(row.recorded_at)}</td>
                            <td>{row.source || "order"}</td>
                            <td>{row.order_code ? row.order_code : <span style={{ color: "var(--ic-muted)" }}>(manual)</span>}</td>

                            <td>
                              {row.customer_name ? (
                                <div className="ic-customer">
                                  <div className="ic-customer-name">{row.customer_name}</div>
                                  {row.customer_phone ? (
                                    <div className="ic-customer-phone">{row.customer_phone}</div>
                                  ) : null}
                                </div>
                              ) : (
                                <span style={{ color: "var(--ic-muted)" }}>—</span>
                              )}
                            </td>

                            <td className="ic-td-right">{formatTzs(row.amount_tzs)} TZS</td>

                            <td>
                              <span className={badgeClass[row.status]}>{row.status}</span>
                            </td>

                            <td className="ic-td-right">
                              <div className="ic-actions" onClick={(e) => e.stopPropagation()}>
                                {isPending ? (
                                  <>
                                    <button
                                      type="button"
                                      className="ic-icon-btn"
                                      title="Approve"
                                      disabled={busyStatus}
                                      onClick={() => void handleStatusChange(row, "approved")}
                                    >
                                      ✅
                                    </button>
                                    <button
                                      type="button"
                                      className="ic-icon-btn"
                                      title="Reject"
                                      disabled={busyStatus}
                                      onClick={() => void handleStatusChange(row, "rejected")}
                                    >
                                      ⛔
                                    </button>
                                  </>
                                ) : null}

                                <button type="button" className="ic-icon-btn" title="Edit" onClick={() => openEdit(row)}>
                                  ✏️
                                </button>

                                <button
                                  type="button"
                                  className="ic-icon-btn"
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
                      })}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Details */}
        <aside className="ic-card">
          <div className="ic-card-header">
            <div>
              <div className="ic-card-title">Income details</div>
              <div className="ic-card-sub">{selected ? `#${selected.id}` : "Select a record"}</div>
            </div>

            {selected ? <span className={badgeClass[selected.status]}>{selected.status}</span> : null}
          </div>

          <div className="ic-card-body">
            {!selected ? (
              <div className="ic-empty">
                Click a row to view details. Pending records can be approved/rejected quickly.
              </div>
            ) : (
              <>
                <div className="ic-kv">
                  <div className="ic-kv-item">
                    <div className="ic-kv-label">Amount</div>
                    <div className="ic-kv-value">{formatTzs(selected.amount_tzs)} TZS</div>
                  </div>

                  <div className="ic-kv-item">
                    <div className="ic-kv-label">Recorded date</div>
                    <div className="ic-kv-value">{dateOnly(selected.recorded_at)}</div>
                  </div>

                  <div className="ic-kv-item">
                    <div className="ic-kv-label">Source</div>
                    <div className="ic-kv-value">{selected.source || "order"}</div>
                  </div>

                  <div className="ic-kv-item">
                    <div className="ic-kv-label">Order</div>
                    <div className="ic-kv-value">{selected.order_code || "manual"}</div>
                  </div>

                  <div className="ic-kv-item">
                    <div className="ic-kv-label">Customer</div>
                    <div className="ic-kv-value">{selected.customer_name || "—"}</div>
                  </div>

                  <div className="ic-kv-item">
                    <div className="ic-kv-label">Phone</div>
                    <div className="ic-kv-value">{selected.customer_phone || "—"}</div>
                  </div>
                </div>

                <div className="ic-section">
                  <div className="ic-section-title">Description</div>
                  <div className="ic-desc">{selected.description?.trim() ? selected.description : "—"}</div>

                  <div className="ic-detail-actions">
                    {selected.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className="ic-btn ic-btn-primary"
                          disabled={updatingStatusId === selected.id}
                          onClick={() => void handleStatusChange(selected, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ic-btn ic-btn-danger"
                          disabled={updatingStatusId === selected.id}
                          onClick={() => void handleStatusChange(selected, "rejected")}
                        >
                          Reject
                        </button>
                      </>
                    ) : null}

                    <button type="button" className="ic-btn" onClick={() => openEdit(selected)}>
                      Edit
                    </button>

                    <button
                      type="button"
                      className="ic-btn ic-btn-danger"
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
        <div className="ic-modal-backdrop" role="dialog" aria-modal="true">
          <div className="ic-modal">
            <div className="ic-modal-header">
              <div>
                <div className="ic-modal-title">{editingId == null ? "Manual income" : "Edit income"}</div>
                <div className="ic-modal-sub">Weka kiasi na maelezo mafupi. (Simple, admin-friendly)</div>
              </div>

              <button
                type="button"
                className="ic-close"
                onClick={() => {
                  setShowModal(false);
                  setEditingId(null);
                  setForm({ amount_tzs: "", description: "" });
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form className="ic-form" onSubmit={(e) => void handleSubmit(e)}>
              <div className="ic-form-grid">
                <div className="ic-field" style={{ minWidth: "unset" }}>
                  <div className="ic-label">Amount (TZS)</div>
                  <input
                    className="ic-input"
                    value={form.amount_tzs}
                    onChange={(e) => setForm((f) => ({ ...f, amount_tzs: e.target.value.replace(/[^\d]/g, "") }))}
                    placeholder="Mfano: 25000"
                    inputMode="numeric"
                  />
                </div>

                <div className="ic-field" style={{ minWidth: "unset" }}>
                  <div className="ic-label">Description</div>
                  <input
                    className="ic-input"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Mfano: Mauzo ya siku / huduma nyingine"
                  />
                </div>

                <div className="ic-field" style={{ minWidth: "unset", gridColumn: "1 / -1" }}>
                  <div className="ic-label">Notes (optional)</div>
                  <textarea
                    className="ic-textarea"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Andika maelezo kwa ufupi…"
                  />
                </div>
              </div>

              <div className="ic-form-row">
                <div className="ic-note">Tip: Approve/reject order income from the table (Pending).</div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className="ic-btn"
                    onClick={() => {
                      setShowModal(false);
                      setEditingId(null);
                      setForm({ amount_tzs: "", description: "" });
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button type="submit" className="ic-btn ic-btn-primary" disabled={saving}>
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
