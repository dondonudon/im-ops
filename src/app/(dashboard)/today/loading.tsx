import { Skeleton, SkeletonCard, SkeletonHeader } from "@/components/shared/Skeleton";

/**
 * Shape-matched loading skeleton for the Today page.
 * Mirrors: header → today's moves strip → needs-you + money grid → at-a-glance stats → upcoming list.
 */
export default function TodayLoading() {
	return (
		<div className="space-y-6">
			<SkeletonHeader />

			{/* Today's moves strip — sm:grid-cols-2 xl:grid-cols-3 */}
			<section className="space-y-3">
				<Skeleton className="h-4 w-32" />
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 3 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
						<div
							key={i}
							className="bg-surface border border-line rounded-xl shadow-token p-4 space-y-3"
						>
							<div className="flex items-center justify-between">
								<Skeleton className="h-4 w-16" />
								<Skeleton className="h-5 w-20 rounded-full" />
							</div>
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-3 w-full" />
						</div>
					))}
				</div>
			</section>

			{/* Main grid: Needs you (2-col) + Money this month (1-col) */}
			<div className="grid gap-5 lg:grid-cols-3">
				{/* Needs you list card */}
				<div className="lg:col-span-2 rounded-xl border border-line bg-surface shadow-token overflow-hidden">
					<div className="px-5 py-4 border-b border-line">
						<Skeleton className="h-4 w-28" />
					</div>
					{Array.from({ length: 4 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
						<div
							key={i}
							className="flex items-center gap-3 px-5 py-3.5 border-b border-line last:border-b-0"
						>
							<Skeleton className="h-9 w-9 rounded-lg shrink-0" />
							<div className="flex-1 min-w-0 space-y-1.5">
								<Skeleton className="h-3 w-40" />
								<Skeleton className="h-3 w-24" />
							</div>
							<Skeleton className="h-7 w-16 rounded-lg shrink-0" />
						</div>
					))}
				</div>

				{/* Money this month card */}
				<div className="rounded-xl border border-line bg-surface shadow-token p-5 flex flex-col gap-4">
					<Skeleton className="h-4 w-32" />
					<div className="space-y-1.5">
						<div className="flex justify-between">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-3 w-32" />
						</div>
						<Skeleton className="h-2 w-full rounded-full" />
						<Skeleton className="h-3 w-20" />
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="bg-subtle rounded-lg p-3 space-y-1.5">
							<Skeleton className="h-3 w-16" />
							<Skeleton className="h-5 w-24" />
						</div>
						<div className="bg-subtle rounded-lg p-3 space-y-1.5">
							<Skeleton className="h-3 w-16" />
							<Skeleton className="h-5 w-24" />
						</div>
					</div>
					<div className="flex items-center justify-between border-t border-line pt-3">
						<Skeleton className="h-3 w-12" />
						<Skeleton className="h-4 w-28" />
					</div>
				</div>
			</div>

			{/* At a glance — 4-up stat cards */}
			<section className="space-y-3">
				<Skeleton className="h-4 w-24" />
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
					<SkeletonCard />
				</div>
			</section>

			{/* Upcoming list card */}
			<div className="rounded-xl border border-line bg-surface shadow-token overflow-hidden">
				<div className="flex items-center justify-between px-5 py-4 border-b border-line">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-3 w-20" />
				</div>
				{Array.from({ length: 5 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					<div
						key={i}
						className="flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-b-0"
					>
						<Skeleton className="shrink-0 w-11 h-11 rounded-lg" />
						<div className="min-w-0 flex-1 space-y-1.5">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-3 w-16" />
						</div>
						<Skeleton className="h-5 w-20 rounded-full shrink-0" />
					</div>
				))}
			</div>
		</div>
	);
}
