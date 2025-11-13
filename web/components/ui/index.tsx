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
    variant?: "primary" | "ghost" | "danger";
  }
) {
  const { className, variant = "primary", ...rest } = props;
  const base = "px-4 h-9 rounded-lg text-sm font-medium transition";
  const v =
    variant === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-transparent text-gray-700 hover:bg-gray-100";

  return <button className={clsx(base, v, className)} {...rest} />;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      className={clsx(
        "h-10 px-3 rounded-lg bg-white border border-gray-300 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full",
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
        "p-3 rounded-lg bg-white border border-gray-300 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full resize-none",
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
