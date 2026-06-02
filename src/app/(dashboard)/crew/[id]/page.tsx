import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";
import { Badge, buttonStyles, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/utils";

export default async function CrewDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.crewDetail");
	const tCommon = await getTranslations("common.buttons");
	const tAvail = await getTranslations("entity.availability");

	const { data: member } = await supabase
		.from("crew")
		.select("id, name, phone, daily_rate, skills, availability_status, emergency_contact, notes")
		.eq("id", id)
		.single();
	if (!member) notFound();

	return (
		<div className="space-y-6 max-w-2xl">
			<PageHeader
				title={member.name}
				actions={
					<Link href={`/crew/${id}/edit`} className={buttonStyles({ variant: "secondary" })}>
						{tCommon("edit")}
					</Link>
				}
			/>

			<section className="rounded-xl border border-line bg-surface p-5 text-sm space-y-3 shadow-token">
				{member.phone && (
					<div className="flex items-center gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("phone")}</span>
						<span className="text-ink">{member.phone}</span>
						<WhatsAppButton
							phone={member.phone}
							message=""
							label="WhatsApp"
							className="py-1 px-2 text-xs"
						/>
					</div>
				)}
				{member.daily_rate && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("dailyRate")}</span>
						<span className="tabular-nums text-ink">{formatRupiah(member.daily_rate)}</span>
					</div>
				)}
				{member.skills && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("skills")}</span>
						<span className="text-ink">{(member.skills as string[]).join(", ")}</span>
					</div>
				)}
				<div className="flex items-center gap-4">
					<span className="w-36 text-ink-muted shrink-0">{t("availability")}</span>
					<Badge tone={availTone(member.availability_status)}>
						{tAvail((member.availability_status ?? "available") as never)}
					</Badge>
				</div>
				{member.emergency_contact && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("emergency")}</span>
						<span className="text-ink">{member.emergency_contact}</span>
					</div>
				)}
				{member.notes && (
					<div className="flex gap-4">
						<span className="w-36 text-ink-muted shrink-0">{t("notes")}</span>
						<span className="whitespace-pre-line text-ink">{member.notes}</span>
					</div>
				)}
			</section>
		</div>
	);
}

function availTone(status: string | null): "positive" | "pending" | "danger" | "neutral" {
	if (status === "available") return "positive";
	if (status === "on_job") return "pending";
	if (status === "unavailable") return "danger";
	return "neutral";
}
