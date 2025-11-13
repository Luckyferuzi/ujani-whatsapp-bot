import * as React from "react";
import { clsx } from "clsx";

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div
      className={clsx(
        "rounded-2xl bg-ui-panel border border-ui-border",
        className
      )}
      {...rest}
    />
  );
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "danger";
  }
) {
  const { className, variant = "primary", ...rest } = props;
  const base =
    "px-4 h-10 rounded-xl font-medium transition text-sm flex items-center justify-center";
  const v =
    variant === "primary"
      ? "bg-ui-primary/15 border border-ui-primary/40 hover:border-ui-primary/70 text-ui-text"
      : variant === "danger"
      ? "bg-ui-danger/15 border border-ui-danger/40 hover:border-ui-danger/70 text-ui-text"
      : "hover:bg-ui-soft/80 border border-transparent text-ui-text";
  return <button className={clsx(base, v, className)} {...rest} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      className={clsx(
        "h-10 px-3 rounded-xl bg-ui-soft border border-ui-border text-sm text-ui-text placeholder:text-ui-dim outline-none focus:ring-1 focus:ring-ui-primary/60 focus:border-ui-primary/60 w-full",
        className
      )}
      {...rest}
    />
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className, ...rest } = props;
  return (
    <textarea
      className={clsx(
        "p-3 rounded-xl bg-ui-soft border border-ui-border text-sm text-ui-text placeholder:text-ui-dim outline-none focus:ring-1 focus:ring-ui-primary/60 focus:border-ui-primary/60 w-full resize-none",
        className
      )}
      {...rest}
    />
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 h-6 rounded-full bg-ui-soft border border-ui-border text-xs text-ui-dim">
      {children}
    </span>
  );
}

// handy alias classes for theme colors
export const ui = {
  panel: "bg-ui-panel",
  border: "border-ui-border",
  text: "text-ui-text",
  dim: "text-ui-dim",
};
