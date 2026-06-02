import { Skeleton } from "@/components/shared/Skeleton";

export default function InvoiceDetailLoading() {
	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between flex-wrap gap-4">
				<div className="space-y-2">
					<Skeleton className="h-7 w-48" />
					<Skeleton className="h-3 w-64" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="h-9 w-32" />
					<Skeleton className="h-9 w-28" />
				</div>
			</div>
			<div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
				<div className="xl:col-span-2 space-y-3">
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						{Array.from({ length: 5 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
							<div key={i} className="flex justify-between gap-3">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-4 w-20" />
							</div>
						))}
					</div>
				</div>
				<div className="space-y-3">
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-12 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
