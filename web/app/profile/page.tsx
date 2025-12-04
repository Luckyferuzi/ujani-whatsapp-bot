// web/app/profile/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { authGet, authPatchJson } from "@/lib/auth";

type MeResponse = {
  user: {
    id: number;
    email: string;
    role: "admin" | "staff";
  };
};

export default function ProfilePage() {
  const { user, token } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<"admin" | "staff" | "">(
    user?.role ?? ""
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Optional: refresh profile from backend
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await authGet<MeResponse>("/auth/me");
        setEmail(data.user.email);
        setRole(data.user.role);
      } catch (err) {
        console.error("failed to load profile", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const payload: Record<string, string> = {};
    if (email && email !== user?.email) {
      payload.email = email;
    }

    if (newPassword || confirm || currentPassword) {
      if (!currentPassword) {
        toast.error("Weka nenosiri la sasa kwanza.");
        return;
      }
      if (newPassword !== confirm) {
        toast.error("Manenosiri mapya hayafanani.");
        return;
      }
      if (!newPassword) {
        toast.error("Weka nenosiri jipya.");
        return;
      }
      payload.password = newPassword;
      // Note: backend as currently defined does not verify currentPassword;
      // if you add that later, also send it here.
    }

    if (Object.keys(payload).length === 0) {
      toast.info("Hakuna mabadiliko ya kuhifadhi.");
      return;
    }

    try {
      setSaving(true);
      await authPatchJson<{ ok: boolean }>("/auth/profile", payload);
      toast.success("Profaili imehifadhiwa.");
    } catch (err: any) {
      console.error("profile update failed", err);
      toast.error(
        err?.message || "Imeshindikana kubadili taarifa za profaili."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="p-4 text-sm text-ui-dim">
        Tafadhali ingia kwanza.
      </div>
    );
  }

  return (
    <div className="auth-root">
      <div className="auth-card max-w-lg">
        <div className="auth-header">
          <div className="topbar-brand-icon">👤</div>
          <div className="auth-title">My profile</div>
        </div>
        <p className="auth-subtitle">
          Badilisha barua pepe (username) na nenosiri la akaunti yako.
        </p>

        {loading ? (
          <div className="text-sm text-ui-dim py-4">Inapakia...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <div className="auth-field-label">Barua pepe (username)</div>
              <input
                type="email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-label">Jukumu</div>
              <input
                type="text"
                className="auth-input"
                value={role || user.role}
                disabled
              />
            </div>

            <div className="mt-4 mb-1 text-xs text-ui-dim uppercase tracking-wide">
              Badili nenosiri
            </div>

            <div className="auth-field">
              <div className="auth-field-label">Nenosiri la sasa</div>
              <input
                type="password"
                className="auth-input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-label">Nenosiri jipya</div>
              <input
                type="password"
                className="auth-input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-label">Rudia nenosiri jipya</div>
              <input
                type="password"
                className="auth-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            <div className="auth-actions mt-3">
              <button
                type="submit"
                disabled={saving}
                className="auth-primary-btn"
              >
                {saving ? "Inahifadhi..." : "Hifadhi mabadiliko"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
