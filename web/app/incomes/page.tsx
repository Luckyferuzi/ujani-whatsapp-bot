"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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

const STATUS_BADGE_CLASS: Record<IncomeStatus, string> = {
  pending: "badge bg-amber-50 text-amber-700 border-amber-200",
  approved: "badge bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "badge bg-red-50 text-red-700 border-red-200",
};

export default function IncomesPage() {
  const [items, setItems] = useState<IncomeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);

  const [form, setForm] = useState<FormState>({
    amount_tzs: "",
    description: "",
  });

  const loadIncomes = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const res = await api<ListResponse>(`/api/incomes?${params.toString()}`);
      setItems(res.items);
    } catch (err: any) {
      console.error(err);
      setError("Imeshindikana kupakia mapato.");
      toast.error("Imeshindikana kupakia mapato.", {
        description: "Jaribu tena muda mfupi baadaye.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadIncomes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const resetForm = () => {
    setForm({
      amount_tzs: "",
      description: "",
    });
    setEditingId(null);
  };

  const openNewIncomeForm = () => {
    resetForm();
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEdit = (row: IncomeRow) => {
    setEditingId(row.id);
    setForm({
      amount_tzs: String(row.amount_tzs),
      description: row.description ?? "",
    });
    setIsFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (row: IncomeRow) => {
    const ok = window.confirm("Unataka kufuta kipato hiki kabisa?");
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await api(`/api/incomes/${row.id}`, { method: "DELETE" });
      toast.success("Kipato kimefutwa.");
      void loadIncomes();
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kufuta kipato.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (row: IncomeRow, status: IncomeStatus) => {
    if (row.status === status) return;

    const label =
      status === "approved"
        ? "kulithibitisha (approved)"
        : status === "rejected"
        ? "kulikataa (rejected)"
        : "kubadilisha hali";

    const ok = window.confirm(
      `Una uhakika unataka ${label} kipato hiki?`
    );
    if (!ok) return;

    setUpdatingStatusId(row.id);
    try {
      const body = { status };
      const updated = await api<{ income: IncomeRow }>(
        `/api/incomes/${row.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      toast.success("Hali ya kipato imebadilishwa.");
      setItems((current) =>
        current.map((it) => (it.id === row.id ? updated.income : it))
      );
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kubadilisha hali ya kipato.");
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const amountNumeric = Number(form.amount_tzs);
    if (!amountNumeric || amountNumeric <= 0) {
      toast.error("Kiasi si sahihi.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        amount_tzs: Math.round(amountNumeric),
        description: form.description.trim() || undefined,
        // For manual incomes, backend will default source="manual"
      };

      if (!editingId) {
        // New manual income
        await api<{ income: IncomeRow }>("/api/incomes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Kipato kipya kimeongezwa.");
      } else {
        // Edit existing income (only amount & description)
        await api<{ income: IncomeRow }>(`/api/incomes/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Kipato kimehaririwa.");
      }

      resetForm();
      setIsFormVisible(false);
      void loadIncomes();
    } catch (err: any) {
      console.error(err);
      toast.error("Imeshindikana kuhifadhi kipato.");
    } finally {
      setSaving(false);
    }
  };

  // Derived stats from loaded items
  const totalApproved = items
    .filter((it) => it.status === "approved")
    .reduce((s, it) => s + it.amount_tzs, 0);

  const totalPending = items
    .filter((it) => it.status === "pending")
    .reduce((s, it) => s + it.amount_tzs, 0);

  const countRejected = items.filter((it) => it.status === "rejected").length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysApproved = items
    .filter(
      (it) =>
        it.status === "approved" &&
        it.recorded_at.slice(0, 10) === todayStr
    )
    .reduce((s, it) => s + it.amount_tzs, 0);

  return (
    <div className="page-root">
      <div className="page-inner space-y-6">
        {/* HEADER */}
        <div className="header-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="header-title">💰 Mapato ya Biashara</h1>
              <p className="header-sub">
                Hapa unaona mapato yote yanayotokana na order pamoja na
                mapato ya ziada (manual).
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                onClick={openNewIncomeForm}
              >
                <span>➕</span>
                <span>Ongeza kipato (manual)</span>
              </button>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Chuja:</span>
                <select
                  className="field-input px-2 py-1 text-xs h-7"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                >
                  <option value="all">Yote</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>

          {/* KPI CARDS */}
          <div className="kpi-grid mt-4">
            <div className="kpi-card">
              <p className="kpi-label">Rekodi</p>
              <p className="kpi-value">{items.length}</p>
              <p className="kpi-sub">
                Idadi ya kipato ndani ya kisicho zaidi ya 100 rekodi.
              </p>
            </div>

            <div className="kpi-card kpi-green">
              <p className="kpi-label">Approved (jumla)</p>
              <p className="kpi-value">
                {totalApproved.toLocaleString("sw-TZ")} TZS
              </p>
              <p className="kpi-sub">
                Jumla ya mapato yaliyothibitishwa kutoka kwenye orodha hii.
              </p>
            </div>

            <div className="kpi-card">
              <p className="kpi-label">Pending (jumla)</p>
              <p className="kpi-value">
                {totalPending.toLocaleString("sw-TZ")} TZS
              </p>
              <p className="kpi-sub">
                Mapato yanayosubiri kuthibitishwa au kukataliwa.
              </p>
            </div>

            <div className="kpi-card">
              <p className="kpi-label">Rejected (idadi)</p>
              <p className="kpi-value">{countRejected}</p>
              <p className="kpi-sub">Rekodi zilizokataliwa.</p>
            </div>

            <div className="kpi-card">
              <p className="kpi-label">Approved leo</p>
              <p className="kpi-value">
                {todaysApproved.toLocaleString("sw-TZ")} TZS
              </p>
              <p className="kpi-sub">Zinazoonekana kwenye orodha hii.</p>
            </div>
          </div>
        </div>

        {/* FORM – only visible when toggled */}
        {isFormVisible && (
          <form onSubmit={handleSubmit} className="panel-card form-card">
            <div className="section-header flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="section-title">
                  {editingId
                    ? "✏️ Hariri kipato"
                    : "➕ Ongeza kipato kipya (manual)"}
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

              {/* CLOSE ICON */}
              <button
                type="button"
                className="btn-ghost text-lg leading-none"
                onClick={() => {
                  resetForm();
                  setIsFormVisible(false);
                }}
                aria-label="Funga fomu ya kipato"
              >
                ✖
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="field-label">Kiasi (TZS)</label>
                <input
                  type="number"
                  className="field-input"
                  value={form.amount_tzs}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      amount_tzs: e.target.value,
                    }))
                  }
                  placeholder="Mf. 25000"
                />
              </div>

              <div className="md:col-span-2">
                <label className="field-label">Maelezo</label>
                <input
                  type="text"
                  className="field-input"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Mf. mauzo ya siku / huduma nyingine"
                />
              </div>
            </div>

            <button className="btn-primary mt-4" disabled={saving}>
              {saving
                ? "Inahifadhi..."
                : editingId
                ? "Hifadhi mabadiliko"
                : "Hifadhi kipato"}
            </button>
          </form>
        )}

        {/* TABLE */}
        <div className="panel-card">
          <div className="section-header">
            <h2 className="section-title">📗 Orodha ya mapato</h2>
            <p className="section-sub">
              Mapato ya hivi karibuni, pamoja na yaliyotokana na order.
            </p>
          </div>

          {loading && <p className="muted">Inapakia...</p>}

          {!loading && error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="muted">
              Hakuna kipato kilichopatikana kwa vigezo vilivyochaguliwa.
            </p>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarehe</th>
                    <th>Chanzo</th>
                    <th>Order</th>
                    <th>Mteja</th>
                    <th className="text-right">Kiasi</th>
                    <th>Hali</th>
                    <th>Maelezo</th>
                    <th className="text-right">Vitendo</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const isUpdatingStatus =
                      updatingStatusId === row.id;
                    const isDeleting = deletingId === row.id;

                    return (
                      <tr key={row.id}>
                        <td>{row.recorded_at.slice(0, 10)}</td>
                        <td>{row.source || "order"}</td>
                        <td>
                          {row.order_code ? (
                            <span className="font-medium">
                              {row.order_code}
                            </span>
                          ) : (
                            <span className="text-slate-400">
                              (manual)
                            </span>
                          )}
                        </td>
                        <td>
                          {row.customer_name ? (
                            <>
                              <div className="font-medium">
                                {row.customer_name}
                              </div>
                              {row.customer_phone && (
                                <div className="text-xs text-slate-500">
                                  {row.customer_phone}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-400">
                              (hakuna taarifa)
                            </span>
                          )}
                        </td>
                        <td className="text-right font-medium">
                          {row.amount_tzs.toLocaleString("sw-TZ")} TZS
                        </td>
                        <td>
                          <span
                            className={
                              STATUS_BADGE_CLASS[row.status] ??
                              "badge"
                            }
                          >
                            {row.status}
                          </span>
                        </td>
                        <td>
                          {row.description || (
                            <span className="text-slate-400">
                              (Hakuna)
                            </span>
                          )}
                        </td>
                        <td className="text-right space-x-2 whitespace-nowrap">
                          {row.status === "pending" && (
                            <>
                              <button
                                type="button"
                                className="btn-ghost text-xs text-emerald-700"
                                disabled={isUpdatingStatus}
                                onClick={() =>
                                  handleStatusChange(
                                    row,
                                    "approved"
                                  )
                                }
                              >
                                {isUpdatingStatus
                                  ? "Inathibitisha..."
                                  : "Approve"}
                              </button>
                              <button
                                type="button"
                                className="btn-ghost text-xs text-red-600"
                                disabled={isUpdatingStatus}
                                onClick={() =>
                                  handleStatusChange(
                                    row,
                                    "rejected"
                                  )
                                }
                              >
                                {isUpdatingStatus
                                  ? "Inakataa..."
                                  : "Reject"}
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            onClick={() => handleEdit(row)}
                          >
                            Hariri
                          </button>

                          <button
                            type="button"
                            className="btn-ghost text-xs text-red-600"
                            disabled={isDeleting}
                            onClick={() => handleDelete(row)}
                          >
                            {isDeleting ? "Inafuta..." : "Futa"}
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
