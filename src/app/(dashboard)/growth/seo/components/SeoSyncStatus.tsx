import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, type Tone } from "@/components/ui";
import type { LatestSeoSync } from "@/lib/search-console/queries";

function formatTimestamp(iso: string, locale: string): string {
	return new Date(iso).toLocaleString(locale, {
		timeZone: "Asia/Jakarta",
		dateStyle: "medium",
		timeStyle: "short",
	});
}

function formatDay(dateStr: string, locale: string): string {
	// Anchor the date-only value at Jakarta midnight so it never shifts a day.
	return new Date(`${dateStr}T00:00:00+07:00`).toLocaleDateString(locale, {
		timeZone: "Asia/Jakarta",
		dateStyle: "medium",
	});
}

/**
 * Sync health card. Shown even on failure — historical data stays visible and
 * the failure is surfaced, never hidden.
 */
export async function SeoSyncStatus({ sync }: { sync: LatestSeoSync | null }) {
	const t = await getTranslations("pages.seo.sync");
	const locale = await getLocale();

	if (!sync) {
		return (
			<Card>
				<div className="p-5 flex items-start gap-3">
					<Clock size={18} className="text-ink-faint mt-0.5 shrink-0" aria-hidden />
					<div>
						<p className="font-semibold text-ink">{t("title")}</p>
						<p className="text-sm text-ink-muted">{t("never")}</p>
					</div>
				</div>
			</Card>
		);
	}

	const failed = sync.status === "failed";
	const running = sync.status === "running";
	const partial = sync.status === "partial";
	const tone: Tone = failed ? "danger" : running || partial ? "pending" : "positive";
	const statusLabel = failed
		? t("failed")
		: running
			? t("running")
			: partial
				? t("partial")
				: t("healthy");
	const icon = failed ? (
		<AlertTriangle size={18} className="text-danger-text mt-0.5 shrink-0" aria-hidden />
	) : running || partial ? (
		<Clock size={18} className="text-warning-text mt-0.5 shrink-0" aria-hidden />
	) : (
		<CheckCircle2 size={18} className="text-success-text mt-0.5 shrink-0" aria-hidden />
	);

	return (
		<Card>
			<div className="p-5 flex items-start gap-3">
				{icon}
				<div className="space-y-1">
					<div className="flex items-center gap-2">
						<p className="font-semibold text-ink">{t("title")}</p>
						<Badge tone={tone}>{statusLabel}</Badge>
					</div>
					<p className="text-sm text-ink-muted">
						{t("dataThrough", { date: formatDay(sync.endDate, locale) })}
					</p>
					{sync.completedAt && (
						<p className="text-sm text-ink-muted">
							{t("lastUpdated", { time: formatTimestamp(sync.completedAt, locale) })}
						</p>
					)}
					{failed && (
						<>
							<p className="text-sm text-danger-text">
								{t("failedReason", { code: sync.errorMessage ?? "unknown" })}
							</p>
							<p className="text-sm text-ink-faint">{t("historicalNote")}</p>
						</>
					)}
				</div>
			</div>
		</Card>
	);
}
