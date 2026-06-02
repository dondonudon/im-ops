import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

/**
 * Shape-matched loading skeleton for the Customers list page.
 * Mirrors: header → search input → desktop table (4 cols) → mobile card stack.
 */
export default function CustomersLoading() {
	return (
		<div className="space-y-5">
			<SkeletonHeader />

			{/* Search input */}
			<Skeleton className="h-9 w-full max-w-sm rounded-lg" />

			{/* Desktop table skeleton */}
			<div className="hidden md:block rounded-xl border border-line bg-surface shadow-token overflow-hidden">
				{/* Header */}
				<div className="flex items-center gap-8 px-5 py-3 border-b border-line">
					<Skeleton className="h-3 w-28" />
					<Skeleton className="h-3 w-24" />
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-3 w-20 ml-auto" />
				</div>
				{/* Rows */}
				{Array.from({ length: 6 }, (_, i) => i).map((i) => (
					<div
						key={i}
						className="flex items-center gap-8 px-5 py-3.5 border-b border-line last:border-b-0"
					>
						<Skeleton className="h-3 w-36" />
						<Skeleton className="h-3 w-28" />
						<Skeleton className="h-5 w-20 rounded-full" />
						<Skeleton className="h-3 w-20 ml-auto" />
					</div>
				))}
			</div>

			{/* Mobile card stack */}
			<div className="md:hidden space-y-3">
				{Array.from({ length: 4 }, (_, i) => i).map((i) => (
					<div
						key={i}
						className="rounded-xl border border-line bg-surface shadow-token p-4 space-y-3"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 space-y-1.5">
								<Skeleton className="h-4 w-36" />
								<Skeleton className="h-3 w-24" />
							</div>
							<Skeleton className="h-5 w-20 rounded-full shrink-0" />
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1">
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-full" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
