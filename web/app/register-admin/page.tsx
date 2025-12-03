// web/app/register-admin/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bootstrapAdmin, saveAuth } from "@/lib/auth";

export default function RegisterAdminPage() {
  const router = useRouter();
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
      saveAuth(auth);
      toast.success("Admin amesajiliwa 🎉");
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
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 w-14 h-14 mb-3">
            <span className="text-2xl">🛡️</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Sajili admin wa kwanza
          </h1>
          <p className="mt-2 text-sm text-ui-dim">
            Hii hatua inafanyika mara moja tu. Baada ya hapo, admin ataongeza
            wafanyakazi wengine kutoka kwenye mfumo.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Barua pepe ya admin
              </label>
              <input
                type="email"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                placeholder="admin@ujani.co.tz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nenosiri
                </label>
                <input
                  type="password"
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Rudia nenosiri
                </label>
                <input
                  type="password"
                  className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center rounded-lg bg-emerald-600 text-white text-sm font-medium py-2.5 mt-2 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? "Inapakia..." : "Sajili admin"}
            </button>
          </form>

          <p className="mt-4 text-xs text-ui-dim text-center">
            Tayari una admin?{" "}
            <button
              type="button"
              className="text-emerald-600 underline font-medium"
              onClick={() => router.push("/login")}
            >
              Nenda kwenye ukurasa wa kuingia
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
