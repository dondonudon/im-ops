"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { Button, Field, FormError, Input, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type FleetRow = {
	id: string;
	name: string;
	contact_person: string | null;
	phone: string | null;
	vehicle_types: string[] | null;
	service_areas: string[] | null;
	bank_name: string | null;
	bank_account: string | null;
	notes: string | null;
	is_active: boolean;
};

const VEHICLE_OPTIONS: { value: string; tKey: string }[] = [
	{ value: "Box Small", tKey: "box_small" },
	{ value: "Box Medium", tKey: "box_medium" },
	{ value: "Box Large", tKey: "box_large" },
	{ value: "Truck L300", tKey: "truck_l300" },
	{ value: "Fuso", tKey: "fuso" },
	{ value: "CDE", tKey: "cde" },
	{ value: "CDD", tKey: "cdd" },
	{ value: "Wingbox", tKey: "wingbox" },
];

/**
 * Create or edit a fleet member.
 * @param fleet - existing fleet data for edit mode; omit for create mode
 */
export function FleetForm({ fleet }: { fleet?: FleetRow }) {
	const router = useRouter();
	const t = useTranslations("forms.fleet");
	const tButtons = useTranslations("common.buttons");
	const tActions = useTranslations("actions");
	const tErrors = useTranslations("common.errors");
	const tHints = useTranslations("common.hints");
	const tVehicleType = useTranslations("entity.vehicleType");
	const isEdit = Boolean(fleet);

	const [form, setForm] = useState({
		name: fleet?.name ?? "",
		contact_person: fleet?.contact_person ?? "",
		phone: fleet?.phone ?? "",
		vehicle_types: fleet?.vehicle_types ?? [],
		service_areas: fleet?.service_areas?.join(", ") ?? "",
		bank_name: fleet?.bank_name ?? "",
		bank_account: fleet?.bank_account ?? "",
		notes: fleet?.notes ?? "",
		is_active: fleet?.is_active ?? true,
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function toggleVehicle(v: string) {
		setForm((p) => ({
			...p,
			vehicle_types: p.vehicle_types.includes(v)
				? p.vehicle_types.filter((x) => x !== v)
				: [...p.vehicle_types, v],
		}));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.name.trim()) {
			setError(tErrors("nameRequired"));
			return;
		}
		setSaving(true);
		setError(null);

		const payload = {
			name: form.name.trim(),
			contact_person: form.contact_person.trim() || null,
			phone: form.phone.trim() || null,
			vehicle_types: form.vehicle_types.length ? form.vehicle_types : [],
			service_areas: form.service_areas.trim()
				? form.service_areas
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean)
				: [],
			bank_name: form.bank_name.trim() || null,
			bank_account: form.bank_account.trim() || null,
			notes: form.notes.trim() || null,
			is_active: form.is_active,
		};

		const supabase = createClient();

		if (isEdit && fleet) {
			const { error: err } = await supabase.from("fleet").update(payload).eq("id", fleet.id);
			if (err) {
				setError(err.message);
				setSaving(false);
				return;
			}
			router.push(`/fleet/${fleet.id}`);
		} else {
			const { data, error: err } = await supabase
				.from("fleet")
				.insert(payload)
				.select("id")
				.single();
			if (err || !data) {
				setError(err?.message ?? "Error");
				setSaving(false);
				return;
			}
			router.push(`/fleet/${data.id}`);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="max-w-lg space-y-5" noValidate>
			{error && <FormError>{error}</FormError>}

			<Field label={t("name")} htmlFor="v-name" required>
				<Input
					id="v-name"
					type="text"
					required
					value={form.name}
					onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
				/>
			</Field>

			<div className="grid grid-cols-2 gap-4">
				<Field label={t("contactPerson")} htmlFor="v-contact">
					<Input
						id="v-contact"
						type="text"
						value={form.contact_person}
						onChange={(e) => setForm((p) => ({ ...p, contact_person: e.target.value }))}
					/>
				</Field>
				<Field label={t("phone")} htmlFor="v-phone">
					<Input
						id="v-phone"
						type="tel"
						value={form.phone}
						onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
					/>
				</Field>
			</div>

			<div>
				<span className="block text-sm font-medium mb-2 text-ink">{t("vehicleTypes")}</span>
				<div role="group" aria-label={t("vehicleTypes")} className="flex flex-wrap gap-2">
					{VEHICLE_OPTIONS.map((v) => (
						<label key={v.value} className="flex items-center gap-1.5 cursor-pointer select-none">
							<input
								type="checkbox"
								checked={form.vehicle_types.includes(v.value)}
								onChange={() => toggleVehicle(v.value)}
								className="rounded border-line-strong text-primary focus-visible:ring-[var(--ring)]"
							/>
							<span className="text-sm text-ink">{tVehicleType(v.tKey)}</span>
						</label>
					))}
				</div>
			</div>

			<Field label={t("serviceAreas")} htmlFor="v-areas" hint={tHints("commaSeparated")}>
				<Input
					id="v-areas"
					type="text"
					value={form.service_areas}
					onChange={(e) => setForm((p) => ({ ...p, service_areas: e.target.value }))}
					placeholder="Jakarta, Bekasi, Tangerang"
				/>
			</Field>

			<div className="grid grid-cols-2 gap-4">
				<Field label={t("bankName")} htmlFor="v-bank">
					<Input
						id="v-bank"
						type="text"
						value={form.bank_name}
						onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))}
					/>
				</Field>
				<Field label={t("bankAccount")} htmlFor="v-account">
					<Input
						id="v-account"
						type="text"
						value={form.bank_account}
						onChange={(e) => setForm((p) => ({ ...p, bank_account: e.target.value }))}
					/>
				</Field>
			</div>

			<Field label={t("notes")} htmlFor="v-notes">
				<Textarea
					id="v-notes"
					rows={3}
					value={form.notes}
					onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
				/>
			</Field>

			<label className="flex items-center gap-2 cursor-pointer">
				<input
					type="checkbox"
					checked={form.is_active}
					onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
					className="rounded border-line-strong text-primary focus-visible:ring-[var(--ring)]"
				/>
				<span className="text-sm text-ink">{t("active")}</span>
			</label>

			<div className="flex gap-3 pt-2">
				<Button type="submit" loading={saving}>
					{saving ? tButtons("saving") : isEdit ? tButtons("saveChanges") : tActions("addFleet")}
				</Button>
				<Button type="button" variant="secondary" onClick={() => router.back()}>
					{tButtons("cancel")}
				</Button>
			</div>
		</form>
	);
}
