import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

/** Money hub skeleton — KPI stats + two panels + a breakdown card. */
export default function MoneyLoading() {
	return (
		<div className="space-y-5">
			<SkeletonHeader />

			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				{Array.from({ length: 4 }, (_, i) => i).map((i) => (
					<div
						key={i}
						className="rounded-xl border border-line bg-surface shadow-token p-4 space-y-3"
					>
						<Skeleton className="h-8 w-8 rounded-lg" />
						<Skeleton className="h-6 w-28" />
						<Skeleton className="h-3 w-20" />
					</div>
				))}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
				{Array.from({ length: 2 }, (_, i) => i).map((i) => (
					<div
						key={i}
						className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-3"
					>
						<Skeleton className="h-4 w-32" />
						{Array.from({ length: 4 }, (_, j) => j).map((j) => (
							<Skeleton key={j} className="h-4 w-full" />
						))}
					</div>
				))}
			</div>

			<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-3">
				<Skeleton className="h-4 w-32" />
				{Array.from({ length: 3 }, (_, i) => i).map((i) => (
					<Skeleton key={i} className="h-4 w-full" />
				))}
			</div>
		</div>
	);
}
