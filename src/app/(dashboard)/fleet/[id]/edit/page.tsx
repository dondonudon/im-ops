import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FleetForm } from "@/components/fleet/FleetForm";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function EditFleetPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("forms.fleet");
	const { data: fleet } = await supabase.from("fleet").select("*").eq("id", id).single();
	if (!fleet) notFound();

	return (
		<div className="space-y-6">
			<PageHeader title={t("editTitle")} />
			<FleetForm fleet={fleet as Parameters<typeof FleetForm>[0]["fleet"]} />
		</div>
	);
}
