"use client";

import { useEffect } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx("rounded-2xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/5", onClick && "cursor-pointer active:scale-[0.995] transition", className)}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-zinc-900 [overflow-wrap:anywhere] sm:text-[28px]">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">{children}</h2>
      {right}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
export function Button({
  children,
  variant = "secondary",
  className,
  size = "md",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  const v = {
    primary: "bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/50",
    secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 disabled:opacity-50",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50",
    ghost: "text-emerald-700 hover:bg-emerald-50 disabled:opacity-50",
  }[variant];
  const s = size === "sm" ? "h-9 px-3 text-[13px] sm:h-8" : "h-11 px-4 text-[15px] sm:h-10";
  return (
    <button {...rest} className={cx("inline-flex touch-manipulation select-none items-center justify-center gap-1.5 rounded-xl font-medium transition active:scale-[0.98] disabled:cursor-not-allowed", v, s, className)}>
      {children}
    </button>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-zinc-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border-0 bg-zinc-100 px-3 py-2.5 text-base text-zinc-900 sm:text-[15px] outline-none ring-emerald-600/40 placeholder:text-zinc-400 focus:bg-white focus:ring-2 disabled:opacity-60";

export function Input(props: React.ComponentProps<"input">) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputCls, "resize-y", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, "appearance-none bg-[length:12px] pr-8", props.className)} />;
}

export type Tone = "green" | "red" | "amber" | "blue" | "gray" | "violet";
export function Badge({ children, tone = "gray", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  const t = {
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-sky-50 text-sky-700",
    gray: "bg-zinc-100 text-zinc-600",
    violet: "bg-violet-50 text-violet-700",
  }[tone];
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", t, className)}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "red" | "green" }) {
  return (
    <Card className="min-w-0 p-3.5 sm:p-4">
      <div className="text-[12px] leading-tight text-zinc-500 sm:text-[13px]">{label}</div>
      <div className={cx("mt-1 text-[clamp(15px,5vw,19px)] font-semibold tracking-tight tabular [overflow-wrap:anywhere] sm:text-[22px]", tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-700" : "text-zinc-900")}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-tight text-zinc-400 sm:text-xs">{sub}</div>}
    </Card>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={cx("flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-zinc-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3 sm:py-4">
          <h3 className="text-[17px] font-semibold">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200" aria-label="Закрыть">
            ✕
          </button>
        </div>
        <div className="overscroll-contain overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>button]:flex-1 sm:[&>button]:flex-none">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-xl bg-zinc-200/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx("whitespace-nowrap rounded-[10px] px-3 py-2 text-[13px] font-medium transition sm:py-1.5", value === o.value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex items-center justify-between gap-3", disabled && "opacity-60")}>
      <span className="text-[15px]">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative h-7 w-12 shrink-0 rounded-full transition", checked ? "bg-emerald-600" : "bg-zinc-300")}
      >
        <span className={cx("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-zinc-400">{children}</div>;
}

export function Row({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cx("flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-0", onClick && "cursor-pointer hover:bg-zinc-50", className)}>
      {children}
    </div>
  );
}

/** Плавающая кнопка действия на телефоне (над нижним меню) */
export function Fab({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 touch-manipulation items-center gap-2 rounded-full bg-emerald-700 px-5 text-[15px] font-semibold text-white shadow-lg shadow-emerald-900/25 active:scale-95 md:hidden"
    >
      {children}
    </button>
  );
}
