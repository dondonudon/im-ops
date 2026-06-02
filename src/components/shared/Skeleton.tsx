import type { CSSProperties } from "react";

/**
 * Visual placeholder used by Next 14 loading.tsx boundaries. Pure presentation —
 * no animation library, just Tailwind's animate-pulse.
 */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
	return (
		<div
			role="presentation"
			aria-hidden="true"
			className={`animate-pulse rounded-md bg-subtle ${className}`}
			style={style}
		/>
	);
}

export function SkeletonCard({ className = "" }: { className?: string }) {
	return (
		<div
			className={`rounded-xl border border-line bg-surface shadow-token p-5 space-y-3 ${className}`}
		>
			<Skeleton className="h-3 w-24" />
			<Skeleton className="h-5 w-3/4" />
			<Skeleton className="h-3 w-1/2" />
		</div>
	);
}

export function SkeletonHeader() {
	return (
		<div className="flex items-start justify-between flex-wrap gap-4">
			<div className="space-y-2">
				<Skeleton className="h-7 w-48" />
				<Skeleton className="h-3 w-64" />
			</div>
			<div className="flex gap-2">
				<Skeleton className="h-9 w-20" />
				<Skeleton className="h-9 w-28" />
			</div>
		</div>
	);
}
