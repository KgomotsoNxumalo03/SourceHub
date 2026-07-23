"use client";

import { useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type TdHTMLAttributes } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-sourcehub-primary text-white shadow-soft hover:bg-[#0c3f99] focus-visible:ring-sourcehub-accent",
  secondary:
    "bg-sourcehub-secondary text-white hover:bg-[#0b2d57] focus-visible:ring-sourcehub-accent",
  ghost:
    "bg-transparent text-sourcehub-text hover:bg-white/60 hover:text-sourcehub-primary focus-visible:ring-sourcehub-accent",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400",
  outline:
    "border border-sourcehub-border bg-white text-sourcehub-text hover:border-sourcehub-primary hover:text-sourcehub-primary focus-visible:ring-sourcehub-accent",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClassName({ variant, size, className })}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-sourcehub-border bg-white px-4 text-sm text-sourcehub-text outline-none transition placeholder:text-slate-400 focus:border-sourcehub-primary focus:ring-2 focus:ring-sourcehub-accent/30 disabled:cursor-not-allowed disabled:bg-sourcehub-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-xl border border-sourcehub-border bg-white px-4 py-3 text-sm text-sourcehub-text outline-none transition placeholder:text-slate-400 focus:border-sourcehub-primary focus:ring-2 focus:ring-sourcehub-accent/30 disabled:cursor-not-allowed disabled:bg-sourcehub-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-sourcehub-border bg-white px-4 text-sm text-sourcehub-text outline-none transition focus:border-sourcehub-primary focus:ring-2 focus:ring-sourcehub-accent/30 disabled:cursor-not-allowed disabled:bg-sourcehub-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-sourcehub-border text-sourcehub-primary focus:ring-sourcehub-accent",
        className,
      )}
      {...props}
    />
  );
}

const badgeVariants = {
  default: "bg-sourcehub-muted text-sourcehub-text",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-700",
  info: "bg-sky-100 text-sky-800",
  navy: "bg-navy-900 text-white",
  outline: "border border-sourcehub-border bg-white text-sourcehub-text",
} as const;

export function Badge({
  className,
  tone = "default",
  children,
}: {
  className?: string;
  tone?: keyof typeof badgeVariants;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        badgeVariants[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-sourcehub-border bg-white shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-sourcehub-border px-6 py-4", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-sourcehub-border px-6 py-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold text-sourcehub-text", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm text-slate-600", className)} {...props} />;
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-sourcehub-border bg-white">
      <table className={cn("min-w-full divide-y divide-sourcehub-border text-sm", className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-sourcehub-muted/70", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-sourcehub-border bg-white", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("hover:bg-sourcehub-muted/40", className)} {...props} />;
}

export function TableHeadCell({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600", className)} {...props} />;
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-top text-sourcehub-text", className)} {...props} />;
}

export function Avatar({
  className,
  src,
  alt,
  initials,
}: {
  className?: string;
  src?: string | null;
  alt: string;
  initials: string;
}) {
  return (
    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sourcehub-primary text-sm font-semibold text-white", className)}>
      {src ? <img src={src} alt={alt} className="h-full w-full object-cover" /> : initials}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-sourcehub-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sourcehub-primary">{eyebrow}</p> : null}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-sourcehub-text">{title}</h1>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={`${item.label}-${index}`} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link href={item.href} className="transition hover:text-sourcehub-primary">
                {item.label}
              </Link>
            ) : (
              <span className={cn(isLast && "font-medium text-sourcehub-text")}>{item.label}</span>
            )}
            {!isLast ? <span className="text-slate-400">/</span> : null}
          </div>
        );
      })}
    </nav>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed bg-white/80">
      <CardContent className="py-12 text-center">
        <p className="text-base font-semibold text-sourcehub-text">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{description}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin text-sourcehub-primary" />
      {label}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We could not complete this request.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-rose-200 bg-rose-50/80">
      <CardContent className="py-8">
        <p className="font-semibold text-rose-800">{title}</p>
        <p className="mt-1 text-sm text-rose-700">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function PaginationShell({
  page,
  totalPages,
  basePath,
  query,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  query?: string;
}) {
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <p className="text-slate-600">
        Page <span className="font-medium text-sourcehub-text">{page}</span> of{" "}
        <span className="font-medium text-sourcehub-text">{totalPages}</span>
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={`${basePath}?page=${prev}${query ? `&${query}` : ""}`}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-xl border px-3",
            page === 1
              ? "pointer-events-none border-sourcehub-border text-slate-400"
              : "border-sourcehub-border text-sourcehub-text hover:border-sourcehub-primary hover:text-sourcehub-primary",
          )}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </Link>
        <Link
          href={`${basePath}?page=${next}${query ? `&${query}` : ""}`}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-xl border px-3",
            page === totalPages
              ? "pointer-events-none border-sourcehub-border text-slate-400"
              : "border-sourcehub-border text-sourcehub-text hover:border-sourcehub-primary hover:text-sourcehub-primary",
          )}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export function SearchInput({
  defaultValue,
  placeholder,
  name = "search",
  action = "",
}: {
  defaultValue?: string;
  placeholder: string;
  name?: string;
  action?: string;
}) {
  return (
    <form action={action} method="get" className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input name={name} defaultValue={defaultValue} placeholder={placeholder} className="pl-11 pr-24" />
      {defaultValue ? (
        <Link
          href={action || "."}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1 text-xs font-medium text-slate-500 hover:bg-sourcehub-muted"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="bg-sourcehub-surface/90">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-sourcehub-text">{value}</p>
          {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
        </div>
        {icon ? <div className="rounded-2xl bg-sourcehub-primary/10 p-3 text-sourcehub-primary">{icon}</div> : null}
      </CardContent>
    </Card>
  );
}

export function DropdownMenu({
  trigger,
  children,
  align = "right",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2">
        {trigger}
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div
          className={cn(
            "absolute z-20 mt-2 w-56 rounded-2xl border border-sourcehub-border bg-white p-2 shadow-soft",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-sourcehub-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function Dialog({
  open,
  title,
  description,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-sourcehub-text">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-sourcehub-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} title={title} description={description} onClose={onClose}>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
