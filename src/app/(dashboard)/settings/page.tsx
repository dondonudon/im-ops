import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { SettingsEditor } from "@/components/settings/SettingsEditor";
import { PageHeader } from "@/components/ui";

export default async function SettingsPage() {
	const supabase = await createClient();
	const t = await getTranslations("pages.settings");

	const { data: settings } = await supabase
		.from("system_settings")
		.select("key, value, category, description")
		.order("category")
		.order("key");

	return (
		<div className="space-y-6 max-w-3xl">
			<PageHeader title={t("title")} subtitle={t("hint")} />
			<SettingsEditor settings={settings ?? []} />
		</div>
	);
}
