"use client";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { LocationInput, type LocationValue } from "@/components/shared/LocationInput";
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
import { createClient } from "@/lib/supabase/client";

const LEAD_TYPES = ["whatsapp", "onsite", "returning", "corporate"] as const;
const CHANNELS = ["whatsapp", "call", "referral", "walkin"] as const;

/**
 * Lead edit form — loads existing lead and updates it on submit.
 * Customer is not changeable after creation.
 */
export default function EditLeadPage({ params }: { params: { id: string } }) {
	const { id } = params;
	const router = useRouter();
	const t = useTranslations("forms.lead");
	const tButtons = useTranslations("common.buttons");
	const tJob = useTranslations("forms.job");
	const tLeadType = useTranslations("entity.leadType");
	const tChannel = useTranslations("entity.originChannel");

	const [form, setForm] = useState({
		preferred_date: "",
		lead_type: "whatsapp",
		origin_channel: "whatsapp",
		notes: "",
	});
	const [pickup, setPickup] = useState<LocationValue>({ address: "", lat: null, lng: null });
	const [destination, setDestination] = useState<LocationValue>({
		address: "",
		lat: null,
		lng: null,
	});
	const [destination2, setDestination2] = useState<LocationValue>({
		address: "",
		lat: null,
		lng: null,
	});
	const [customerName, setCustomerName] = useState("");
	const [showDestination2, setShowDestination2] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const supabase = createClient();
		supabase
			.from("leads")
			.select("*, customers(name)")
			.eq("id", id)
			.single()
			.then(({ data, error: err }) => {
				if (err || !data) {
					setError("Lead not found.");
					setLoading(false);
					return;
				}
				const c = data.customers as { name: string } | null;
				setCustomerName(c?.name ?? "");
				const dest2Addr = data.destination_address_2 ?? "";
				setForm({
					preferred_date: data.preferred_date ?? "",
					lead_type: data.lead_type ?? "whatsapp",
					origin_channel: data.origin_channel ?? "whatsapp",
					notes: data.notes ?? "",
				});
				setPickup({
					address: data.pickup_address ?? "",
					lat: data.pickup_lat ?? null,
					lng: data.pickup_lng ?? null,
				});
				setDestination({
					address: data.destination_address ?? "",
					lat: data.destination_lat ?? null,
					lng: data.destination_lng ?? null,
				});
				setDestination2({
					address: dest2Addr,
					lat: data.destination_2_lat ?? null,
					lng: data.destination_2_lng ?? null,
				});
				if (dest2Addr) setShowDestination2(true);
				setLoading(false);
			});
	}, [id]);

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
					pickup_address: pickup.address.trim() || null,
					pickup_lat: pickup.lat,
					pickup_lng: pickup.lng,
					destination_address: destination.address.trim() || null,
					destination_lat: destination.lat,
					destination_lng: destination.lng,
					destination_address_2: destination2.address.trim() || null,
					destination_2_lat: destination2.lat,
					destination_2_lng: destination2.lng,
					preferred_date: form.preferred_date || null,
					lead_type: form.lead_type as (typeof LEAD_TYPES)[number],
					origin_channel: form.origin_channel as (typeof CHANNELS)[number],
					notes: form.notes.trim() || null,
				})
				.eq("id", id);
			if (err) throw err;
			router.push(`/leads/${id}`);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Save failed.");
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center h-40 text-ink-faint">
				<Loader2 size={20} className="animate-spin" aria-hidden="true" />
			</div>
		);
	}

	return (
		<div className="max-w-lg mx-auto space-y-5">
			<Link
				href={`/leads/${id}`}
				className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
			>
				<ArrowLeft size={15} aria-hidden="true" />
				{tJob("backToLead")}
			</Link>

			<Card className="p-6">
				<h1 className="text-xl font-bold text-ink mb-1">{t("editTitle")}</h1>
				{customerName && (
					<p className="text-sm text-ink-muted mb-5">
						{t("customer")}: <span className="font-medium text-ink">{customerName}</span>
					</p>
				)}

				{error && <FormError>{error}</FormError>}

				<form onSubmit={handleSubmit} className="space-y-4 mt-4" noValidate autoComplete="off">
					{/* Pickup address */}
					<Field label={t("pickup")} htmlFor="pickup_address">
						<LocationInput
							id="pickup_address"
							value={pickup}
							onChange={setPickup}
							placeholder="Search pickup address…"
						/>
					</Field>

					{/* Destination address */}
					<Field label={t("destination")} htmlFor="destination_address">
						<LocationInput
							id="destination_address"
							value={destination}
							onChange={setDestination}
							placeholder="Search destination address…"
						/>
					</Field>

					{showDestination2 ? (
						<Field label={t("destination2")} htmlFor="destination_address_2">
							<LocationInput
								id="destination_address_2"
								value={destination2}
								onChange={setDestination2}
								placeholder="Search second destination…"
							/>
							<button
								type="button"
								onClick={() => {
									setShowDestination2(false);
									setDestination2({ address: "", lat: null, lng: null });
								}}
								className="mt-1 text-xs text-ink-faint hover:text-danger transition-colors"
							>
								{t("removeDestination2")}
							</button>
						</Field>
					) : (
						<button
							type="button"
							onClick={() => setShowDestination2(true)}
							className="text-sm text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
						>
							+ {t("addDestination2")}
						</button>
					)}

					{/* Preferred date */}
					<Field label={t("preferredDate")} htmlFor="preferred_date">
						<Input
							id="preferred_date"
							name="preferred_date"
							type="date"
							value={form.preferred_date}
							onChange={handleChange}
						/>
					</Field>

					{/* Lead type + Channel */}
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

					{/* Notes */}
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

					{/* Actions */}
					<div className="flex gap-3 pt-1">
						<Link
							href={`/leads/${id}`}
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
