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

function cn(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

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
