"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bootstrapAdmin } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";

export default function RegisterAdminPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!email || !password || !confirm) {
      toast.error("Tafadhali jaza sehemu zote.");
      return;
    }
    if (password !== confirm) {
      toast.error("Manenosiri hayafanani.");
      return;
    }

    try {
      setBusy(true);
      const auth = await bootstrapAdmin(email, password);
      setAuth(auth); // ⬅️ set in context + storage
      toast.success("Admin wa kwanza amesajiliwa 🎉");
      router.push("/inbox");
    } catch (err: any) {
      console.error("bootstrap admin failed", err);
      toast.error(
        err?.message ||
          "Imeshindikana kusajili admin. Inawezekana tayari kuna admin aliyeundwa."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-header">
          <div className="topbar-brand-icon">🛡️</div>
          <div className="auth-title">Sajili admin wa kwanza</div>
        </div>
        <p className="auth-subtitle">
          Hatua hii inafanyika mara moja tu. Baada ya hapo, admin ataongeza
          wafanyakazi wengine kupitia mfumo.
        </p>

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
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-label">Nenosiri</div>
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-label">Rudia nenosiri</div>
            <input
              type="password"
              className="auth-input"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="auth-actions">
            <button
              type="submit"
              disabled={busy}
              className="auth-primary-btn"
            >
              {busy ? "Inapakia..." : "Sajili admin"}
            </button>
          </div>
        </form>

        <div className="auth-footer">
          Tayari una admin?{" "}
          <button
            type="button"
            onClick={() => router.push("/login")}
          >
            Nenda kwenye ukurasa wa kuingia
          </button>
        </div>
      </div>
    </div>
  );
}
