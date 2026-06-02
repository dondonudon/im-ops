"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useMemo, useState } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Button, Field, FormError, Input } from "@/components/ui";
import {
	calculate,
	ENGINE_VERSION,
	type EstimationInputs,
	type EstimationSettings,
	parseSettings,
} from "@/lib/estimation/engine";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah } from "@/lib/utils";

type SettingRow = { key: string; value: string };

/**
 * Estimation form — inputs on the left, live breakdown on the right.
 * Recalculates on every change (client-side, no API call).
 */
export function EstimationForm({
	proposalId,
	settingRows,
	existing,
}: {
	proposalId: string;
	settingRows: SettingRow[];
	existing?: {
		id: string;
		inputs: EstimationInputs;
		overrides: { final_price?: number; override_reason?: string } | null;
	};
}) {
	const router = useRouter();
	const t = useTranslations("forms.estimation");
	const tVehicle = useTranslations("entity.vehicleType");
	const tBreakdown = useTranslations("pages.proposalDetail.breakdown");
	const tEstBreakdown = useTranslations("forms.estimation.breakdown");
	const tButtons = useTranslations("common.buttons");
	const tErrors = useTranslations("common.errors");
	const settings: EstimationSettings = useMemo(() => parseSettings(settingRows), [settingRows]);

	const defaultInputs: EstimationInputs = {
		vehicle_type: "box_truck",
		vehicle_cost: settings.vehicle_rate_box_truck,
		crew_count: 3,
		crew_day_rate: settings.crew_day_rate,
		food_per_crew: settings.food_per_crew,
		packing_cost: 0,
		toll_estimate: 0,
		other_cost: 0,
		is_out_of_town: false,
		meals_count: 3,
	};

	const [inputs, setInputs] = useState<EstimationInputs>(() => {
		if (!existing?.inputs) return defaultInputs;
		const saved = existing.inputs;
		// Back-fill new fields for estimations saved before engine 2.2.0
		return {
			...saved,
			vehicle_cost:
				saved.vehicle_cost ??
				(settings[`vehicle_rate_${saved.vehicle_type}` as keyof EstimationSettings] as number),
			crew_day_rate: saved.crew_day_rate ?? settings.crew_day_rate,
			food_per_crew: saved.food_per_crew ?? settings.food_per_crew,
			packing_cost: saved.packing_cost ?? 0,
		};
	});

	const [overridePrice, setOverridePrice] = useState<number>(existing?.overrides?.final_price ?? 0);
	const [overrideReason, setOverrideReason] = useState<string>(
		existing?.overrides?.override_reason ?? "",
	);

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const outputs = useMemo(() => calculate(inputs, settings), [inputs, settings]);
	const finalPrice = overridePrice > 0 ? overridePrice : outputs.initial_offer_price;

	function setInput<K extends keyof EstimationInputs>(key: K, value: EstimationInputs[K]) {
		setInputs((prev) => ({ ...prev, [key]: value }));
	}

	function handleVehicleTypeChange(v: (typeof inputs)["vehicle_type"]) {
		setInputs((prev) => ({
			...prev,
			vehicle_type: v,
			vehicle_cost: settings[`vehicle_rate_${v}` as keyof EstimationSettings] as number,
		}));
	}

	async function handleSave() {
		setSaving(true);
		setError(null);

		try {
			const supabase = createClient();
			const settingsSnapshot = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
			const overrides =
				overridePrice > 0
					? {
							final_price: overridePrice,
							override_reason: overrideReason.trim() || null,
						}
					: null;

			const payload = {
				proposal_id: proposalId,
				engine_version: ENGINE_VERSION,
				inputs: inputs as unknown as import("@/lib/supabase/types").Json,
				settings_snapshot: settingsSnapshot as unknown as import("@/lib/supabase/types").Json,
				outputs: outputs as unknown as import("@/lib/supabase/types").Json,
				overrides: overrides as unknown as import("@/lib/supabase/types").Json | null,
			};

			if (existing) {
				const { error: err } = await supabase
					.from("estimations")
					.update({ ...payload, updated_at: new Date().toISOString() })
					.eq("id", existing.id);
				if (err) throw err;
			} else {
				const { data, error: err } = await supabase
					.from("estimations")
					.insert(payload)
					.select("id")
					.single();
				if (err || !data) throw err ?? new Error("Insert failed");
			}

			// Update proposal final_price
			await supabase.from("proposals").update({ final_price: finalPrice }).eq("id", proposalId);

			router.push(`/proposals/${proposalId}`);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : tErrors("saveFailed"));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
			{/* ── INPUTS ── */}
			<div className="space-y-5">
				<h2 className="text-lg font-semibold text-ink">{t("inputs")}</h2>

				{error && <FormError>{error}</FormError>}

				{/* Vehicle type */}
				<div>
					<fieldset>
						<legend className="block text-sm font-medium text-ink mb-2">{t("vehicleType")}</legend>
						<div className="flex flex-wrap gap-2">
							{(["pickup", "box_truck"] as const).map((v) => (
								<label key={v} className="cursor-pointer">
									<input
										type="radio"
										name="vehicle_type"
										value={v}
										checked={inputs.vehicle_type === v}
										onChange={() => handleVehicleTypeChange(v)}
										className="sr-only"
									/>
									<span
										className={`inline-block rounded-lg border px-4 py-2 text-sm font-medium transition-colors select-none ${
											inputs.vehicle_type === v
												? "border-primary bg-primary-subtle text-primary-text"
												: "border-line text-ink-muted hover:bg-subtle"
										}`}
									>
										{tVehicle(v)}
									</span>
								</label>
							))}
						</div>
					</fieldset>
				</div>

				{/* Vehicle cost */}
				<Field label={`${t("vehicleCost")} (IDR)`} htmlFor="vehicle_cost">
					<NumericInput
						id="vehicle_cost"
						value={inputs.vehicle_cost}
						onChange={(v) => setInput("vehicle_cost", v)}
						className="w-full max-w-xs rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					/>
				</Field>

				{/* Crew */}
				<Field label={t("crewCount")} htmlFor="crew_count">
					<NumericInput
						id="crew_count"
						value={inputs.crew_count}
						onChange={(v) => setInput("crew_count", Math.max(1, v || 1))}
						className="w-32 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					/>
				</Field>

				{/* Crew day rate */}
				<Field label={`${t("crewDayRate")} (IDR)`} htmlFor="crew_day_rate">
					<NumericInput
						id="crew_day_rate"
						value={inputs.crew_day_rate}
						onChange={(v) => setInput("crew_day_rate", v)}
						className="w-full max-w-xs rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					/>
				</Field>

				{/* Food per crew */}
				<Field label={`${t("foodPerCrew")} (IDR)`} htmlFor="food_per_crew">
					<NumericInput
						id="food_per_crew"
						value={inputs.food_per_crew}
						onChange={(v) => setInput("food_per_crew", v)}
						className="w-full max-w-xs rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					/>
				</Field>

				{/* Out of town */}
				<div className="flex items-center gap-3">
					<input
						id="is_out_of_town"
						type="checkbox"
						checked={inputs.is_out_of_town}
						onChange={(e) => setInput("is_out_of_town", e.target.checked)}
						className="h-4 w-4 rounded border-line-strong text-primary focus:ring-[var(--ring)]"
					/>
					<label htmlFor="is_out_of_town" className="text-sm text-ink-muted">
						{t("outOfTown")} {t("outOfTownHint", { meals: inputs.meals_count })}
					</label>
				</div>

				{inputs.is_out_of_town && (
					<Field label={t("mealsCount")} htmlFor="meals_count">
						<NumericInput
							id="meals_count"
							value={inputs.meals_count}
							onChange={(v) => setInput("meals_count", Math.max(1, v || 1))}
							className="w-32 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
						/>
					</Field>
				)}

				{/* Packing materials */}
				<Field label={`${t("packingCost")} (IDR)`} htmlFor="packing_cost">
					<NumericInput
						id="packing_cost"
						value={inputs.packing_cost}
						onChange={(v) => setInput("packing_cost", v)}
						className="w-full max-w-xs rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					/>
				</Field>

				{/* Toll */}
				<Field label={`${t("tollEstimate")} (IDR)`} htmlFor="toll_estimate">
					<NumericInput
						id="toll_estimate"
						value={inputs.toll_estimate}
						onChange={(v) => setInput("toll_estimate", v)}
						className="w-full max-w-xs rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					/>
				</Field>

				{/* Other */}
				<Field label={`${t("otherCost")} (IDR)`} htmlFor="other_cost">
					<NumericInput
						id="other_cost"
						value={inputs.other_cost}
						onChange={(v) => setInput("other_cost", v)}
						className="w-full max-w-xs rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
					/>
				</Field>

				{/* Override */}
				<div className="rounded-xl border border-warning bg-warning-bg p-4 space-y-3">
					<p className="text-sm font-medium text-warning-text">{t("manualOverride")}</p>
					<Field label={`${t("overridePrice")} (IDR)`} htmlFor="override_price">
						<NumericInput
							id="override_price"
							value={overridePrice}
							onChange={(v) => setOverridePrice(v)}
							placeholder={new Intl.NumberFormat("id-ID").format(outputs.initial_offer_price)}
							className="w-full rounded-lg border border-warning bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
						/>
					</Field>
					{overridePrice > 0 && (
						<Field
							label={
								<>
									{t("overrideReason")}{" "}
									<span aria-hidden="true" className="text-danger">
										*
									</span>
								</>
							}
							htmlFor="override_reason"
						>
							<Input
								id="override_reason"
								type="text"
								value={overrideReason}
								onChange={(e) => setOverrideReason(e.target.value)}
								className="border-warning"
							/>
						</Field>
					)}
				</div>

				<Button
					type="button"
					onClick={handleSave}
					disabled={saving || (overridePrice > 0 && !overrideReason.trim())}
					loading={saving}
					size="md"
				>
					{saving ? tButtons("saving") : t("saveEstimation")}
				</Button>
			</div>

			{/* ── LIVE BREAKDOWN ── */}
			<div className="space-y-4">
				<h2 className="text-lg font-semibold text-ink">{t("breakdownTitle")}</h2>
				<div className="rounded-xl border border-line bg-surface overflow-hidden">
					<table className="w-full text-sm">
						<tbody className="divide-y divide-line">
							<BreakdownRow label={tBreakdown("vehicle")} value={outputs.vehicle_cost} />
							<BreakdownRow
								label={`${tBreakdown("manpower")} (${outputs.effective_crew_count} ${tBreakdown("crew").toLowerCase()})`}
								value={outputs.manpower_cost}
							/>
							<BreakdownRow label={tBreakdown("food")} value={outputs.food_cost} />
							{inputs.packing_cost > 0 && (
								<BreakdownRow label={tBreakdown("packing")} value={outputs.packing_cost} />
							)}
							{inputs.toll_estimate > 0 && (
								<BreakdownRow label={tBreakdown("toll")} value={outputs.toll_cost} />
							)}
							{inputs.other_cost > 0 && (
								<BreakdownRow label={tEstBreakdown("other")} value={outputs.other_cost} />
							)}
							<BreakdownRow label={tEstBreakdown("jobCost")} value={outputs.job_cost} bold />
							<BreakdownRow
								label={`${tBreakdown("operationalBuffer")} (${settings.operational_buffer_pct}%)`}
								value={outputs.operational_buffer}
								muted
							/>
							<BreakdownRow label={tBreakdown("adjustedCost")} value={outputs.adjusted_cost} bold />
							<BreakdownRow
								label={tEstBreakdown("margin", {
									pct: outputs.margin_pct.toFixed(0),
								})}
								value={outputs.margin_profit}
								muted
							/>
							<BreakdownRow
								label={tEstBreakdown("minimumProfitFloor")}
								value={outputs.minimum_profit}
								muted
							/>
							<BreakdownRow label={tBreakdown("finalProfit")} value={outputs.final_profit} />
							<BreakdownRow
								label={tBreakdown("internalTarget")}
								value={outputs.internal_target_price}
								bold
							/>
							<BreakdownRow
								label={tEstBreakdown("negotiationBuffer", {
									pct: settings.negotiation_buffer_pct,
								})}
								value={outputs.initial_offer_price - outputs.internal_target_price}
								muted
							/>
						</tbody>
						<tfoot>
							<tr className="bg-primary">
								<td className="px-4 py-3 text-sm font-bold text-primary-fg">
									{overridePrice ? t("overridePriceLabel") : tBreakdown("offerPrice")}
								</td>
								<td className="px-4 py-3 text-sm font-bold text-primary-fg text-right">
									{formatRupiah(finalPrice)}
								</td>
							</tr>
						</tfoot>
					</table>
				</div>
				<p className="text-xs text-ink-faint">{t("engineFooter", { version: ENGINE_VERSION })}</p>
			</div>
		</div>
	);
}

function BreakdownRow({
	label,
	value,
	bold,
	muted,
}: {
	label: string;
	value: number;
	bold?: boolean;
	muted?: boolean;
}) {
	return (
		<tr>
			<td
				className={`px-4 py-2 ${muted ? "text-ink-faint" : ""} ${bold ? "font-semibold text-ink" : "text-ink-muted"}`}
			>
				{label}
			</td>
			<td
				className={`px-4 py-2 text-right tabular-nums ${muted ? "text-ink-faint" : ""} ${bold ? "font-semibold text-ink" : "text-ink-muted"}`}
			>
				{formatRupiah(value)}
			</td>
		</tr>
	);
}
