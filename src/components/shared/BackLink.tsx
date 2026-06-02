import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
	return (
		<Link
			href={href}
			className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M15 18l-6-6 6-6" />
			</svg>
			{label}
		</Link>
	);
}
