import { Skeleton } from "@/components/shared/Skeleton";

export default function LeadDetailLoading() {
	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between">
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						<Skeleton className="h-7 w-48" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
					<Skeleton className="h-3 w-56" />
				</div>
				<div className="flex gap-2 flex-wrap">
					<Skeleton className="h-9 w-24" />
					<Skeleton className="h-9 w-20" />
				</div>
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
				<div className="xl:col-span-2 space-y-6">
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-24" />
						<div className="grid grid-cols-2 gap-4">
							{Array.from({ length: 4 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
								<div key={i} className="space-y-1.5">
									<Skeleton className="h-3 w-16" />
									<Skeleton className="h-5 w-32" />
								</div>
							))}
						</div>
					</div>
					<div className="bg-surface border border-line rounded-xl shadow-token p-5">
						<Skeleton className="h-3 w-20 mb-3" />
						<div className="grid grid-cols-3 gap-2">
							{Array.from({ length: 3 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
								<Skeleton key={i} className="aspect-square w-full" />
							))}
						</div>
					</div>
				</div>
				<div className="xl:col-span-1">
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
