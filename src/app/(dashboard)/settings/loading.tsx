import { Skeleton, SkeletonHeader } from "@/components/shared/Skeleton";

/**
 * Shape-matched loading skeleton for the Settings page.
 * Mirrors: header (title + hint) → tab bar → a couple of section cards each with field-row placeholders.
 */
export default function SettingsLoading() {
	return (
		<div className="space-y-6 max-w-3xl">
			<SkeletonHeader />

			{/* Tab bar — 5 tabs matching SettingsEditor TABS */}
			<div className="flex gap-1 border-b border-line pb-0">
				{Array.from({ length: 5 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					<Skeleton key={i} className="h-8 w-24 rounded-t-lg" />
				))}
			</div>

			{/* Section card 1 — e.g. Company & Docs */}
			<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-5">
				<div className="space-y-1.5">
					<Skeleton className="h-4 w-40" />
					<Skeleton className="h-3 w-64" />
				</div>
				{/* Field rows */}
				{Array.from({ length: 4 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					<div key={i} className="flex flex-col gap-1.5">
						<Skeleton className="h-3 w-28" />
						<Skeleton className="h-9 w-full rounded-lg" />
					</div>
				))}
			</div>

			{/* Section card 2 — another category group */}
			<div className="rounded-xl border border-line bg-surface shadow-token p-5 space-y-5">
				<div className="space-y-1.5">
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-3 w-56" />
				</div>
				{Array.from({ length: 3 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder
					<div key={i} className="flex flex-col gap-1.5">
						<Skeleton className="h-3 w-28" />
						<Skeleton className="h-9 w-full rounded-lg" />
					</div>
				))}
			</div>

			{/* Save button placeholder */}
			<div className="flex justify-end">
				<Skeleton className="h-9 w-28 rounded-lg" />
			</div>
		</div>
	);
}
