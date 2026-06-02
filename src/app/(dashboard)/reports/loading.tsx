import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

/**
 * Shape-matched loading skeleton for the Reports page.
 * Mirrors: header → 4-up KPI stat cards → 2-col grid (profit table + expense/funnel panels) → 2-col grid (AR aging + lost proposals).
 */
export default function ReportsLoading() {
	return (
		<div className="space-y-8">
			<SkeletonHeader />

			{/* KPI summary — 4-up grid */}
			<section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
				{Array.from({ length: 4 }, (_, i) => i).map((i) => (
					<div
						key={i}
						className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-2"
					>
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-7 w-32" />
					</div>
				))}
			</section>

			{/* Main panels row — profit table (left) + expense + funnel (right stack) */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Profit by job table */}
				<div className="rounded-xl border border-line bg-surface shadow-token overflow-hidden">
					<div className="px-5 py-4 border-b border-line">
						<Skeleton className="h-4 w-32" />
					</div>
					<div className="p-5 space-y-3">
						<div className="flex gap-6">
							<Skeleton className="h-3 w-16" />
							<Skeleton className="h-3 w-16 ml-auto" />
							<Skeleton className="h-3 w-16" />
							<Skeleton className="h-3 w-16" />
						</div>
						{Array.from({ length: 6 }, (_, i) => i).map((i) => (
							<div key={i} className="flex gap-6">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-3 w-20 ml-auto" />
								<Skeleton className="h-3 w-20" />
								<Skeleton className="h-3 w-20" />
							</div>
						))}
					</div>
				</div>

				{/* Right column: expenses this month + lead funnel */}
				<div className="space-y-6">
					{/* Expenses this month */}
					<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-3">
						<div className="border-b border-line pb-3">
							<Skeleton className="h-4 w-36" />
						</div>
						{Array.from({ length: 4 }, (_, i) => i).map((i) => (
							<div key={i} className="flex justify-between">
								<Skeleton className="h-3 w-28" />
								<Skeleton className="h-3 w-20" />
							</div>
						))}
					</div>

					{/* Lead funnel */}
					<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-3">
						<div className="border-b border-line pb-3">
							<Skeleton className="h-4 w-28" />
						</div>
						{Array.from({ length: 5 }, (_, i) => i).map((i) => (
							<div key={i} className="flex justify-between">
								<Skeleton className="h-3 w-32" />
								<Skeleton className="h-3 w-8" />
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Bottom panels: AR aging + Lost proposal reasons */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* AR aging */}
				<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-3">
					<div className="flex items-center justify-between border-b border-line pb-3">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-3 w-32" />
					</div>
					{Array.from({ length: 5 }, (_, i) => i).map((i) => (
						<div key={i} className="space-y-1.5">
							<div className="flex justify-between">
								<Skeleton className="h-3 w-24" />
								<Skeleton className="h-3 w-20" />
							</div>
							<Skeleton className="h-1.5 w-full rounded-full" />
						</div>
					))}
				</div>

				{/* Lost proposals */}
				<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-3">
					<div className="flex items-center justify-between border-b border-line pb-3">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-16" />
					</div>
					{Array.from({ length: 5 }, (_, i) => i).map((i) => (
						<div key={i} className="flex justify-between">
							<Skeleton className="h-3 w-36" />
							<Skeleton className="h-3 w-12" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
