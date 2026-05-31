import { Skeleton } from "@/components/shared/Skeleton";

export default function ProposalDetailLoading() {
	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between flex-wrap gap-4">
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						<Skeleton className="h-7 w-56" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
					<Skeleton className="h-3 w-64" />
				</div>
				<div className="flex gap-3 flex-wrap">
					<Skeleton className="h-9 w-24" />
					<Skeleton className="h-9 w-32" />
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 space-y-6">
					{/* Move summary */}
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 grid grid-cols-2 gap-4">
						{Array.from({ length: 4 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
							<div key={i} className="space-y-1.5">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-5 w-32" />
							</div>
						))}
					</div>
					{/* Estimation breakdown */}
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-32" />
						{Array.from({ length: 5 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
							<div key={i} className="flex justify-between gap-3">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-4 w-20" />
							</div>
						))}
					</div>
					{/* Negotiation history */}
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-40" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				</div>
				<div className="space-y-3">
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
