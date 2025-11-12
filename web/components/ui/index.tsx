import { clsx } from "clsx";

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div className={clsx("rounded-2xl bg-ui.panel border border-ui.border", className)} {...rest} />;
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const { className, variant="primary", ...rest } = props;
  const base = "px-4 h-10 rounded-xl font-medium transition";
  const v = variant === "primary" ? "bg-ui.primary/15 border border-ui.primary/40 hover:border-ui.primary/70 text-ui.text"
    : variant === "danger" ? "bg-ui.danger/15 border border-ui.danger/40 hover:border-ui.danger/70 text-ui.text"
    : "hover:bg-ui.soft/80 border border-transparent text-ui.text";
  return <button className={clsx(base, v, className)} {...rest} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={clsx("h-10 px-3 rounded-xl bg-ui.soft border border-ui.border outline-none focus:border-ui.primary/60 w-full", className)} {...rest} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={clsx("p-3 rounded-xl bg-ui.soft border border-ui.border outline-none focus:border-ui.primary/60 w-full resize-none", className)} {...rest} />;
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center px-2 h-6 rounded-lg bg-ui.soft border border-ui.border text-xs text-ui.dim">{children}</span>;
}
