import { Skeleton } from "@/components/shared/Skeleton";

export default function SurveyDetailLoading() {
	return (
		<div className="max-w-3xl mx-auto space-y-5">
			<Skeleton className="h-4 w-28" />
			<div className="bg-surface rounded-2xl border border-line p-6 space-y-4">
				<div className="flex items-start justify-between gap-4">
					<div className="space-y-2">
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-3 w-24" />
					</div>
					<div className="flex gap-2">
						<Skeleton className="h-8 w-36 rounded-lg" />
						<Skeleton className="h-8 w-24 rounded-full" />
					</div>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{Array.from({ length: 4 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
						<div key={i} className="space-y-1.5">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-5 w-32" />
						</div>
					))}
				</div>
			</div>
			<div className="bg-surface rounded-2xl border border-line p-6 space-y-3">
				<Skeleton className="h-3 w-24" />
				<div className="grid grid-cols-3 gap-2">
					{Array.from({ length: 3 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
						<Skeleton key={i} className="aspect-square" />
					))}
				</div>
			</div>
		</div>
	);
}
