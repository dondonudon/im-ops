"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Input, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { MarginTiersEditor } from "./MarginTiersEditor";
import { type MonthTarget, RevenueTargetEditor } from "./RevenueTargetEditor";

type Setting = {
	key: string;
	value: string;
	category: string | null;
	description: string | null;
};

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

type Tab = {
	id: string;
	/** i18n key under `pages.settings.groups.*` */
	labelKey: string;
	/** i18n key under `pages.settings.descriptions.*` */
	descriptionKey: string;
	categories: string[];
};

const TABS: Tab[] = [
	{
		id: "company",
		labelKey: "companyAndDocs",
		descriptionKey: "companyAndDocs",
		categories: ["company", "documents"],
	},
	{
		id: "operations",
		labelKey: "operations",
		descriptionKey: "operations",
		categories: ["crew", "vehicle", "packing"],
	},
	{
		id: "pricing",
		labelKey: "pricing",
		descriptionKey: "pricing",
		categories: ["pricing", "safety"],
	},
	{
		id: "billing",
		labelKey: "billing",
		descriptionKey: "billing",
		categories: ["invoice", "dashboard"],
	},
	{
		id: "integrations",
		labelKey: "integrations",
		descriptionKey: "integrations",
		categories: ["gcal"],
	},
];

/**
 * Maps a setting `category` value (DB string) to the i18n key under
 * `pages.settings.sections.*`. Categories without a translation fall back to
 * the raw category string at render time.
 */
const CATEGORY_KEY_MAP: Record<string, string> = {
	company: "companyIdentity",
	documents: "documentTemplates",
	crew: "crewManpower",
	pricing: "pricingMargins",
	vehicle: "vehicles",
	packing: "packingMaterials",
	safety: "safetyThresholds",
	invoice: "invoiceSettings",
	dashboard: "dashboard",
	gcal: "googleCalendar",
};

// ---------------------------------------------------------------------------
// Input-type inference
// ---------------------------------------------------------------------------

/**
 * Infer appropriate input type from key name and current value.
 * - textarea: multi-line content or keys signalling long text
 * - number: rate/pct/day/fee numeric keys
 * - text: everything else
 */
function inferInputType(key: string, value: string): "textarea" | "number" | "text" {
	if (value.includes("\n") || /_terms$|_note$|_tagline$|_services$/.test(key)) {
		return "textarea";
	}
	if (/_rate|_pct$|_days$|_fee$|_per_|_buffer_pct$|_target|_profit$|_increment$/.test(key)) {
		return "number";
	}
	return "text";
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

/**
 * Tabbed settings editor. All settings are fetched server-side and passed in;
 * tab switching and field editing are handled entirely client-side.
 */
export function SettingsEditor({
	settings,
	revenueTargets,
	defaultRevenueTarget,
}: {
	settings: Setting[];
	revenueTargets: MonthTarget[];
	defaultRevenueTarget: number;
}) {
	const tGroups = useTranslations("pages.settings.groups");
	const tDescriptions = useTranslations("pages.settings.descriptions");
	const tSections = useTranslations("pages.settings.sections");
	const tPage = useTranslations("pages.settings");
	const [activeTab, setActiveTab] = useState(TABS[0].id);

	const currentTab = TABS.find((t) => t.id === activeTab) ?? TABS[0];

	// Categories present in the active tab that also have at least one setting
	const visibleCategories = currentTab.categories.filter((cat) =>
		settings.some((s) => (s.category ?? "general") === cat),
	);

	/** Look up the translated section label for a DB category string. */
	function sectionLabel(cat: string): string {
		const key = CATEGORY_KEY_MAP[cat];
		return key ? tSections(key) : cat;
	}

	return (
		<div>
			{/* Tab bar */}
			<div
				role="tablist"
				aria-label={tPage("sectionsAria")}
				className="flex gap-1 border-b border-line mb-6 overflow-x-auto"
			>
				{TABS.map((tab) => {
					const hasSettings = tab.categories.some((cat) =>
						settings.some((s) => (s.category ?? "general") === cat),
					);
					if (!hasSettings) return null;

					const isActive = tab.id === activeTab;
					return (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={isActive}
							aria-controls={`tabpanel-${tab.id}`}
							id={`tab-${tab.id}`}
							onClick={() => setActiveTab(tab.id)}
							className={[
								"shrink-0 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
								isActive
									? "border-primary text-primary-text"
									: "border-transparent text-ink-muted hover:text-ink hover:border-line-strong",
							].join(" ")}
						>
							{tGroups(tab.labelKey)}
						</button>
					);
				})}
			</div>

			{/* Tab panel */}
			<div
				id={`tabpanel-${currentTab.id}`}
				role="tabpanel"
				aria-labelledby={`tab-${currentTab.id}`}
			>
				<p className="text-sm text-ink-muted mb-6">{tDescriptions(currentTab.descriptionKey)}</p>

				{visibleCategories.length === 0 ? (
					<p className="text-sm text-ink-faint italic">{tPage("noSettings")}</p>
				) : (
					<div className="space-y-8">
						{visibleCategories.map((cat) => {
							const rows = settings.filter((s) => (s.category ?? "general") === cat);
							if (rows.length === 0) return null;
							const heading = sectionLabel(cat);
							return (
								<section key={cat} aria-label={heading}>
									{/* Only show the section heading when there are multiple
									    categories in this tab */}
									{visibleCategories.length > 1 && (
										<h2 className="text-xs font-semibold text-ink-muted uppercase tracking-widest mb-3">
											{heading}
										</h2>
									)}
									<div className="rounded-xl border border-line bg-surface divide-y divide-line">
										{rows.map((s) => (
											<SettingRow key={s.key} setting={s} />
										))}
									</div>
								</section>
							);
						})}
					</div>
				)}

				{currentTab.id === "billing" && (
					<RevenueTargetEditor
						defaultTarget={defaultRevenueTarget}
						initialTargets={revenueTargets}
					/>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

function SettingRow({ setting }: { setting: Setting }) {
	// Structured settings get a bespoke editor instead of the generic input.
	if (setting.key === "margin_tiers") {
		return <MarginTiersEditor setting={setting} />;
	}

	return <GenericSettingRow setting={setting} />;
}

function GenericSettingRow({ setting }: { setting: Setting }) {
	const router = useRouter();
	const tButtons = useTranslations("common.buttons");
	const [value, setValue] = useState(setting.value);
	const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
	const inputType = inferInputType(setting.key, setting.value);

	/**
	 * Persist value on blur. No-ops if value is unchanged.
	 * Security: value is a plain string persisted only to the authenticated
	 * user's own system_settings row — no injection risk beyond DB-level RLS.
	 */
	async function handleSave() {
		if (value === setting.value) return;
		setSaveState("saving");
		const supabase = createClient();
		await supabase
			.from("system_settings")
			.update({ value, updated_at: new Date().toISOString() })
			.eq("key", setting.key);
		setSaveState("saved");
		router.refresh();
		setTimeout(() => setSaveState("idle"), 2000);
	}

	const label = setting.description ?? setting.key;

	if (inputType === "textarea") {
		return (
			<div className="px-4 py-4">
				<div className="flex items-start justify-between gap-4 mb-2">
					<div className="min-w-0">
						<p className="text-sm font-medium text-ink leading-snug">{label}</p>
						<p className="text-xs font-mono text-ink-faint mt-0.5">{setting.key}</p>
					</div>
					{saveState !== "idle" && (
						<span
							className={`shrink-0 text-xs mt-0.5 ${saveState === "saved" ? "text-success" : "text-ink-faint"}`}
							aria-live="polite"
						>
							{saveState === "saved" ? tButtons("saved") : tButtons("saving")}
						</span>
					)}
				</div>
				<Textarea
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onBlur={handleSave}
					rows={Math.max(3, value.split("\n").length + 1)}
					aria-label={label}
					className="leading-relaxed"
				/>
			</div>
		);
	}

	return (
		<div className="flex items-start gap-4 px-4 py-3">
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-ink leading-snug">{label}</p>
				<p className="text-xs font-mono text-ink-faint mt-0.5">{setting.key}</p>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				{inputType === "number" ? (
					<NumericInput
						value={Number(value)}
						onChange={(v) => setValue(String(v))}
						onBlur={handleSave}
						aria-label={label}
						className="w-48 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink text-right tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent"
					/>
				) : (
					<Input
						type={inputType}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onBlur={handleSave}
						aria-label={label}
						className="w-48 text-right tabular-nums"
					/>
				)}
				{saveState !== "idle" && (
					<span
						className={`text-xs w-14 text-right ${saveState === "saved" ? "text-success" : "text-ink-faint"}`}
						aria-live="polite"
					>
						{saveState === "saved" ? tButtons("saved") : tButtons("saving")}
					</span>
				)}
			</div>
		</div>
	);
}
