import { cn } from "@/lib/utils";

const controlBase =
	"w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed";

/** Labelled form field wrapper with required marker + hint/error slot. */
export function Field({
	label,
	htmlFor,
	required,
	hint,
	error,
	children,
	className,
}: {
	label?: React.ReactNode;
	htmlFor?: string;
	required?: boolean;
	hint?: React.ReactNode;
	error?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className={className}>
			{label && (
				<label htmlFor={htmlFor} className="block text-sm font-medium text-ink mb-1.5">
					{label}
					{required && (
						<span aria-hidden="true" className="text-danger ml-0.5">
							*
						</span>
					)}
				</label>
			)}
			{children}
			{error ? (
				<p className="text-xs text-danger mt-1">{error}</p>
			) : hint ? (
				<p className="text-xs text-ink-faint mt-1">{hint}</p>
			) : null}
		</div>
	);
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
	return <input className={cn(controlBase, className)} {...props} />;
}

export function Textarea({
	className,
	...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return <textarea className={cn(controlBase, "resize-y", className)} {...props} />;
}

export function Select({
	className,
	children,
	...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
	return (
		<select className={cn(controlBase, "pr-8", className)} {...props}>
			{children}
		</select>
	);
}

/** Inline error banner for form-level failures. */
export function FormError({ children }: { children: React.ReactNode }) {
	return (
		<div
			role="alert"
			className="rounded-lg bg-danger-bg border border-danger px-4 py-3 text-sm text-danger-text"
		>
			{children}
		</div>
	);
}
