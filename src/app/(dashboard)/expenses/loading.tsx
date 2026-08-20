import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

/** Operational expenses skeleton — three totals + the expense list card. */
export default function ExpensesLoading() {
	return (
		<div className="space-y-5">
			<SkeletonHeader />

			<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
				{Array.from({ length: 3 }, (_, i) => i).map((i) => (
					<div
						key={i}
						className="rounded-xl border border-line bg-surface shadow-token p-4 space-y-3"
					>
						<Skeleton className="h-6 w-28" />
						<Skeleton className="h-3 w-20" />
					</div>
				))}
			</div>

			<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-3">
				<Skeleton className="h-4 w-40" />
				{Array.from({ length: 5 }, (_, i) => i).map((i) => (
					<Skeleton key={i} className="h-4 w-full" />
				))}
			</div>
		</div>
	);
}
