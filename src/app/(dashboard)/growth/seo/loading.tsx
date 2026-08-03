import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

export default function SeoLoading() {
	return (
		<div className="space-y-8">
			<SkeletonHeader />
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
			<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-3">
				<Skeleton className="h-4 w-40" />
				{Array.from({ length: 5 }, (_, i) => i).map((i) => (
					<Skeleton key={i} className="h-8 w-full" />
				))}
			</div>
		</div>
	);
}
