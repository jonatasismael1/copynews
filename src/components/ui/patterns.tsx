import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "./card";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="text-[13px] font-semibold text-primary">{eyebrow}</p>}
      <h1 className="mt-1 font-display text-[30px] font-bold leading-[1.15] tracking-[-.025em] sm:text-4xl">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>;
}

export function SegmentedControl<T extends string | number>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return <div className="inline-flex max-w-full overflow-x-auto rounded-[var(--radius-control)] bg-muted p-1" role="group" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)} className={cn("min-h-9 shrink-0 rounded-[8px] px-3 text-xs font-semibold text-muted-foreground transition-colors", value === option.value && "bg-card text-foreground shadow-sm")}>{option.label}</button>)}
  </div>;
}

export function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: ReactNode; detail?: string; icon: LucideIcon }) {
  return <Card className="min-h-[112px]">
    <CardContent className="flex h-full items-start justify-between gap-3 p-4">
      <div className="min-w-0"><p className="text-[13px] text-muted-foreground">{label}</p><p className="mt-2 font-display text-[28px] font-bold leading-none">{value}</p>{detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}</div>
      <Icon size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
    </CardContent>
  </Card>;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="grid place-items-center px-4 py-10 text-center"><Icon size={28} className="text-[var(--text-tertiary)]" aria-hidden="true" /><h2 className="mt-3 font-display text-base font-semibold">{title}</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={cn("grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35", className)} aria-label={label} title={label} {...props} />;
}
