"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { bootstrapAdmin } from "@/lib/auth";
import { useAuth } from "@/components/AuthProvider";
import AuthScreen from "@/components/AuthScreen";
import { Alert, Button, Input } from "@/components/ui";

export default function RegisterAdminPage() {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const emailError = useMemo(() => {
    if (!email) return null;
    const normalized = email.trim();
    if (!normalized.includes("@")) return "Tumia barua pepe sahihi kwa admin wa biashara.";
    return null;
  }, [email]);

  const passwordError = useMemo(() => {
    if (!password) return null;
    if (password.length < 6) return "Nenosiri liwe angalau herufi 6.";
    return null;
  }, [password]);

  const confirmError = useMemo(() => {
    if (!confirm) return null;
    if (confirm !== password) return "Manenosiri hayafanani.";
    return null;
  }, [confirm, password]);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 0 &&
      password.length >= 6 &&
      confirm.length >= 6 &&
      password === confirm &&
      !busy &&
      !emailError &&
      !passwordError &&
      !confirmError
    );
  }, [email, password, confirm, busy, emailError, passwordError, confirmError]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const em = email.trim().toLowerCase();
    if (!em || !password || !confirm) {
      const message = "Tafadhali jaza sehemu zote kabla ya kuendelea.";
      setErrorMessage(message);
      toast.error(message);
      return;
    }
    if (emailError || passwordError || confirmError) {
      setErrorMessage(emailError || passwordError || confirmError);
      return;
    }

    try {
      setBusy(true);
      const auth = await bootstrapAdmin(em, password);
      setAuth(auth);
      toast.success("Admin wa kwanza amesajiliwa.");
      router.push("/inbox");
    } catch (err: any) {
      const message =
        err?.message ||
        "Imeshindikana kusajili admin. Inawezekana tayari kuna admin aliyeundwa.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      eyebrow="First secure setup"
      title="Create the first administrator account for this workspace."
      description="This step unlocks the console so the business can manage WhatsApp settings, staff access, orders, and product operations from a single system."
      formTitle="Register first admin"
      formDescription="This only happens once for a new workspace."
      highlights={[
        {
          title: "Settings and connection control",
          description: "Configure business details, WhatsApp profile data, and runtime setup from one system workspace.",
        },
        {
          title: "Team and access ownership",
          description: "Create staff accounts later and control who can operate inside the console.",
        },
      ]}
      facts={[
        { label: "Setup scope", value: "One-time workspace bootstrap" },
        { label: "Recommended account", value: "Business owner or lead operator" },
      ]}
      notice="Use a strong business-owned password. After setup, the administrator can manage staff, settings, and secure access inside the console."
      footer={
        <div className="auth-card__footer-copy">
          <span>Tayari una admin?</span>
          <button type="button" className="auth-link-button" onClick={() => router.push("/login")}>
            Nenda kwenye login
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="auth-form">
        {errorMessage ? (
          <Alert tone="danger" title="Hatukuweza kusajili admin" description={errorMessage} />
        ) : null}

        <div className="auth-form__field">
          <label className="auth-form__label" htmlFor="email">
            Barua pepe ya admin
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
          <div className="auth-form__meta">{emailError || "Hii ndiyo akaunti kuu ya kuingia kwenye workspace."}</div>
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
            placeholder="Create a secure password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div className="auth-form__meta">{passwordError || "Chagua nenosiri imara la biashara."}</div>
        </div>

        <div className="auth-form__field">
          <div className="auth-form__label-row">
            <label className="auth-form__label" htmlFor="confirm">
              Rudia nenosiri
            </label>
            <button
              type="button"
              className="auth-form__toggle"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide password confirmation" : "Show password confirmation"}
            >
              {showConfirm ? "Hide" : "Show"}
            </button>
          </div>
          <Input
            id="confirm"
            type={showConfirm ? "text" : "password"}
            invalid={!!confirmError}
            className="auth-form__input"
            placeholder="Repeat the password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          <div className="auth-form__meta">{confirmError || "Andika tena nenosiri ili kuthibitisha."}</div>
        </div>

        <Button type="submit" loading={busy} disabled={!canSubmit} className="auth-form__submit" size="lg">
          Sajili admin
        </Button>
      </form>
    </AuthScreen>
  );
}
