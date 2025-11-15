// web/components/ui/index.tsx
import * as React from "react";
import { clsx } from "clsx";

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div
      className={clsx(
        "rounded-2xl bg-white border border-gray-200",
        className
      )}
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
  const base =
    "inline-flex items-center justify-center rounded-full text-sm font-medium px-4 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-[#128C7E] text-white hover:bg-[#0c6a5d]"
      : variant === "secondary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-transparent text-gray-700 hover:bg-gray-100";

  return <button className={clsx(base, styles, className)} {...rest} />;
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className, ...rest } = props;
  return (
    <textarea
      className={clsx(
        "w-full rounded-xl border border-gray-300 px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-[#128C7E] focus:border-[#128C7E] bg-white disabled:bg-gray-100 disabled:text-gray-400",
        className
      )}
      {...rest}
    />
  );
}

export function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  const { className, ...rest } = props;
  return (
    <input
      className={clsx(
        "w-full rounded-full border border-gray-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white",
        className
      )}
      {...rest}
    />
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 h-6 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-600">
      {children}
    </span>
  );
}
