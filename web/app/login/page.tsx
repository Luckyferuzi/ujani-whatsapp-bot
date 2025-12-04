"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { login } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!email || !password) {
      toast.error("Tafadhali jaza barua pepe na nenosiri.");
      return;
    }

    try {
      setBusy(true);
      const auth = await login(email, password);
      setAuth(auth); // ⬅️ updates context + localStorage
      toast.success("Umeingia kwenye mfumo 🎉");
      router.push("/inbox"); // go to chats/system
    } catch (err: any) {
      console.error("login failed", err);
      toast.error(
        err?.message ||
          "Imeshindikana kuingia. Hakikisha barua pepe na nenosiri ni sahihi."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="auth-header">
          <div className="topbar-brand-icon">🌿</div>
          <div className="auth-title">Ujani Admin Login</div>
        </div>
        <p className="auth-subtitle">
          Ingia ili kuona Inbox, oda, bidhaa na taarifa zingine.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <div className="auth-field-label">Barua pepe</div>
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
              autoComplete="current-password"
            />
          </div>

          <div className="auth-actions">
            <button
              type="submit"
              disabled={busy}
              className="auth-primary-btn"
            >
              {busy ? "Inapakia..." : "Ingia"}
            </button>
          </div>
        </form>

        <div className="auth-footer">
          Hakuna akaunti bado?{" "}
          <button
            type="button"
            onClick={() => router.push("/register-admin")}
          >
            Sajili admin mara ya kwanza
          </button>
        </div>
      </div>
    </div>
  );
}
