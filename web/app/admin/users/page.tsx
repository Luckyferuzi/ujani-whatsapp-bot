// web/app/admin/users/page.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import {
  authGet,
  authPostJson,
  authPatchJson,
  authDelete,
} from "@/lib/auth";

type UserRow = {
  id: number;
  email: string;
  role: "admin" | "staff";
  created_at?: string;
};

type UsersResponse = {
  users: UserRow[];
};

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

export default function ManageUsersPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create staff
  const [newStaff, setNewStaff] = useState<NewStaffForm>({
    email: "",
    password: "",
  });
  const [creating, setCreating] = useState(false);

  // Selection + activity
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  // Editing
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "staff">(
    "all"
  );

  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  // ===== INITIAL LOAD =====
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
      } catch (err) {
        toast.error("Failed to load users.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, router]);

  // ===== CREATE STAFF =====
  async function handleCreateStaff(e: FormEvent) {
    e.preventDefault();
    if (!newStaff.email || !newStaff.password) {
      toast.error("Enter staff email and password.");
      return;
    }

    try {
      setCreating(true);
      const res = await authPostJson<{ user: UserRow }>(
        "/auth/staff",
        newStaff
      );

      toast.success("Staff added.");
      setUsers((prev) => [res.user, ...prev]);
      setNewStaff({ email: "", password: "" });
    } catch {
      toast.error("Failed to create staff.");
    } finally {
      setCreating(false);
    }
  }

  // ===== SELECT USER ACTIVITY =====
  async function handleSelectUser(u: UserRow) {
    setSelectedId(u.id);
    setActivity(null);
    setActivityLoading(true);

    try {
      const data = await authGet<UserActivity>(
        `/auth/users/${u.id}/activity`
      );
      setActivity(data);
    } catch {
      toast.error("Failed to load activity.");
    } finally {
      setActivityLoading(false);
    }
  }

  // ===== EDIT USER =====
  function startEdit(u: UserRow) {
    setEditing({ ...u });
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;

    try {
      setSavingEdit(true);
      const updated = await authPatchJson<{ user: UserRow }>(
        `/auth/users/${editing.id}`,
        {
          email: editing.email,
          role: editing.role,
        }
      );

      setUsers((prev) =>
        prev.map((u) => (u.id === editing.id ? updated.user : u))
      );

      toast.success("User updated.");
      setEditing(null);

      if (selectedId === updated.user.id) {
        void handleSelectUser(updated.user);
      }
    } catch {
      toast.error("Failed to update user.");
    } finally {
      setSavingEdit(false);
    }
  }

  // ===== DELETE USER =====
  async function handleDeleteUser(u: UserRow) {
    if (!window.confirm(`Delete ${u.email}?`)) return;

    try {
      await authDelete(`/auth/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast.success("User deleted.");

      if (selectedId === u.id) {
        setSelectedId(null);
        setActivity(null);
      }
    } catch {
      toast.error("Failed to delete user.");
    }
  }

  // ===== FILTER & PAGINATION =====
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!s) return true;
      return (
        u.email.toLowerCase().includes(s) ||
        String(u.id).includes(s)
      );
    });
  }, [users, search, roleFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / pageSize)
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  function formatDate(d?: string) {
    return d ? new Date(d).toLocaleDateString("en-GB") : "—";
  }

  return (
    <div className="page-wrap">

      <h1 className="page-title">Manage Staff & Users</h1>

      {/* CREATE STAFF */}
      <div className="card">
        <h2 className="card-title">Add New Staff</h2>

        <form className="form-grid" onSubmit={handleCreateStaff}>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={newStaff.email}
              onChange={(e) =>
                setNewStaff({ ...newStaff, email: e.target.value })
              }
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              value={newStaff.password}
              onChange={(e) =>
                setNewStaff({ ...newStaff, password: e.target.value })
              }
            />
          </div>

          <div>
            <button disabled={creating} className="btn-primary">
              {creating ? "Adding..." : "Add Staff"}
            </button>
          </div>
        </form>
      </div>

      {/* FILTERS */}
      <div className="filters">
        <input
          type="search"
          className="search"
          placeholder="Search email or ID..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />

        <select
          className="select"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as any);
            setPage(1);
          }}
        >
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      {/* USERS TABLE */}
      <div className="table-wrap card">
        {loading ? (
          <p>Loading...</p>
        ) : paginated.length === 0 ? (
          <p>No users found.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Email</th>
                <th>Date Created</th>
                <th>Role</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>

            <tbody>
              {paginated.map((u, idx) => {
                const isSelected = u.id === selectedId;

                return (
                  <tr
                    key={u.id}
                    className={isSelected ? "selected-row" : ""}
                    onClick={() => handleSelectUser(u)}
                  >
                    <td>{(page - 1) * pageSize + idx + 1}</td>
                    <td>
                      <div className="email-cell">
                        <span>{u.email}</span>
                        <small>ID: {u.id}</small>
                      </div>
                    </td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>{u.role === "admin" ? "Admin" : "Staff"}</td>

                    <td>
                      <span className="badge badge-green">Active</span>
                    </td>

                    <td
                      className="actions text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="btn-action"
                        onClick={() => startEdit(u)}
                      >
                        Edit
                      </button>

                      <button
                        className="btn-danger"
                        onClick={() => handleDeleteUser(u)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* PAGINATION */}
        <div className="pagination">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>

          <span>
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
        </div>
      </div>

      {/* ACTIVITY PANEL */}
      <div className="card activity-card">
        <h2 className="card-title">User Activity</h2>

        {!selectedId && <p>Select a user to view activity.</p>}

        {selectedId && activityLoading && <p>Loading…</p>}

        {selectedId && activity && (
          <div className="activity-grid">
            <div className="activity-block">
              <div className="label">Completed Orders</div>
              <div className="value">{activity.stats.completed_orders}</div>
            </div>

            <div className="activity-block">
              <div className="label">Incomes Recorded</div>
              <div className="value">{activity.stats.incomes_recorded}</div>
            </div>

            <div className="activity-block">
              <div className="label">Expenses Recorded</div>
              <div className="value">{activity.stats.expenses_recorded}</div>
            </div>

            <div className="activity-block">
              <div className="label">Last Order</div>
              <div className="value">
                {activity.stats.last_order_at
                  ? new Date(activity.stats.last_order_at).toLocaleString()
                  : "—"}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EDIT USER CARD */}
      <div className="card">
        <h2 className="card-title">Edit User</h2>

        {!editing && (
          <p>Select a user and click <b>Edit</b> to modify.</p>
        )}

        {editing && (
          <form className="form-grid" onSubmit={handleSaveEdit}>
            <div className="col-2">
              <label>Email</label>
              <input
                type="email"
                value={editing.email}
                onChange={(e) =>
                  setEditing({ ...editing, email: e.target.value })
                }
              />
            </div>

            <div>
              <label>Role</label>
              <select
                value={editing.role}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    role: e.target.value as "admin" | "staff",
                  })
                }
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
            </div>

            <div className="col-2">
              <button className="btn-primary" disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
