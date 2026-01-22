"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bootstrapAdmin } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";

export default function RegisterAdminPage() {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirm, setConfirm] = useState<string>("");
  const [showPass, setShowPass] = useState<boolean>(false);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const canSubmit = useMemo(() => {
    const em = email.trim();
    return (
      em.length > 0 &&
      password.length >= 6 &&
      confirm.length >= 6 &&
      password === confirm &&
      !busy
    );
  }, [email, password, confirm, busy]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const em = email.trim().toLowerCase();
    if (!em || !password || !confirm) return toast.error("Tafadhali jaza sehemu zote.");
    if (password.length < 6) return toast.error("Nenosiri liwe angalau herufi 6.");
    if (password !== confirm) return toast.error("Manenosiri hayafanani.");

    try {
      setBusy(true);
      const auth = await bootstrapAdmin(em, password);
      setAuth(auth);
      toast.success("Admin wa kwanza amesajiliwa.");
      router.push("/inbox");
    } catch (err: any) {
      toast.error(
        err?.message ||
          "Imeshindikana kusajili admin. Inawezekana tayari kuna admin aliyeundwa."
      );
    } finally {
      setBusy(false);
    }
  }

  const passMismatch = confirm.length > 0 && password !== confirm;

  return (
    <div className="auth-split">
      {/* LEFT: Summary */}
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="auth-brand">
            <div className="auth-brand-mark">UJ</div>
            <div>
              <div className="auth-brand-name">First-time Setup</div>
              <div className="auth-brand-sub">
                Create the first admin account to unlock settings and WhatsApp integration management.
              </div>
            </div>
          </div>

          <div className="auth-left-card">
            <div className="auth-left-title">Admin permissions include</div>

            <div className="auth-perms">
              <div className="auth-perm">
                <div className="auth-perm-title">Settings Control</div>
                <div className="auth-perm-sub">
                  Weka business info, bot menu, na WhatsApp profile configuration.
                </div>
              </div>
              <div className="auth-perm">
                <div className="auth-perm-title">Team Management</div>
                <div className="auth-perm-sub">
                  Unda staff accounts na weka roles (admin/staff/supervisor).
                </div>
              </div>
              <div className="auth-perm">
                <div className="auth-perm-title">Go Live Tools</div>
                <div className="auth-perm-sub">
                  Test menu flows, catalogue, na kuona activity kwenye dashboard.
                </div>
              </div>
            </div>

            <div className="auth-note">
              Security note: Tumia barua pepe ya biashara + nenosiri imara. Baada ya setup, admin anaweza kubadilisha password kwenye “My Account”.
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Form */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-title">Sajili Admin wa Kwanza</div>
          <div className="auth-subtitle">
            Hatua hii ni mara moja tu. Baada ya hapo, admin ataongeza staff kwenye mfumo.
          </div>

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <div className="auth-field-label">Barua pepe ya admin</div>
              <input
                type="email"
                className="auth-input"
                placeholder="admin@ujani.co.tz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-label">Nenosiri (min 6)</div>
              <div className="auth-input-wrap">
                <input
                  type={showPass ? "text" : "password"}
                  className="auth-input auth-input--with-action"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-input-action"
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="auth-field">
              <div className="auth-field-label">Rudia nenosiri</div>
              <div className="auth-input-wrap">
                <input
                  type={showConfirm ? "text" : "password"}
                  className="auth-input auth-input--with-action"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-input-action"
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? "Hide" : "Show"}
                </button>
              </div>

              {passMismatch ? (
                <div className="auth-inline-warn">Manenosiri hayafanani.</div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="auth-primary-btn"
            >
              {busy ? "Inasajili..." : "Sajili admin"}
            </button>
          </form>

          <div className="auth-footer">
            Tayari una admin?{" "}
            <button type="button" onClick={() => router.push("/login")}>
              Nenda kwenye login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
