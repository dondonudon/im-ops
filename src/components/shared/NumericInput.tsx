"use client";
import { type InputHTMLAttributes, useRef } from "react";

/** Format with Indonesian thousand separator — matches formatRupiah locale. 0 renders as "". */
function fmt(n: number): string {
	return n === 0 ? "" : new Intl.NumberFormat("id-ID").format(n);
}

/** Strip separators and parse as integer. */
function parse(s: string): number {
	const digits = s.replace(/[^\d]/g, "");
	return digits === "" ? 0 : parseInt(digits, 10);
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
	value: number;
	onChange: (value: number) => void;
};

/**
 * Text input with live thousand-separator formatting (id-ID locale: 1.000.000).
 * value/onChange deal in plain numbers; the field displays formatted text.
 * Cursor position is restored after each reformat keystroke.
 */
export function NumericInput({ value, onChange, ...rest }: Props) {
	const ref = useRef<HTMLInputElement>(null);

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const el = e.currentTarget;
		const raw = el.value;
		const cursorPos = el.selectionStart ?? raw.length;

		// Remember how many digit chars sat before the cursor so we can
		// re-place it after React re-renders with the newly-formatted string.
		const digitsBeforeCursor = (raw.slice(0, cursorPos).match(/\d/g) ?? []).length;

		onChange(parse(raw));

		requestAnimationFrame(() => {
			const el = ref.current;
			if (!el) return;
			const newVal = el.value;
			let digitsSeen = 0;
			let newPos = newVal.length;
			for (let i = 0; i < newVal.length; i++) {
				if (/\d/.test(newVal[i])) {
					digitsSeen++;
					if (digitsSeen === digitsBeforeCursor) {
						newPos = i + 1;
						break;
					}
				}
			}
			el.setSelectionRange(newPos, newPos);
		});
	}

	return (
		<input
			{...rest}
			ref={ref}
			type="text"
			inputMode="numeric"
			value={fmt(value)}
			onChange={handleChange}
		/>
	);
}
