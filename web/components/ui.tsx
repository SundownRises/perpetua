"use client";

import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-border bg-surface-1 p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-ink">{children}</h2>
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
    </header>
  );
}

/**
 * Stat tile. Label in sentence case with no trailing colon; value in semibold sans
 * using the font's proportional figures, because tabular figures make large
 * display numbers look loose. `unit` sits beside the value in muted ink so the
 * number itself stays the loudest thing in the tile.
 */
export function Stat({
  label,
  value,
  unit,
  sub,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: "btc" | "musd";
}) {
  const accentClass = accent === "btc" ? "text-btc" : accent === "musd" ? "text-musd" : "text-ink";
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
      <div className="text-xs text-ink-secondary">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold leading-none ${accentClass}`}>{value}</span>
        {unit ? <span className="text-xs text-ink-muted">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 text-xs text-ink-muted">{sub}</div> : null}
    </div>
  );
}

/** Reserved status colours always ship with a text label, never colour alone. */
export function Badge({
  tone,
  children,
}: {
  tone: "good" | "warning" | "critical" | "neutral";
  children: ReactNode;
}) {
  const map = {
    good: "border-good/40 text-good",
    warning: "border-warning/40 text-warning",
    critical: "border-critical/40 text-critical",
    neutral: "border-border text-ink-secondary",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${map[tone]}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const base =
    "inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
  const look =
    variant === "primary"
      ? "bg-btc text-white hover:brightness-110"
      : "border border-border bg-surface-2 text-ink hover:bg-surface-1";
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} className={`${base} ${look} ${className}`}>
      {busy ? <span aria-hidden className="spin h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  value,
  onChange,
  max,
  onMax,
  unit,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: string;
  onMax?: () => void;
  unit: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-ink-secondary">
        {label}
        {max !== undefined ? (
          <button
            type="button"
            onClick={onMax}
            disabled={disabled}
            className="tnum text-ink-muted underline decoration-dotted hover:text-ink disabled:no-underline"
          >
            balance {max}
          </button>
        ) : null}
      </span>
      <span className="mt-1.5 flex items-center gap-2 rounded-lg border border-border bg-surface-0 px-3 focus-within:border-ink-muted">
        <input
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "" || /^\d*\.?\d*$/.test(v)) onChange(v);
          }}
          className="tnum w-full bg-transparent py-2.5 text-lg text-ink outline-none placeholder:text-ink-muted disabled:opacity-50"
        />
        <span className="shrink-0 text-xs font-medium text-ink-muted">{unit}</span>
      </span>
    </label>
  );
}

export function Notice({ tone, children }: { tone: "info" | "error" | "good"; children: ReactNode }) {
  const map = {
    info: "border-border bg-surface-2 text-ink-secondary",
    error: "border-critical/40 bg-critical/10 text-ink",
    good: "border-good/40 bg-good/10 text-ink",
  } as const;
  return <div className={`rounded-lg border px-3 py-2 text-xs ${map[tone]}`}>{children}</div>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-secondary">{label}</span>
      <span className="tnum text-ink">{children}</span>
    </div>
  );
}
