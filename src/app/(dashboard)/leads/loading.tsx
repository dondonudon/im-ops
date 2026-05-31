import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

/**
 * Shape-matched loading skeleton for the Leads list page.
 * Mirrors: header → filter row (search + select + button) → list of row cards.
 */
export default function LeadsLoading() {
	return (
		<div className="space-y-5">
			<SkeletonHeader />

			{/* Filter row: search input + select + button */}
			<div className="flex flex-wrap gap-2">
				<Skeleton className="h-9 w-56 rounded-lg flex-1 max-w-xs" />
				<Skeleton className="h-9 w-36 rounded-lg" />
				<Skeleton className="h-9 w-20 rounded-lg" />
			</div>

			{/* Lead list rows */}
			<div className="space-y-2">
				{Array.from({ length: 6 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					<div
						key={i}
						className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface shadow-token px-5 py-4"
					>
						{/* Left: name + route line */}
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-full max-w-xs" />
						</div>
						{/* Right: status chip + date */}
						<div className="flex items-center gap-4 shrink-0">
							<Skeleton className="h-5 w-24 rounded-full" />
							<Skeleton className="hidden sm:block h-3 w-20" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
