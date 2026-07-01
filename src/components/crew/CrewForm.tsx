"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { mapDbError } from "@/lib/utils";

type CrewRow = {
	id: string;
	name: string;
	phone: string | null;
	skills: string[] | null;
	daily_rate: number | null;
	availability_status: string | null;
	emergency_contact: string | null;
	notes: string | null;
	is_active: boolean;
};

const SKILL_OPTIONS: { value: string; tKey: string }[] = [
	{ value: "Loading", tKey: "loading" },
	{ value: "Unloading", tKey: "unloading" },
	{ value: "Packing", tKey: "packing" },
	{ value: "Assembly", tKey: "assembly" },
	{ value: "Driving", tKey: "driving" },
	{ value: "Supervision", tKey: "supervision" },
];
const AVAIL_OPTS: { value: string; tKey: string }[] = [
	{ value: "available", tKey: "available" },
	{ value: "on_job", tKey: "on_job" },
	{ value: "unavailable", tKey: "unavailable" },
];

/**
 * Create or edit a crew member.
 */
export function CrewForm({ member }: { member?: CrewRow }) {
	const router = useRouter();
	const t = useTranslations("forms.crew");
	const tButtons = useTranslations("common.buttons");
	const tActions = useTranslations("actions");
	const tErrors = useTranslations("common.errors");
	const tHints = useTranslations("common.hints");
	const tSkill = useTranslations("entity.skill");
	const tAvail = useTranslations("entity.availability");
	const isEdit = Boolean(member);

	const [form, setForm] = useState({
		name: member?.name ?? "",
		phone: member?.phone ?? "",
		skills: member?.skills ?? [],
		daily_rate: member?.daily_rate?.toString() ?? "",
		availability_status: member?.availability_status ?? "available",
		emergency_contact: member?.emergency_contact ?? "",
		notes: member?.notes ?? "",
		is_active: member?.is_active ?? true,
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function toggleSkill(s: string) {
		setForm((p) => ({
			...p,
			skills: p.skills.includes(s) ? p.skills.filter((x) => x !== s) : [...p.skills, s],
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
			phone: form.phone.trim() || null,
			skills: form.skills.length ? form.skills : null,
			daily_rate: form.daily_rate ? Number(form.daily_rate) : null,
			availability_status: form.availability_status,
			emergency_contact: form.emergency_contact.trim() || null,
			notes: form.notes.trim() || null,
			is_active: form.is_active,
		};

		const supabase = createClient();

		if (isEdit && member) {
			const { error: err } = await supabase.from("crew").update(payload).eq("id", member.id);
			if (err) {
				setError(mapDbError(err));
				setSaving(false);
				return;
			}
			router.push(`/crew/${member.id}`);
		} else {
			const { data, error: err } = await supabase
				.from("crew")
				.insert(payload)
				.select("id")
				.single();
			if (err || !data) {
				setError(mapDbError(err));
				setSaving(false);
				return;
			}
			router.push(`/crew/${data.id}`);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="max-w-lg space-y-5" noValidate autoComplete="off">
			{error && <FormError>{error}</FormError>}

			<Field label={t("name")} htmlFor="c-name" required>
				<Input
					id="c-name"
					type="text"
					required
					value={form.name}
					onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
				/>
			</Field>

			<div className="grid grid-cols-2 gap-4">
				<Field label={t("phone")} htmlFor="c-phone">
					<Input
						id="c-phone"
						type="tel"
						value={form.phone}
						onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
					/>
				</Field>
				<Field label={t("dailyRate")} htmlFor="c-rate" hint={tHints("idr")}>
					<NumericInput
						id="c-rate"
						value={Number(form.daily_rate) || 0}
						onChange={(v) => setForm((p) => ({ ...p, daily_rate: v > 0 ? String(v) : "" }))}
						className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
					/>
				</Field>
			</div>

			<div>
				<span className="block text-sm font-medium mb-2 text-ink">{t("skills")}</span>
				<fieldset
					aria-label={t("skills")}
					className="flex flex-wrap gap-2 border-none p-0 m-0 min-w-0"
				>
					{SKILL_OPTIONS.map((s) => (
						<label key={s.value} className="flex items-center gap-1.5 cursor-pointer select-none">
							<input
								type="checkbox"
								checked={form.skills.includes(s.value)}
								onChange={() => toggleSkill(s.value)}
								className="rounded border-line-strong text-primary focus-visible:ring-[var(--ring)]"
							/>
							<span className="text-sm text-ink">{tSkill(s.tKey)}</span>
						</label>
					))}
				</fieldset>
			</div>

			<Field label={t("availability")} htmlFor="c-avail">
				<Select
					id="c-avail"
					value={form.availability_status}
					onChange={(e) => setForm((p) => ({ ...p, availability_status: e.target.value }))}
				>
					{AVAIL_OPTS.map((o) => (
						<option key={o.value} value={o.value}>
							{tAvail(o.tKey)}
						</option>
					))}
				</Select>
			</Field>

			<Field label={t("emergencyContact")} htmlFor="c-emergency">
				<Input
					id="c-emergency"
					type="text"
					value={form.emergency_contact}
					onChange={(e) => setForm((p) => ({ ...p, emergency_contact: e.target.value }))}
					placeholder={t("emergencyPlaceholder")}
				/>
			</Field>

			<Field label={t("notes")} htmlFor="c-notes">
				<Textarea
					id="c-notes"
					rows={2}
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
					{saving
						? tButtons("saving")
						: isEdit
							? tButtons("saveChanges")
							: tActions("addCrewMember")}
				</Button>
				<Button type="button" variant="secondary" onClick={() => router.back()}>
					{tButtons("cancel")}
				</Button>
			</div>
		</form>
	);
}
