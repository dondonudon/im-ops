// MarginCalc pricing logic ported from https://github.com/dondonudon/MarginCalc
// Engine version must be bumped when pricing logic changes.

export const ENGINE_VERSION = "2.5.1";

export type VehicleType = "pickup" | "box_truck";

/**
 * One bracket of the tiered margin table. Tiers are ordered ascending by `max`
 * (the exclusive upper bound on adjusted cost). The final tier uses `max: null`
 * as the catch-all ("and above").
 */
export interface MarginTier {
	max: number | null; // exclusive upper bound on adjusted cost; null = top tier
	rate_pct: number; // margin rate, e.g. 45 → 45%
	min_profit: number; // minimum profit floor for this bracket (IDR)
}

/** Default tiered margin table — ported from MarginCalc. */
export const DEFAULT_MARGIN_TIERS: MarginTier[] = [
	{ max: 1_000_000, rate_pct: 45, min_profit: 300_000 },
	{ max: 3_000_000, rate_pct: 35, min_profit: 500_000 },
	{ max: 7_000_000, rate_pct: 25, min_profit: 750_000 },
	{ max: 15_000_000, rate_pct: 20, min_profit: 1_300_000 },
	{ max: null, rate_pct: 15, min_profit: 2_100_000 },
];

export const DEFAULT_PRICE_ROUND_INCREMENT = 50_000;

export interface EstimationInputs {
	vehicle_type: VehicleType;
	vehicle_cost: number; // direct entry; pre-filled from settings when type changes
	crew_count: number;
	crew_day_rate: number; // per-crew per-day rate
	food_per_crew: number; // meal value per crew per meal
	packing_cost: number; // packing materials — free entry, direct cost
	toll_estimate: number;
	other_cost: number;
	is_out_of_town: boolean;
	days: number; // number of job days; default 1
	meals_count: number; // meals per day per traveling crew; default 3
	travel_crew_count: number; // origin crew that travel with the truck; default 0
	travel_cost_per_crew: number; // day rate for traveling crew; default 500_000
	spot_hire_count: number; // local helpers hired at destination; default 0
	spot_hire_cost: number; // day rate per spot hire; no food included; default 100_000
}

export interface EstimationSettings {
	vehicle_rate_pickup: number;
	vehicle_rate_box_truck: number;
	crew_day_rate: number;
	food_per_crew: number;
	operational_buffer_pct: number; // e.g. 10 → 10%
	negotiation_buffer_pct: number; // e.g. 3  → 3%
	min_target_profit: number;
	margin_tiers: MarginTier[];
	price_round_increment: number; // round prices up to nearest this many IDR
}

export interface EstimationOutputs {
	vehicle_cost: number;
	manpower_cost: number;
	food_cost: number;
	packing_cost: number;
	toll_cost: number;
	other_cost: number;
	job_cost: number;
	operational_buffer: number;
	adjusted_cost: number;
	margin_pct: number;
	margin_profit: number;
	minimum_profit: number;
	final_profit: number;
	internal_target_price: number;
	initial_offer_price: number;
	effective_crew_count: number;
}

// ── Tiered margin (from MarginCalc) ──────────────────────────────────────────
/**
 * Find the margin tier the adjusted cost falls into. Tiers must be ordered
 * ascending by `max`; the catch-all tier (`max: null`) wins for top values.
 * Falls back to the last tier if none match.
 */
function findMarginTier(tiers: MarginTier[], adjustedCost: number): MarginTier {
	for (const tier of tiers) {
		if (tier.max === null || adjustedCost < tier.max) return tier;
	}
	return tiers[tiers.length - 1];
}

/** Round up to the nearest `increment` IDR. */
function roundUpTo(value: number, increment: number): number {
	return Math.ceil(value / increment) * increment;
}

// ── Core calculation ─────────────────────────────────────────────────────────
/**
 * Runs the MarginCalc estimation engine.
 * Pure function — no side effects. Safe to call on every form change.
 */
export function calculate(
	inputs: EstimationInputs,
	settings: EstimationSettings,
): EstimationOutputs {
	const vehicleCost = inputs.vehicle_cost;

	// Out-of-town: crew splits into stay crew (origin, 1 day) and travel crew (multi-day,
	// higher rate). Spot hire are destination-only workers with no food allowance.
	const oot = inputs.is_out_of_town;
	const days = oot ? inputs.days : 1;
	const mealsPerDay = oot ? inputs.meals_count : 1;
	const travelCrewCount = oot ? inputs.travel_crew_count : 0;
	const travelCostPerCrew = oot ? inputs.travel_cost_per_crew : 0;
	const spotHireCount = oot ? inputs.spot_hire_count : 0;
	const spotHireCost = oot ? inputs.spot_hire_cost : 0;

	const stayCrewCount = inputs.crew_count - travelCrewCount;
	const manpowerCost = oot
		? stayCrewCount * inputs.crew_day_rate +
			travelCrewCount * travelCostPerCrew * days +
			spotHireCount * spotHireCost
		: inputs.crew_count * inputs.crew_day_rate;
	const foodCost = oot
		? stayCrewCount * inputs.food_per_crew +
			travelCrewCount * inputs.food_per_crew * mealsPerDay * days
		: inputs.crew_count * inputs.food_per_crew;

	const effectiveCrew = inputs.crew_count + spotHireCount;

	const jobCost =
		vehicleCost +
		manpowerCost +
		foodCost +
		inputs.packing_cost +
		inputs.toll_estimate +
		inputs.other_cost;

	const operationalBuffer = jobCost * (settings.operational_buffer_pct / 100);
	const adjustedCost = jobCost + operationalBuffer;

	const tier = findMarginTier(settings.margin_tiers, adjustedCost);
	const marginRate = tier.rate_pct / 100;
	const marginProfit = adjustedCost * marginRate;
	const minProfit = tier.min_profit;
	const finalProfit = Math.max(marginProfit, minProfit);

	const negotiationBuffer = settings.negotiation_buffer_pct / 100;
	const increment = settings.price_round_increment;
	const internalTarget = roundUpTo(adjustedCost + finalProfit, increment);
	const initialOfferPrice = roundUpTo(internalTarget * (1 + negotiationBuffer), increment);

	return {
		vehicle_cost: vehicleCost,
		manpower_cost: manpowerCost,
		food_cost: foodCost,
		packing_cost: inputs.packing_cost,
		toll_cost: inputs.toll_estimate,
		other_cost: inputs.other_cost,
		job_cost: jobCost,
		operational_buffer: operationalBuffer,
		adjusted_cost: adjustedCost,
		margin_pct: marginRate * 100,
		margin_profit: marginProfit,
		minimum_profit: minProfit,
		final_profit: finalProfit,
		internal_target_price: internalTarget,
		initial_offer_price: initialOfferPrice,
		effective_crew_count: effectiveCrew,
	};
}

// ── Settings helpers ─────────────────────────────────────────────────────────

/**
 * Parse the `margin_tiers` setting (a JSON string) into a typed tier array.
 * Falls back to {@link DEFAULT_MARGIN_TIERS} when missing or malformed.
 */
export function parseMarginTiers(raw: string | undefined | null): MarginTier[] {
	if (!raw) return DEFAULT_MARGIN_TIERS;
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MARGIN_TIERS;
		return parsed.map((t) => ({
			max: t?.max === null || t?.max === undefined ? null : Number(t.max),
			rate_pct: Number(t?.rate_pct) || 0,
			min_profit: Number(t?.min_profit) || 0,
		}));
	} catch {
		return DEFAULT_MARGIN_TIERS;
	}
}

/**
 * Parse system_settings rows into a typed EstimationSettings object.
 * Falls back to sensible defaults if a key is missing.
 */
export function parseSettings(rows: Array<{ key: string; value: string }>): EstimationSettings {
	const map = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
	const tiersRaw = rows.find((r) => r.key === "margin_tiers")?.value;
	return {
		vehicle_rate_pickup: map.vehicle_rate_pickup ?? 500_000,
		vehicle_rate_box_truck: map.vehicle_rate_box_truck ?? 800_000,
		crew_day_rate: map.crew_day_rate ?? 175_000,
		food_per_crew: map.food_per_crew ?? 35_000,
		operational_buffer_pct: map.operational_buffer_pct ?? 10,
		negotiation_buffer_pct: map.negotiation_buffer_pct ?? 3,
		min_target_profit: map.min_target_profit ?? 500_000,
		margin_tiers: parseMarginTiers(tiersRaw),
		price_round_increment: map.price_round_increment ?? DEFAULT_PRICE_ROUND_INCREMENT,
	};
}
