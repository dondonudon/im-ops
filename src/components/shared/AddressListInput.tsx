"use client";
import { Plus } from "lucide-react";
import { LocationInput, type LocationValue } from "@/components/shared/LocationInput";

export const emptyLocation: LocationValue = { address: "", lat: null, lng: null };

interface AddressListInputProps {
	/** Ordered address entries for one role (pickup or destination). */
	values: LocationValue[];
	onChange: (values: LocationValue[]) => void;
	/** Prefix for the generated input ids (must be unique per list on the page). */
	idPrefix: string;
	/** Singular noun for one entry, e.g. "Pickup" / "Destination". */
	itemLabel: string;
	/** CTA to append another entry, e.g. "Add pickup". */
	addLabel: string;
	/** Label for the per-row remove control. */
	removeLabel: string;
	placeholder?: string;
	/** Minimum rows always shown (default 1 — the last row can't be removed). */
	minItems?: number;
}

/**
 * Dynamic list of addresses for a single role, built on LocationInput. Renders at
 * least `minItems` rows; add appends an empty entry, remove drops one (kept ≥ min).
 */
export function AddressListInput({
	values,
	onChange,
	idPrefix,
	itemLabel,
	addLabel,
	removeLabel,
	placeholder,
	minItems = 1,
}: AddressListInputProps) {
	const list = values.length > 0 ? values : [emptyLocation];

	function update(index: number, next: LocationValue) {
		onChange(list.map((v, i) => (i === index ? next : v)));
	}
	function remove(index: number) {
		onChange(list.filter((_, i) => i !== index));
	}
	function add() {
		onChange([...list, { ...emptyLocation }]);
	}

	return (
		<div className="space-y-3">
			{list.map((value, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: editable rows have no stable id; positional key is intended
				<div key={`${idPrefix}-${index}`} className="space-y-1">
					<div className="flex items-center justify-between gap-2">
						<span className="text-xs font-medium text-ink-muted">
							{list.length > 1 ? `${itemLabel} ${index + 1}` : itemLabel}
						</span>
						{list.length > minItems && (
							<button
								type="button"
								onClick={() => remove(index)}
								className="text-xs text-ink-faint hover:text-danger transition-colors"
							>
								{removeLabel}
							</button>
						)}
					</div>
					<LocationInput
						id={`${idPrefix}-${index}`}
						value={value}
						onChange={(next) => update(index, next)}
						placeholder={placeholder}
					/>
				</div>
			))}
			<button
				type="button"
				onClick={add}
				className="inline-flex items-center gap-1 text-sm text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
			>
				<Plus size={14} aria-hidden="true" />
				{addLabel}
			</button>
		</div>
	);
}
