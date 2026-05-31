import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatRupiah } from "@/lib/utils";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";

export default async function CrewDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.crewDetail");
	const tCommon = await getTranslations("common.buttons");
	const tAvail = await getTranslations("entity.availability");

	const { data: member } = await supabase
		.from("crew")
		.select("*")
		.eq("id", id)
		.single();
	if (!member) notFound();

	return (
		<div className="space-y-6 max-w-2xl">
			<div className="flex items-start justify-between flex-wrap gap-4">
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
					{member.name}
				</h1>
				<Link
					href={`/crew/${id}/edit`}
					className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
				>
					{tCommon("edit")}
				</Link>
			</div>

			<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 text-sm space-y-3">
				{member.phone && (
					<div className="flex items-center gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("phone")}</span>
						<span>{member.phone}</span>
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
						<span className="w-36 text-gray-500 shrink-0">{t("dailyRate")}</span>
						<span className="tabular-nums">
							{formatRupiah(member.daily_rate)}
						</span>
					</div>
				)}
				{member.skills && (
					<div className="flex gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("skills")}</span>
						<span>{(member.skills as string[]).join(", ")}</span>
					</div>
				)}
				<div className="flex gap-4">
					<span className="w-36 text-gray-500 shrink-0">{t("availability")}</span>
					<span>{tAvail((member.availability_status ?? "available") as never)}</span>
				</div>
				{member.emergency_contact && (
					<div className="flex gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("emergency")}</span>
						<span>{member.emergency_contact}</span>
					</div>
				)}
				{member.notes && (
					<div className="flex gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("notes")}</span>
						<span className="whitespace-pre-line">{member.notes}</span>
					</div>
				)}
			</section>
		</div>
	);
}
