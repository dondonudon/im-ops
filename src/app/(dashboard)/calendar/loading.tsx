import { Skeleton } from "@/components/shared/Skeleton";

export default function CalendarLoading() {
	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between flex-wrap gap-4">
				<Skeleton className="h-7 w-32" />
				<Skeleton className="h-8 w-40" />
			</div>
			<div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
				<div className="flex items-center gap-2">
					<Skeleton className="h-9 w-9 rounded-lg" />
					<Skeleton className="h-9 flex-1" />
					<Skeleton className="h-9 w-9 rounded-lg" />
					<Skeleton className="h-9 w-32" />
				</div>
				<div className="grid grid-cols-7 gap-1">
					{Array.from({ length: 35 }).map((_, i) => (
						<Skeleton
							// biome-ignore lint/suspicious/noArrayIndexKey: placeholder grid cell
							key={i}
							className="min-h-[64px] md:min-h-[96px]"
						/>
					))}
				</div>
			</div>
		</div>
	);
}
