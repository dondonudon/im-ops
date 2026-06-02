import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

/**
 * Shape-matched loading skeleton for the Jobs list page.
 * Mirrors: header → status filter → desktop table skeleton → mobile card stack.
 */
export default function JobsLoading() {
	return (
		<div className="space-y-5">
			<SkeletonHeader />

			{/* Filter row — status select */}
			<Skeleton className="h-9 w-36 rounded-lg" />

			{/* Desktop table skeleton */}
			<div className="hidden md:block rounded-xl border border-line bg-surface shadow-token overflow-hidden">
				{/* Table header */}
				<div className="flex items-center gap-4 px-5 py-3 border-b border-line">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-3 w-28 ml-8" />
					<Skeleton className="h-3 w-24 ml-8" />
					<Skeleton className="h-3 w-20 ml-auto" />
					<Skeleton className="h-3 w-16" />
				</div>
				{/* Table rows */}
				{Array.from({ length: 6 }, (_, i) => i).map((i) => (
					<div
						key={i}
						className="flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0"
					>
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-3 w-32 ml-8" />
						<Skeleton className="h-3 w-28 ml-8" />
						<Skeleton className="h-3 w-24 ml-auto" />
						<Skeleton className="h-5 w-20 rounded-full" />
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
						<div className="flex items-start justify-between">
							<div className="space-y-1.5">
								<Skeleton className="h-3 w-20" />
								<Skeleton className="h-4 w-36" />
							</div>
							<Skeleton className="h-5 w-20 rounded-full" />
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
							<Skeleton className="h-3 w-full" />
							<Skeleton className="h-3 w-full" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
