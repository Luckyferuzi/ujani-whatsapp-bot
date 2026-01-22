"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { login } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPass, setShowPass] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !busy;
  }, [email, password, busy]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const em = email.trim().toLowerCase();
    if (!em || !password) {
      toast.error("Tafadhali jaza barua pepe na nenosiri.");
      return;
    }

    try {
      setBusy(true);
      const auth = await login(em, password);
      setAuth(auth);
      toast.success("Umeingia kwenye mfumo.");
      router.push("/inbox");
    } catch (err: any) {
      toast.error(
        err?.message ||
          "Imeshindikana kuingia. Hakikisha barua pepe na nenosiri ni sahihi."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      {/* LEFT: Summary */}
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="auth-brand">
            <div className="auth-brand-mark">UJ</div>
            <div>
              <div className="auth-brand-name">Ujani WhatsApp Commerce</div>
              <div className="auth-brand-sub">
                Dhibiti mauzo, maswali ya wateja, na oda — moja kwa moja kupitia WhatsApp.
              </div>
            </div>
          </div>

          <div className="auth-left-card">
            <div className="auth-left-title">What this system helps you do</div>

            <ul className="auth-bullets">
              <li>
                <span className="auth-bullet-dot" />
                <div>
                  <div className="auth-bullet-head">Reply faster with smart menus</div>
                  <div className="auth-bullet-sub">
                    Bot hutuma menu + options kwa wateja na hupunguza maswali yanayojirudia.
                  </div>
                </div>
              </li>

              <li>
                <span className="auth-bullet-dot" />
                <div>
                  <div className="auth-bullet-head">Manage catalog + pricing</div>
                  <div className="auth-bullet-sub">
                    Weka bidhaa, bei, na maelezo; wateja waone kupitia flow ya bot.
                  </div>
                </div>
              </li>

              <li>
                <span className="auth-bullet-dot" />
                <div>
                  <div className="auth-bullet-head">Track orders & customer requests</div>
                  <div className="auth-bullet-sub">
                    Oda, follow-ups, na maombi ya wateja yanapangwa kwenye dashboard.
                  </div>
                </div>
              </li>

              <li>
                <span className="auth-bullet-dot" />
                <div>
                  <div className="auth-bullet-head">WhatsApp integration (real)</div>
                  <div className="auth-bullet-sub">
                    Inatumia WhatsApp Cloud API kutuma menus, templates, na messages kwa wateja.
                  </div>
                </div>
              </li>

              <li>
                <span className="auth-bullet-dot" />
                <div>
                  <div className="auth-bullet-head">Admin control & team roles</div>
                  <div className="auth-bullet-sub">
                    Admin anaweka Settings, staff accounts, na ana-control access.
                  </div>
                </div>
              </li>
            </ul>

            <div className="auth-callouts">
              <div className="auth-callout">
                <div className="auth-callout-title">Customer Experience</div>
                <div className="auth-callout-sub">
                  Wateja wanapata responses za haraka na njia ya kuagiza bila kupoteza muda.
                </div>
              </div>
              <div className="auth-callout">
                <div className="auth-callout-title">Business Control</div>
                <div className="auth-callout-sub">
                  Unajua nini kinaulizwa, nini kinaagizwa, na unaweza kuboresha flow yako.
                </div>
              </div>
            </div>

            <div className="auth-note">
              Tip: Jina la biashara linaloonekana kwenye WhatsApp (kwa watu wasio-save namba)
              linathibitishwa kupitia WhatsApp Manager. Ndani ya mfumo, tunadhibiti menu, catalogue na business info.
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Form */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-title">Ingia</div>
          <div className="auth-subtitle">
            Ingia kusimamia WhatsApp bot, bidhaa, oda na settings.
          </div>

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
                inputMode="email"
              />
            </div>

            <div className="auth-field">
              <div className="auth-field-label">Nenosiri</div>
              <div className="auth-input-wrap">
                <input
                  type={showPass ? "text" : "password"}
                  className="auth-input auth-input--with-action"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-input-action"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="auth-primary-btn"
            >
              {busy ? "Inaingia..." : "Ingia"}
            </button>
          </form>

          <div className="auth-footer">
            Hakuna admin bado?{" "}
            <button type="button" onClick={() => router.push("/register-admin")}>
              Sajili admin wa kwanza
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
