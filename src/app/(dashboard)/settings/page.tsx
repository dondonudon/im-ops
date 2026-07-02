import { getTranslations } from "next-intl/server";
import { SettingsEditor } from "@/components/settings/SettingsEditor";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
	const supabase = await createClient();
	const t = await getTranslations("pages.settings");

	const [{ data: settings }, { data: revenueTargets }] = await Promise.all([
		supabase
			.from("system_settings")
			.select("key, value, category, description")
			.order("category")
			.order("key"),
		supabase
			.from("revenue_targets")
			.select("year, month, target_amount")
			.order("year")
			.order("month"),
	]);

	const defaultTargetValue = (settings ?? []).find(
		(s) => s.key === "revenue_target_monthly",
	)?.value;
	const defaultTarget = defaultTargetValue ? Number(defaultTargetValue) : 50_000_000;

	return (
		<div className="space-y-6 max-w-3xl">
			<PageHeader title={t("title")} subtitle={t("hint")} />
			<SettingsEditor
				settings={settings ?? []}
				revenueTargets={revenueTargets ?? []}
				defaultRevenueTarget={defaultTarget}
			/>
		</div>
	);
}
