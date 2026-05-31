"use client";
import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Props = LinkProps &
	Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
		children: ReactNode;
		/** Where the spinner sits relative to children. Defaults to "right". */
		spinnerPosition?: "left" | "right";
	};

/**
 * Drop-in replacement for `<Link>` that shows an inline spinner inside the
 * link while navigation is pending. Use for CTAs where the global progress
 * bar alone isn't enough feedback (e.g. inside a dense list, or when the
 * destination route doesn't have a loading.tsx).
 */
export function PendingLink({
	href,
	onClick,
	children,
	spinnerPosition = "right",
	className,
	...rest
}: Props) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();

	function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
		if (onClick) onClick(e);
		if (e.defaultPrevented) return;
		// Let the browser handle modifier clicks / new-tab / external links.
		if (
			e.metaKey ||
			e.ctrlKey ||
			e.shiftKey ||
			e.altKey ||
			e.button !== 0 ||
			rest.target === "_blank"
		)
			return;
		const url = typeof href === "string" ? href : href.pathname ?? "";
		if (!url || url.startsWith("http") || url.startsWith("//")) return;
		e.preventDefault();
		startTransition(() => router.push(url));
	}

	const spinner = pending ? (
		<Loader2
			size={13}
			className="animate-spin shrink-0 opacity-80"
			aria-hidden="true"
		/>
	) : null;

	return (
		<Link
			href={href}
			onClick={handleClick}
			aria-busy={pending || undefined}
			className={className}
			{...rest}
		>
			{spinnerPosition === "left" && spinner}
			{children}
			{spinnerPosition === "right" && spinner}
		</Link>
	);
}
