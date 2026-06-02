import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { Badge, buttonStyles, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

export default async function FleetDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.fleetDetail");
	const tCommon = await getTranslations("common.buttons");
	const tLabels = await getTranslations("common.labels");

	const { data: fleet } = await supabase
		.from("fleet")
		.select(
			"id, name, phone, contact_person, vehicle_types, service_areas, bank_name, bank_account, notes, is_active",
		)
		.eq("id", id)
		.single();

	if (!fleet) notFound();

	return (
		<div className="space-y-6 max-w-2xl">
			<PageHeader
				title={fleet.name}
				subtitle={
					<Badge tone={fleet.is_active ? "positive" : "neutral"}>
						{fleet.is_active ? tLabels("active") : tLabels("inactive")}
					</Badge>
				}
				actions={
					<Link href={`/fleet/${id}/edit`} className={buttonStyles({ variant: "secondary" })}>
						{tCommon("edit")}
					</Link>
				}
			/>

			<section className="rounded-xl border border-line bg-surface p-5 text-sm space-y-3 shadow-token">
				{fleet.contact_person && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("contact")}</span>
						<span className="text-ink">{fleet.contact_person}</span>
					</div>
				)}
				{fleet.phone && (
					<div className="flex items-center gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("phone")}</span>
						<span className="text-ink">{fleet.phone}</span>
						<WhatsAppButton
							phone={fleet.phone}
							message=""
							label="WhatsApp"
							className="py-1 px-2 text-xs"
						/>
					</div>
				)}
				{fleet.vehicle_types && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("vehicles")}</span>
						<span className="text-ink">{(fleet.vehicle_types as string[]).join(", ")}</span>
					</div>
				)}
				{fleet.service_areas && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("serviceAreas")}</span>
						<span className="text-ink">{(fleet.service_areas as string[]).join(", ")}</span>
					</div>
				)}
				{fleet.bank_name && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("bank")}</span>
						<span className="text-ink">
							{fleet.bank_name} · {fleet.bank_account}
						</span>
					</div>
				)}
				{fleet.notes && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("notes")}</span>
						<span className="whitespace-pre-line text-ink">{fleet.notes}</span>
					</div>
				)}
			</section>
		</div>
	);
}
