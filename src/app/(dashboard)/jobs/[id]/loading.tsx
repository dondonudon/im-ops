import { Skeleton } from "@/components/shared/Skeleton";

export default function JobDetailLoading() {
	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between flex-wrap gap-4">
				<div className="space-y-2">
					<div className="flex items-center gap-3">
						<Skeleton className="h-7 w-40" />
						<Skeleton className="h-5 w-20 rounded-full" />
					</div>
					<Skeleton className="h-3 w-72" />
				</div>
				<div className="flex gap-2 flex-wrap">
					<Skeleton className="h-9 w-24" />
					<Skeleton className="h-9 w-32" />
					<Skeleton className="h-9 w-28" />
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Left column */}
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

					{/* Assignments */}
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>

					{/* Expenses */}
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-24" />
						{Array.from({ length: 3 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
							<div key={i} className="flex justify-between gap-3">
								<Skeleton className="h-4 flex-1" />
								<Skeleton className="h-4 w-20" />
							</div>
						))}
					</div>

					{/* Timeline */}
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-24" />
						{Array.from({ length: 3 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholder
							<div key={i} className="flex gap-3 items-start">
								<Skeleton className="h-2.5 w-2.5 mt-1 rounded-full" />
								<div className="flex-1 space-y-1">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Right column */}
				<div className="space-y-4">
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-8 w-32" />
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
					<div className="bg-surface border border-line rounded-xl shadow-token p-5 space-y-3">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-10 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
