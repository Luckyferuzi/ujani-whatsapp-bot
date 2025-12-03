// web/app/login/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { login, saveAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
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
      saveAuth(auth);
      toast.success("Umeingia kwenye mfumo 🎉");
      router.push("/inbox");
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
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 w-14 h-14 mb-3">
            <span className="text-2xl">🌿</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Ujani Admin Login
          </h1>
          <p className="mt-2 text-sm text-ui-dim">
            Ingia ili kuona Inbox, oda, bidhaa na zaidi.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Barua pepe
              </label>
              <input
                type="email"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50"
                placeholder="admin@ujani.co.tz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Nenosiri
              </label>
              <input
                type="password"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white text-sm font-medium py-2.5 mt-2 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? "Inapakia..." : "Ingia"}
            </button>
          </form>

          <p className="mt-4 text-xs text-ui-dim text-center">
            Hakuna akaunti bado?{" "}
            <button
              type="button"
              className="text-indigo-600 underline font-medium"
              onClick={() => router.push("/register-admin")}
            >
              Sajili admin mara ya kwanza
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
