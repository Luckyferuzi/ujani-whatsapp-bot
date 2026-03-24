"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { login } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import AuthScreen from "@/components/AuthScreen";
import { Alert, Button, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const emailError = useMemo(() => {
    if (!email) return null;
    const normalized = email.trim();
    if (!normalized.includes("@")) return "Tumia barua pepe sahihi ya biashara au operator.";
    return null;
  }, [email]);

  const passwordError = useMemo(() => {
    if (!password) return null;
    if (password.length < 6) return "Nenosiri linapaswa kuwa angalau herufi 6.";
    return null;
  }, [password]);

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.length > 0 && !busy && !emailError && !passwordError;
  }, [email, password, busy, emailError, passwordError]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const em = email.trim().toLowerCase();
    if (!em || !password) {
      setErrorMessage("Jaza barua pepe na nenosiri kabla ya kuendelea.");
      toast.error("Tafadhali jaza barua pepe na nenosiri.");
      return;
    }

    if (emailError || passwordError) {
      setErrorMessage(emailError || passwordError);
      return;
    }

    try {
      setBusy(true);
      const auth = await login(em, password);
      setAuth(auth);
      toast.success("Umeingia kwenye mfumo.");
      router.push("/inbox");
    } catch (err: any) {
      const message =
        err?.message ||
        "Imeshindikana kuingia. Hakikisha barua pepe na nenosiri ni sahihi.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      eyebrow="Secure access"
      title="Run daily WhatsApp commerce operations from one calm workspace."
      description="Manage inbox pressure, orders, payments, products, and internal coordination in a console built for focused operational work."
      formTitle="Sign in"
      formDescription="Use your business account to enter the workspace."
      highlights={[
        {
          title: "Inbox and fulfillment in one flow",
          description:
            "Move from customer conversation to payment review and delivery action without losing context.",
        },
        {
          title: "Daily operator clarity",
          description:
            "Keep the team aligned on what needs reply, what needs review, and what needs movement today.",
        },
      ]}
      facts={[
        { label: "Workspace type", value: "Single-business live environment" },
        { label: "Primary channels", value: "Inbox, orders, payments, catalog" },
      ]}
      notice="The workspace uses your existing business rules and WhatsApp setup. Signing in does not change any product configuration."
      footer={
        <div className="auth-card__footer-copy">
          <span>Hakuna admin bado?</span>
          <button type="button" className="auth-link-button" onClick={() => router.push("/register-admin")}>
            Sajili admin wa kwanza
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        {errorMessage ? (
          <Alert tone="danger" title="Hatukuweza kukuingiza" description={errorMessage} />
        ) : null}

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="email">
            Barua pepe
          </label>
          <Input
            id="email"
            type="email"
            invalid={!!emailError}
            className="auth-form__input"
            placeholder="admin@ujani.co.tz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
          <div className="auth-form__meta">
            {emailError || "Tumia akaunti ya biashara au operator iliyosajiliwa."}
          </div>
        </div>

        <div className="auth-form__field">
          <div className="auth-form__label-row">
            <label className="auth-form__label" htmlFor="password">
              Nenosiri
            </label>
            <button
              type="button"
              className="auth-form__toggle"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? "Hide" : "Show"}
            </button>
          </div>
          <Input
            id="password"
            type={showPass ? "text" : "password"}
            invalid={!!passwordError}
            className="auth-form__input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <div className="auth-form__meta">
            {passwordError || "Nenosiri lako halionekani kwa wengine kwenye kifaa hiki."}
          </div>
        </div>

        <Button type="submit" loading={busy} disabled={!canSubmit} className="auth-form__submit" size="lg">
          Ingia
        </Button>
      </form>
    </AuthScreen>
  );
}
