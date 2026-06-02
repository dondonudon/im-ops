import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
	primary: "bg-primary text-primary-fg hover:bg-primary-hover shadow-token-sm",
	secondary: "bg-surface text-ink border border-line hover:bg-subtle",
	subtle: "bg-primary-subtle text-primary-text hover:opacity-80",
	ghost: "text-ink-muted hover:bg-subtle hover:text-ink",
	danger: "bg-danger text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
	sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
	md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
	lg: "h-11 px-5 text-sm gap-2 rounded-xl",
	icon: "h-9 w-9 rounded-lg",
};

/** Shared button/link styling so <Link> can look like a <Button>. */
export function buttonStyles({
	variant = "primary",
	size = "md",
	className,
}: {
	variant?: Variant;
	size?: Size;
	className?: string;
} = {}) {
	return cn(
		"inline-flex items-center justify-center font-semibold whitespace-nowrap transition-all",
		"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
		"disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
		VARIANTS[variant],
		SIZES[size],
		className,
	);
}

export function Button({
	variant = "primary",
	size = "md",
	className,
	loading = false,
	disabled,
	children,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: Variant;
	size?: Size;
	/** Shows a spinner and disables the button while an async action runs. */
	loading?: boolean;
}) {
	return (
		<button
			className={buttonStyles({ variant, size, className })}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			{...props}
		>
			{loading && <Loader2 size={15} className="animate-spin shrink-0" aria-hidden="true" />}
			{children}
		</button>
	);
}
