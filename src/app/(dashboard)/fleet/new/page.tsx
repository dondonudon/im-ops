import { getTranslations } from "next-intl/server";
import { FleetForm } from "@/components/fleet/FleetForm";
import { PageHeader } from "@/components/ui";

export default async function NewFleetPage() {
	const t = await getTranslations("forms.fleet");
	return (
		<div className="space-y-6">
			<PageHeader title={t("newTitle")} />
			<FleetForm />
		</div>
	);
}
