"use client";

import * as React from "react";
import { clsx } from "clsx";

function cn(...values: Array<string | false | null | undefined>) {
  return clsx(values);
}

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    tone?: "default" | "muted" | "elevated";
    padding?: "none" | "sm" | "md" | "lg";
  }
>(function Card({ className, tone = "default", padding = "md", ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "ui-card",
        tone === "muted" && "ui-card--muted",
        tone === "elevated" && "ui-card--elevated",
        padding === "none" && "ui-card--padding-none",
        padding === "sm" && "ui-card--padding-sm",
        padding === "md" && "ui-card--padding-md",
        padding === "lg" && "ui-card--padding-lg",
        className
      )}
      {...props}
    />
  );
});

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    leadingIcon?: React.ReactNode;
    trailingIcon?: React.ReactNode;
  }
>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    children,
    disabled,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "ui-button",
        variant === "primary" && "ui-button--primary",
        variant === "secondary" && "ui-button--secondary",
        variant === "ghost" && "ui-button--ghost",
        variant === "danger" && "ui-button--danger",
        size === "sm" && "ui-button--sm",
        size === "lg" && "ui-button--lg",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="ui-button__spinner" aria-hidden="true" /> : leadingIcon}
      <span>{children}</span>
      {!loading ? trailingIcon : null}
    </button>
  );
});

type InputLikeProps = {
  invalid?: boolean;
};

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & InputLikeProps
>(function Input({ className, invalid = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn("ui-input", invalid && "ui-input--invalid", className)}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & InputLikeProps
>(function Textarea({ className, invalid = false, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn("ui-textarea", invalid && "ui-textarea--invalid", className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & InputLikeProps
>(function Select({ className, invalid = false, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn("ui-select", invalid && "ui-select--invalid", className)}
      {...props}
    >
      {children}
    </select>
  );
});

export function Badge({
  className,
  tone = "neutral",
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "ui-badge",
        tone === "neutral" && "ui-badge--neutral",
        tone === "accent" && "ui-badge--accent",
        tone === "success" && "ui-badge--success",
        tone === "warning" && "ui-badge--warning",
        tone === "danger" && "ui-badge--danger",
        tone === "info" && "ui-badge--info",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function Alert({
  className,
  tone = "neutral",
  title,
  description,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  title?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "ui-alert",
        tone === "neutral" && "ui-alert--neutral",
        tone === "accent" && "ui-alert--accent",
        tone === "success" && "ui-alert--success",
        tone === "warning" && "ui-alert--warning",
        tone === "danger" && "ui-alert--danger",
        tone === "info" && "ui-alert--info",
        className
      )}
      {...props}
    >
      {title ? <div className="ui-alert__title">{title}</div> : null}
      {description ? <div className="ui-alert__description">{description}</div> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  className,
  eyebrow = "Workspace",
  title,
  description,
  icon,
  action,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("ui-empty-state", className)} {...props}>
      {icon ? <div className="ui-empty-state__icon">{icon}</div> : null}
      {eyebrow ? <div className="ui-empty-state__eyebrow">{eyebrow}</div> : null}
      <div className="ui-empty-state__title">{title}</div>
      {description ? <div className="ui-empty-state__description">{description}</div> : null}
      {action}
      {children}
    </div>
  );
}

export type TabItem = {
  value: string;
  label: React.ReactNode;
  meta?: React.ReactNode;
  disabled?: boolean;
};

export function Tabs({
  className,
  value,
  onValueChange,
  items,
  ariaLabel = "Tabs",
}: {
  className?: string;
  value: string;
  onValueChange: (next: string) => void;
  items: TabItem[];
  ariaLabel?: string;
}) {
  return (
    <div className={cn("ui-tabs", className)} role="tablist" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={item.disabled || undefined}
            className={cn("ui-tab", active && "ui-tab--active")}
            disabled={item.disabled}
            onClick={() => onValueChange(item.value)}
          >
            <span>{item.label}</span>
            {item.meta != null ? <span className="ui-tab__meta">{item.meta}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function InlineLoading({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: React.ReactNode;
}) {
  return (
    <span className={cn("ui-inline-loading", className)} role="status" aria-live="polite">
      <span className="ui-inline-loading__bar" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function RefreshIndicator({
  className,
  label = "Refreshing",
}: {
  className?: string;
  label?: React.ReactNode;
}) {
  return (
    <span className={cn("ui-refresh-indicator", className)} role="status" aria-live="polite">
      <span className="ui-refresh-indicator__dot" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function MetricValue({
  value,
  loading = false,
  refreshing = false,
  width = "6ch",
  className,
}: {
  value?: React.ReactNode;
  loading?: boolean;
  refreshing?: boolean;
  width?: number | string;
  className?: string;
}) {
  return (
    <span className={cn("ui-metric", className)} style={{ ["--ui-metric-width" as string]: width }}>
      {loading ? (
        <Skeleton className="ui-metric__skeleton" />
      ) : (
        <span className={cn("ui-metric__value", refreshing && "ui-metric__value--refreshing")}>
          {value}
        </span>
      )}
    </span>
  );
}

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn("ui-skeleton", className)} style={style} aria-hidden="true" />;
}

export function SkeletonText({
  lines = 3,
  widths,
  className,
}: {
  lines?: number;
  widths?: Array<number | string>;
  className?: string;
}) {
  return (
    <div className={cn("ui-skeleton-text", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className="ui-skeleton"
          style={{
            height: index === 0 ? 14 : 12,
            width: widths?.[index] ?? (index === lines - 1 ? "68%" : "100%"),
          }}
        />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="ui-skeleton-card" aria-hidden="true">
      <Skeleton style={{ width: "38%", height: 12 }} />
      <Skeleton style={{ width: "54%", height: 30 }} />
      <Skeleton style={{ width: "72%", height: 12 }} />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="ui-skeleton-page" aria-hidden="true">
      <div className="ui-skeleton-page__hero">
        <Skeleton style={{ width: "10rem", height: 12 }} />
        <Skeleton style={{ width: "22rem", height: 34 }} />
        <Skeleton style={{ width: "32rem", height: 14 }} />
      </div>

      <div className="ui-skeleton-stats">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      <div className="ui-skeleton-stack">
        <Card padding="lg">
          <TableSkeleton rows={4} />
        </Card>
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="ui-skeleton-table" aria-hidden="true">
      <div className="ui-skeleton-table__row">
        <Skeleton style={{ height: 11 }} />
        <Skeleton style={{ height: 11 }} />
        <Skeleton style={{ height: 11 }} />
        <Skeleton style={{ height: 11 }} />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="ui-skeleton-table__row">
          <Skeleton style={{ height: 14 }} />
          <Skeleton style={{ height: 14 }} />
          <Skeleton style={{ height: 14 }} />
          <Skeleton style={{ height: 14 }} />
        </div>
      ))}
    </div>
  );
}

export function ListRowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="ui-skeleton-stack" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="ui-skeleton-list-row">
          <Skeleton style={{ width: 40, height: 40, borderRadius: 999 }} />
          <SkeletonText lines={2} widths={["52%", "74%"]} />
          <Skeleton style={{ width: "100%", height: 12, justifySelf: "end" }} />
        </div>
      ))}
    </div>
  );
}

export function ConversationListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="ui-skeleton-conversation-list" aria-hidden="true">
      <div className="ui-skeleton-conversation-list__header">
        <Skeleton style={{ width: "11rem", height: 14 }} />
        <Skeleton style={{ width: "100%", height: 42 }} />
        <div className="ui-skeleton-conversation-list__filters">
          <Skeleton style={{ width: "100%", height: 34 }} />
          <Skeleton style={{ width: "100%", height: 34 }} />
          <Skeleton style={{ width: "100%", height: 34 }} />
          <Skeleton style={{ width: "100%", height: 34 }} />
        </div>
      </div>
      <ListRowSkeleton rows={rows} />
    </div>
  );
}

export function FormSectionSkeleton() {
  return (
    <div className="ui-skeleton-form" aria-hidden="true">
      <Skeleton style={{ width: "12rem", height: 14 }} />
      <div className="ui-skeleton-form__grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="ui-skeleton-stack">
            <Skeleton style={{ width: "42%", height: 12 }} />
            <Skeleton style={{ width: "100%", height: 42 }} />
          </div>
        ))}
      </div>
      <Skeleton style={{ width: "100%", height: 112 }} />
    </div>
  );
}

export function ThreadSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="ui-skeleton-thread" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => {
        const rightAligned = index % 3 === 2;
        return (
          <div
            key={index}
            className={cn("ui-skeleton-thread__row", rightAligned && "ui-skeleton-thread__row--right")}
          >
            <Skeleton style={{ width: rightAligned ? "62%" : "78%", height: 14 }} />
            <Skeleton style={{ width: rightAligned ? "48%" : "66%", height: 14 }} />
            <Skeleton style={{ width: "6rem", height: 10 }} />
          </div>
        );
      })}
    </div>
  );
}

export function SidePanelSkeleton() {
  return (
    <div className="ui-skeleton-side-panel" aria-hidden="true">
      <Skeleton style={{ width: "48%", height: 16 }} />
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="ui-skeleton-side-panel__row">
          <Skeleton style={{ width: "38%", height: 11 }} />
          <Skeleton style={{ width: "84%", height: 13 }} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  const barHeights = ["48%", "68%", "38%", "88%", "54%", "76%", "42%", "62%"];

  return (
    <div className="ui-skeleton-chart" aria-hidden="true">
      <Skeleton style={{ width: "11rem", height: 14 }} />
      <div className="ui-skeleton-chart__bars">
        {barHeights.map((height, index) => (
          <Skeleton key={index} className="ui-skeleton-chart__bar" style={{ height }} />
        ))}
      </div>
    </div>
  );
}

/* Backwards-compatible alias for older imports. */
export { Badge as Chip };
