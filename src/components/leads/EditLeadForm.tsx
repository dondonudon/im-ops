"use client";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AddressListInput, emptyLocation } from "@/components/shared/AddressListInput";
import type { LocationValue } from "@/components/shared/LocationInput";
import {
	Button,
	buttonStyles,
	Card,
	Field,
	FormError,
	Input,
	Select,
	Textarea,
} from "@/components/ui";
import { replaceLeadAddresses } from "@/lib/leadAddresses";
import { createClient } from "@/lib/supabase/client";

const LEAD_TYPES = ["whatsapp", "onsite", "returning", "corporate"] as const;
const CHANNELS = ["whatsapp", "call", "referral", "walkin"] as const;

export type InitialLeadData = {
	id: string;
	customer_name: string;
	preferred_date: string | null;
	lead_type: string;
	origin_channel: string;
	notes: string | null;
	pickups: LocationValue[];
	destinations: LocationValue[];
};

export function EditLeadForm({ lead }: { lead: InitialLeadData }) {
	const router = useRouter();
	const t = useTranslations("forms.lead");
	const tButtons = useTranslations("common.buttons");
	const tJob = useTranslations("forms.job");
	const tLeadType = useTranslations("entity.leadType");
	const tChannel = useTranslations("entity.originChannel");

	const [form, setForm] = useState({
		preferred_date: lead.preferred_date ?? "",
		lead_type: lead.lead_type ?? "whatsapp",
		origin_channel: lead.origin_channel ?? "whatsapp",
		notes: lead.notes ?? "",
	});
	const [pickups, setPickups] = useState<LocationValue[]>(
		lead.pickups.length > 0 ? lead.pickups : [{ ...emptyLocation }],
	);
	const [destinations, setDestinations] = useState<LocationValue[]>(
		lead.destinations.length > 0 ? lead.destinations : [{ ...emptyLocation }],
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function handleChange(
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
	) {
		setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSaving(true);
		try {
			const supabase = createClient();
			const { error: err } = await supabase
				.from("leads")
				.update({
					preferred_date: form.preferred_date || null,
					lead_type: form.lead_type as (typeof LEAD_TYPES)[number],
					origin_channel: form.origin_channel as (typeof CHANNELS)[number],
					notes: form.notes.trim() || null,
				})
				.eq("id", lead.id);
			if (err) throw err;
			await replaceLeadAddresses(supabase, lead.id, pickups, destinations);
			router.push(`/leads/${lead.id}`);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Save failed.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="max-w-lg mx-auto space-y-5">
			<Link
				href={`/leads/${lead.id}`}
				className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
			>
				<ArrowLeft size={15} aria-hidden="true" />
				{tJob("backToLead")}
			</Link>

			<Card className="p-6">
				<h1 className="text-xl font-bold text-ink mb-1">{t("editTitle")}</h1>
				{lead.customer_name && (
					<p className="text-sm text-ink-muted mb-5">
						{t("customer")}: <span className="font-medium text-ink">{lead.customer_name}</span>
					</p>
				)}

				{error && <FormError>{error}</FormError>}

				<form onSubmit={handleSubmit} className="space-y-4 mt-4" noValidate autoComplete="off">
					<Field label={t("pickup")}>
						<AddressListInput
							values={pickups}
							onChange={setPickups}
							idPrefix="pickup"
							itemLabel={t("pickupLabel")}
							addLabel={t("addPickup")}
							removeLabel={t("removeAddress")}
							placeholder="Search pickup address…"
						/>
					</Field>

					<Field label={t("destination")}>
						<AddressListInput
							values={destinations}
							onChange={setDestinations}
							idPrefix="destination"
							itemLabel={t("destinationLabel")}
							addLabel={t("addDestination")}
							removeLabel={t("removeAddress")}
							placeholder="Search destination address…"
						/>
					</Field>

					<Field label={t("preferredDate")} htmlFor="preferred_date">
						<Input
							id="preferred_date"
							name="preferred_date"
							type="date"
							value={form.preferred_date}
							onChange={handleChange}
						/>
					</Field>

					<div className="grid grid-cols-2 gap-3">
						<Field label={t("leadType")} htmlFor="lead_type">
							<Select
								id="lead_type"
								name="lead_type"
								value={form.lead_type}
								onChange={handleChange}
							>
								{LEAD_TYPES.map((v) => (
									<option key={v} value={v}>
										{tLeadType(v)}
									</option>
								))}
							</Select>
						</Field>
						<Field label={t("originChannel")} htmlFor="origin_channel">
							<Select
								id="origin_channel"
								name="origin_channel"
								value={form.origin_channel}
								onChange={handleChange}
							>
								{CHANNELS.map((v) => (
									<option key={v} value={v}>
										{tChannel(v)}
									</option>
								))}
							</Select>
						</Field>
					</div>

					<Field label={t("notes")} htmlFor="notes">
						<Textarea
							id="notes"
							name="notes"
							value={form.notes}
							onChange={handleChange}
							rows={4}
							className="resize-none"
						/>
					</Field>

					<div className="flex gap-3 pt-1">
						<Link
							href={`/leads/${lead.id}`}
							className={buttonStyles({
								variant: "secondary",
								size: "md",
								className: "flex-1 justify-center",
							})}
						>
							{tButtons("cancel")}
						</Link>
						<Button type="submit" loading={saving} variant="primary" size="md" className="flex-1">
							{saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
							{saving ? tButtons("saving") : tButtons("saveChanges")}
						</Button>
					</div>
				</form>
			</Card>
		</div>
	);
}
