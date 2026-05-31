import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WhatsAppButton } from "@/components/shared/WhatsAppButton";

export default async function VendorDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("pages.vendorDetail");
	const tCommon = await getTranslations("common.buttons");
	const tLabels = await getTranslations("common.labels");

	const { data: vendor } = await supabase
		.from("vendors")
		.select("*")
		.eq("id", id)
		.single();

	if (!vendor) notFound();

	return (
		<div className="space-y-6 max-w-2xl">
			<div className="flex items-start justify-between flex-wrap gap-4">
				<div>
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
						{vendor.name}
					</h1>
					<span
						className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${vendor.is_active ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600"}`}
					>
						{vendor.is_active ? tLabels("active") : tLabels("inactive")}
					</span>
				</div>
				<Link
					href={`/vendors/${id}/edit`}
					className="rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
				>
					{tCommon("edit")}
				</Link>
			</div>

			<section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 text-sm space-y-3">
				{vendor.contact_person && (
					<div className="flex gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("contact")}</span>
						<span>{vendor.contact_person}</span>
					</div>
				)}
				{vendor.phone && (
					<div className="flex items-center gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("phone")}</span>
						<span>{vendor.phone}</span>
						<WhatsAppButton
							phone={vendor.phone}
							message=""
							label="WhatsApp"
							className="py-1 px-2 text-xs"
						/>
					</div>
				)}
				{vendor.vehicle_types && (
					<div className="flex gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("vehicles")}</span>
						<span>{(vendor.vehicle_types as string[]).join(", ")}</span>
					</div>
				)}
				{vendor.service_areas && (
					<div className="flex gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("serviceAreas")}</span>
						<span>{(vendor.service_areas as string[]).join(", ")}</span>
					</div>
				)}
				{vendor.bank_name && (
					<div className="flex gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("bank")}</span>
						<span>
							{vendor.bank_name} · {vendor.bank_account}
						</span>
					</div>
				)}
				{vendor.notes && (
					<div className="flex gap-4">
						<span className="w-36 text-gray-500 shrink-0">{t("notes")}</span>
						<span className="whitespace-pre-line">{vendor.notes}</span>
					</div>
				)}
			</section>
		</div>
	);
}
