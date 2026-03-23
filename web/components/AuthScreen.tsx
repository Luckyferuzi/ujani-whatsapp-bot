import Link from "next/link";
import { Alert, Card } from "@/components/ui";

type AuthHighlight = {
  title: string;
  description: string;
};

type AuthFact = {
  label: string;
  value: string;
};

export default function AuthScreen({
  eyebrow,
  title,
  description,
  formTitle,
  formDescription,
  highlights,
  facts,
  notice,
  footer,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  formTitle: string;
  formDescription: string;
  highlights: AuthHighlight[];
  facts: AuthFact[];
  notice?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell">
      <section className="auth-shell__panel auth-shell__panel--brand">
        <div className="auth-shell__brand">
          <Link href="/" className="auth-shell__brand-mark">
            UJ
          </Link>
          <div className="auth-shell__brand-copy">
            <div className="auth-shell__brand-label">Ujani Commerce</div>
            <div className="auth-shell__brand-subtitle">Premium WhatsApp operations console</div>
          </div>
        </div>

        <div className="auth-shell__intro">
          <div className="auth-shell__eyebrow">{eyebrow}</div>
          <h1 className="auth-shell__title">{title}</h1>
          <p className="auth-shell__description">{description}</p>
        </div>

        <div className="auth-shell__highlights">
          {highlights.map((item) => (
            <Card key={item.title} tone="muted" padding="md" className="auth-shell__highlight">
              <div className="auth-shell__highlight-title">{item.title}</div>
              <div className="auth-shell__highlight-copy">{item.description}</div>
            </Card>
          ))}
        </div>

        <div className="auth-shell__facts">
          {facts.map((fact) => (
            <div key={fact.label} className="auth-shell__fact">
              <div className="auth-shell__fact-label">{fact.label}</div>
              <div className="auth-shell__fact-value">{fact.value}</div>
            </div>
          ))}
        </div>

        {notice ? (
          <Alert
            tone="accent"
            title="Operational note"
            description={notice}
            className="auth-shell__notice"
          />
        ) : null}
      </section>

      <section className="auth-shell__panel auth-shell__panel--form">
        <Card tone="elevated" padding="lg" className="auth-card">
          <div className="auth-card__header">
            <div className="auth-card__eyebrow">{eyebrow}</div>
            <h2 className="auth-card__title">{formTitle}</h2>
            <p className="auth-card__description">{formDescription}</p>
          </div>

          <div className="auth-card__body">{children}</div>

          {footer ? <div className="auth-card__footer">{footer}</div> : null}
        </Card>
      </section>
    </div>
  );
}
