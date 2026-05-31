import { getTranslations } from "next-intl/server";
import { CrewForm } from "@/components/crew/CrewForm";

export default async function NewCrewPage() {
	const t = await getTranslations("forms.crew");
	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
				{t("newTitle")}
			</h1>
			<CrewForm />
		</div>
	);
}
