import { getTranslations } from "next-intl/server";
import { CrewForm } from "@/components/crew/CrewForm";
import { PageHeader } from "@/components/ui";

export default async function NewCrewPage() {
	const t = await getTranslations("forms.crew");
	return (
		<div className="space-y-6">
			<PageHeader title={t("newTitle")} />
			<CrewForm />
		</div>
	);
}
