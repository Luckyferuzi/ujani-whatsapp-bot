import * as React from "react";
import { clsx } from "clsx";

export function Card(
  props: React.HTMLAttributes<HTMLDivElement> & { shadow?: boolean }
) {
  const { className, shadow = false, ...rest } = props;
  return (
    <div
      className={clsx("ui-card", shadow && "ui-card--shadow", className)}
      {...rest}
    />
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
  }
) {
  const { className, variant = "primary", ...rest } = props;

  const variantClass =
    variant === "primary"
      ? "ui-btn--primary"
      : variant === "secondary"
      ? "ui-btn--secondary"
      : "ui-btn--ghost";

  return <button className={clsx("ui-btn", variantClass, className)} {...rest} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className, ...rest } = props;
  return <textarea className={clsx("ui-textarea", className)} {...rest} />;
}

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  const { className, ...rest } = props;
  return <input className={clsx("ui-input", className)} {...rest} />;
}

export function Chip(
  props: React.HTMLAttributes<HTMLSpanElement> & {
    tone?: "neutral" | "success" | "warning" | "danger";
  }
) {
  const { className, tone = "neutral", ...rest } = props;
  const toneClass =
    tone === "success"
      ? "ui-chip--success"
      : tone === "warning"
      ? "ui-chip--warning"
      : tone === "danger"
      ? "ui-chip--danger"
      : "ui-chip--neutral";
  return <span className={clsx("ui-chip", toneClass, className)} {...rest} />;
}

/* Backwards-compat alias */
export function Badge({ children }: { children: React.ReactNode }) {
  return <Chip>{children}</Chip>;
}
