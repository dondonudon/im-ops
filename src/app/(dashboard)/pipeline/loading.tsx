import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

/**
 * Shape-matched loading skeleton for the Pipeline page.
 * Mirrors: header → horizontal kanban board with 5 stage columns.
 */
export default function PipelineLoading() {
	return (
		<div className="space-y-5">
			<SkeletonHeader />

			{/* Kanban board — horizontal scrollable flex row of 5 columns */}
			<div className="flex gap-3 overflow-x-auto pb-2">
				{Array.from({ length: 5 }).map((_, col) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					<div
						key={col}
						className="w-[290px] shrink-0 rounded-xl border border-line bg-subtle p-3 space-y-3"
					>
						{/* Column header */}
						<div className="flex items-center justify-between px-1 py-1">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="h-5 w-6 rounded-full" />
						</div>

						{/* 2–3 card placeholders per column */}
						{Array.from({ length: col === 0 ? 3 : col === 4 ? 2 : 3 }).map((_, card) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
							<div
								key={card}
								className="rounded-xl border border-line bg-surface shadow-token p-4 space-y-2.5"
							>
								<Skeleton className="h-3 w-28" />
								<Skeleton className="h-4 w-3/4" />
								<Skeleton className="h-3 w-full" />
								<Skeleton className="h-3 w-2/3" />
							</div>
						))}
					</div>
				))}
			</div>
		</div>
	);
}
