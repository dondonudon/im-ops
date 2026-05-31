import {
	Skeleton,
	SkeletonCard,
	SkeletonHeader,
} from "@/components/shared/Skeleton";

/**
 * Default loading skeleton for any dashboard route that doesn't define its own.
 * Mirrors the rough "header + 3-up card grid" shape used by list pages so the
 * layout doesn't jump on mount.
 */
export default function DashboardLoading() {
	return (
		<div className="space-y-6">
			<SkeletonHeader />
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				<SkeletonCard />
				<SkeletonCard />
				<SkeletonCard />
			</div>
			<div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 space-y-3">
				{Array.from({ length: 4 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					<Skeleton key={i} className="h-4 w-full" />
				))}
			</div>
		</div>
	);
}
