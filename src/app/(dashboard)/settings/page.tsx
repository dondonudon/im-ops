import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { SettingsEditor } from "@/components/settings/SettingsEditor";

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
			<div>
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
					{t("title")}
				</h1>
				<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
					{t("hint")}
				</p>
			</div>
			<SettingsEditor settings={settings ?? []} />
		</div>
	);
}
