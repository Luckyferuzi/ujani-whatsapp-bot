"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthProvider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormSectionSkeleton,
  Input,
  MetricValue,
  Select,
  Skeleton,
} from "@/components/ui";
import { authDelete, authGet, authPatchJson, authPostJson } from "@/lib/auth";

type UserRow = {
  id: number;
  email: string;
  role: "admin" | "staff";
  created_at?: string;
};

type UsersResponse = { users: UserRow[] };

type UserActivity = {
  user: UserRow;
  stats: {
    completed_orders: number;
    incomes_recorded: number;
    expenses_recorded: number;
    last_order_at: string | null;
  };
};

type NewStaffForm = {
  email: string;
  password: string;
};

function formatDate(d?: string) {
  return d ? new Date(d).toLocaleDateString("en-GB") : "-";
}

export default function ManageUsersPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStaff, setNewStaff] = useState<NewStaffForm>({ email: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "staff">("all");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") {
      router.replace("/inbox");
      return;
    }

    (async () => {
      try {
        const data = await authGet<UsersResponse>("/auth/users");
        setUsers(data.users);
      } catch {
        toast.error("Failed to load users.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router, user]);

  async function handleCreateStaff(e: FormEvent) {
    e.preventDefault();
    if (!newStaff.email || !newStaff.password) {
      toast.error("Enter staff email and password.");
      return;
    }

    try {
      setCreating(true);
      const res = await authPostJson<{ user: UserRow }>("/auth/staff", newStaff);
      setUsers((prev) => [res.user, ...prev]);
      setNewStaff({ email: "", password: "" });
      toast.success("Staff account created.");
    } catch {
      toast.error("Failed to create staff.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSelectUser(next: UserRow) {
    setSelectedId(next.id);
    setActivity(null);
    setActivityLoading(true);
    try {
      const data = await authGet<UserActivity>(`/auth/users/${next.id}/activity`);
      setActivity(data);
    } catch {
      toast.error("Failed to load user activity.");
    } finally {
      setActivityLoading(false);
    }
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      setSavingEdit(true);
      const updated = await authPatchJson<{ user: UserRow }>(`/auth/users/${editing.id}`, {
        email: editing.email,
        role: editing.role,
      });
      setUsers((prev) => prev.map((row) => (row.id === editing.id ? updated.user : row)));
      setEditing(null);
      toast.success("User updated.");
      if (selectedId === updated.user.id) {
        void handleSelectUser(updated.user);
      }
    } catch {
      toast.error("Failed to update user.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteUser(row: UserRow) {
    if (!window.confirm(`Delete ${row.email}?`)) return;
    try {
      await authDelete(`/auth/users/${row.id}`);
      setUsers((prev) => prev.filter((item) => item.id !== row.id));
      if (selectedId === row.id) {
        setSelectedId(null);
        setActivity(null);
      }
      toast.success("User deleted.");
    } catch {
      toast.error("Failed to delete user.");
    }
  }

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return users.filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (!s) return true;
      return row.email.toLowerCase().includes(s) || String(row.id).includes(s);
    });
  }, [roleFilter, search, users]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const adminCount = users.filter((row) => row.role === "admin").length;
  const staffCount = users.filter((row) => row.role === "staff").length;
  const selectedUser = users.find((row) => row.id === selectedId) ?? editing ?? null;

  if (!user) {
    return (
      <EmptyState
        eyebrow="Admin hub"
        title="Sign in to manage team access."
        description="Team and user controls are only available to authenticated administrators."
      />
    );
  }

  return (
    <div className="admin-hub-page">
      <PageHeader
        eyebrow="Admin hub"
        section="Team and users"
        title="Access Management"
        description="Manage operators, role assignments, and account-level activity from one enterprise-grade team surface."
        actions={
          <div className="admin-hub-actions">
            <Badge tone="accent">Admin only</Badge>
            <Badge tone="neutral">{users.length} accounts</Badge>
          </div>
        }
      />

      <div className="admin-hub-summary">
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Total accounts</div>
          <div className="admin-hub-stat-value"><MetricValue value={users.length} loading={loading} width="4ch" /></div>
          <div className="admin-hub-muted">All active admin and staff accounts.</div>
        </div>
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Administrators</div>
          <div className="admin-hub-stat-value"><MetricValue value={adminCount} loading={loading} width="4ch" /></div>
          <div className="admin-hub-muted">Users with full workspace control.</div>
        </div>
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Staff</div>
          <div className="admin-hub-stat-value"><MetricValue value={staffCount} loading={loading} width="4ch" /></div>
          <div className="admin-hub-muted">Operators currently assigned to daily work.</div>
        </div>
      </div>

      <div className="admin-hub-grid">
        <Card padding="lg" className="admin-hub-section">
          <div className="admin-hub-card-head">
            <div>
              <div className="admin-hub-eyebrow">Provisioning</div>
              <h3 className="admin-hub-title">Invite or create staff</h3>
            </div>
          </div>

          <form onSubmit={handleCreateStaff} className="admin-hub-form-grid">
            <div className="admin-hub-field">
              <label className="admin-hub-field-label" htmlFor="staffEmail">Staff email</label>
              <Input id="staffEmail" type="email" value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} />
            </div>
            <div className="admin-hub-field">
              <label className="admin-hub-field-label" htmlFor="staffPassword">Temporary password</label>
              <Input id="staffPassword" type="password" value={newStaff.password} onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })} />
            </div>
            <div className="admin-hub-field">
              <label className="admin-hub-field-label">Action</label>
              <Button type="submit" loading={creating}>Create staff account</Button>
            </div>
          </form>
        </Card>

        <Card tone="muted" padding="lg" className="admin-hub-section">
          <div className="admin-hub-card-head">
            <div>
              <div className="admin-hub-eyebrow">Control notes</div>
              <h3 className="admin-hub-title">Access governance</h3>
            </div>
          </div>
          <div className="admin-hub-list">
            <div className="admin-hub-list-item">
              <div className="admin-hub-title">Role clarity</div>
              <div className="admin-hub-copy">Use restrained role badges to distinguish full-control admins from operating staff.</div>
            </div>
            <div className="admin-hub-list-item">
              <div className="admin-hub-title">Focused detail view</div>
              <div className="admin-hub-copy">Select a user to inspect recent activity and edit role or email without leaving the table context.</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="admin-hub-main-grid">
        <Card padding="lg" className="admin-hub-section">
          <div className="admin-hub-toolbar">
            <div>
              <div className="admin-hub-eyebrow">Directory</div>
              <h3 className="admin-hub-title">Team directory</h3>
            </div>
            <div className="admin-hub-filter-row">
              <div className="admin-hub-field">
                <label className="admin-hub-field-label" htmlFor="userSearch">Search</label>
                <Input id="userSearch" type="search" placeholder="Search email or ID..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <div className="admin-hub-field">
                <label className="admin-hub-field-label" htmlFor="userRole">Role</label>
                <Select id="userRole" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as "all" | "admin" | "staff"); setPage(1); }}>
                  <option value="all">All roles</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </Select>
              </div>
              <div className="admin-hub-field">
                <label className="admin-hub-field-label" htmlFor="pageSize">Rows</label>
                <Select id="pageSize" value={String(pageSize)} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </Select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="admin-hub-section">
              <FormSectionSkeleton />
              <div className="admin-hub-table-wrap">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="admin-hub-skeleton-row">
                    <Skeleton style={{ height: 14 }} />
                    <Skeleton style={{ height: 14 }} />
                    <Skeleton style={{ height: 14 }} />
                    <Skeleton style={{ height: 14 }} />
                  </div>
                ))}
              </div>
            </div>
          ) : paginated.length === 0 ? (
            <div className="admin-hub-empty">
              <div className="admin-hub-empty-title">{users.length === 0 ? "No team members yet" : "No matching users"}</div>
              <div className="admin-hub-empty-copy">
                {users.length === 0
                  ? "Create the first staff account to start assigning operational access."
                  : "Adjust the search or role filter to widen the results."}
              </div>
            </div>
          ) : (
            <>
              <div className="admin-hub-table-wrap">
                <table className="admin-hub-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Created</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th className="admin-hub-text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((row) => (
                      <tr key={row.id} className={row.id === selectedId ? "is-active" : ""} onClick={() => void handleSelectUser(row)}>
                        <td>
                          <div className="admin-hub-cell-title">
                            <div className="admin-hub-cell-main">{row.email}</div>
                            <div className="admin-hub-cell-sub">User ID {row.id}</div>
                          </div>
                        </td>
                        <td>{formatDate(row.created_at)}</td>
                        <td><Badge tone={row.role === "admin" ? "accent" : "neutral"}>{row.role === "admin" ? "Admin" : "Staff"}</Badge></td>
                        <td><Badge tone="success">Active</Badge></td>
                        <td className="admin-hub-text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="admin-hub-row-actions">
                            <Button variant="ghost" size="sm" onClick={() => setEditing({ ...row })}>Edit</Button>
                            <Button variant="danger" size="sm" onClick={() => void handleDeleteUser(row)}>Delete</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="admin-hub-pagination">
                <div className="admin-hub-muted">Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}</div>
                <div className="admin-hub-inline-actions">
                  <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Prev</Button>
                  <Badge tone="neutral">Page {page} of {totalPages}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Next</Button>
                </div>
              </div>
            </>
          )}
        </Card>

        <div className="admin-hub-detail-stack">
          <Card padding="lg" className="admin-hub-section">
            <div className="admin-hub-card-head">
              <div>
                <div className="admin-hub-eyebrow">Selected user</div>
                <h3 className="admin-hub-title">Activity snapshot</h3>
              </div>
            </div>

            {!selectedId ? (
              <div className="admin-hub-empty">
                <div className="admin-hub-empty-title">Select a user</div>
                <div className="admin-hub-empty-copy">Choose any row from the directory to inspect operational activity and account context.</div>
              </div>
            ) : activityLoading ? (
              <div className="admin-hub-split">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="admin-hub-stat-card">
                    <Skeleton style={{ width: "46%", height: 12 }} />
                    <Skeleton style={{ width: "68%", height: 28 }} />
                    <Skeleton style={{ width: "90%", height: 12 }} />
                  </div>
                ))}
              </div>
            ) : activity ? (
              <>
                <div className="admin-hub-pill-row">
                  <Badge tone={activity.user.role === "admin" ? "accent" : "neutral"}>{activity.user.role}</Badge>
                  <Badge tone="success">Active</Badge>
                </div>
                <div className="admin-hub-split">
                  <div className="admin-hub-stat-card">
                    <div className="admin-hub-stat-label">Completed orders</div>
                    <div className="admin-hub-stat-value">{activity.stats.completed_orders}</div>
                  </div>
                  <div className="admin-hub-stat-card">
                    <div className="admin-hub-stat-label">Income entries</div>
                    <div className="admin-hub-stat-value">{activity.stats.incomes_recorded}</div>
                  </div>
                  <div className="admin-hub-stat-card">
                    <div className="admin-hub-stat-label">Expense entries</div>
                    <div className="admin-hub-stat-value">{activity.stats.expenses_recorded}</div>
                  </div>
                  <div className="admin-hub-stat-card">
                    <div className="admin-hub-stat-label">Last order</div>
                    <div className="admin-hub-copy">{activity.stats.last_order_at ? new Date(activity.stats.last_order_at).toLocaleString() : "No recent order"}</div>
                  </div>
                </div>
              </>
            ) : null}
          </Card>

          <Card padding="lg" className="admin-hub-section">
            <div className="admin-hub-card-head">
              <div>
                <div className="admin-hub-eyebrow">Edit surface</div>
                <h3 className="admin-hub-title">User details</h3>
              </div>
            </div>

            {!editing ? (
              <div className="admin-hub-empty">
                <div className="admin-hub-empty-title">Nothing in edit mode</div>
                <div className="admin-hub-empty-copy">Choose Edit on any user row to update role or email.</div>
              </div>
            ) : (
              <form onSubmit={handleSaveEdit} className="admin-hub-section">
                <div className="admin-hub-field">
                  <label className="admin-hub-field-label" htmlFor="editEmail">Email</label>
                  <Input id="editEmail" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </div>
                <div className="admin-hub-field">
                  <label className="admin-hub-field-label" htmlFor="editRole">Role</label>
                  <Select id="editRole" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as "admin" | "staff" })}>
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </Select>
                </div>
                <div className="admin-hub-inline-actions">
                  <Button type="submit" loading={savingEdit}>Save changes</Button>
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
