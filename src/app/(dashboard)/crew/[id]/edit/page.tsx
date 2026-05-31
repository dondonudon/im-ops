import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CrewForm } from "@/components/crew/CrewForm";

export default async function EditCrewPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("forms.crew");
	const { data: member } = await supabase
		.from("crew")
		.select("*")
		.eq("id", id)
		.single();
	if (!member) notFound();

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
				{t("editTitle")}
			</h1>
			<CrewForm member={member as Parameters<typeof CrewForm>[0]["member"]} />
		</div>
	);
}
