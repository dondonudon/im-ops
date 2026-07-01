"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/** `value` must be `YYYY-MM` (e.g. "2026-06"). */
export function MonthPicker({ value }: { value: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const [isPending, startTransition] = useTransition();

	const navigate = (month: string) => {
		startTransition(() => {
			router.push(`${pathname}?month=${month}`);
		});
	};

	const [year, month] = value.split("-").map(Number);

	const prev = () => {
		const d = new Date(year, month - 2, 1);
		navigate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
	};
	const next = () => {
		const d = new Date(year, month, 1);
		navigate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
	};

	const handleYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		navigate(`${e.target.value}-${String(month).padStart(2, "0")}`);
	};
	const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		navigate(`${year}-${e.target.value}`);
	};

	const currentYear = new Date().getFullYear();
	const years = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i);

	return (
		<div
			className={`flex items-center gap-1 transition-opacity ${isPending ? "opacity-50 pointer-events-none" : ""}`}
		>
			<button
				type="button"
				onClick={prev}
				disabled={isPending}
				className="p-1.5 rounded hover:bg-subtle text-ink-muted hover:text-ink transition-colors"
				aria-label="Previous month"
			>
				{isPending ? <Loader2 size={15} className="animate-spin" /> : <ChevronLeft size={15} />}
			</button>

			<div className="flex items-center gap-1 px-1">
				<select
					value={String(month).padStart(2, "0")}
					onChange={handleMonthChange}
					disabled={isPending}
					className="text-sm font-medium text-ink bg-transparent border-none outline-none cursor-pointer hover:text-primary-text transition-colors appearance-none"
				>
					{MONTHS.map((name, i) => (
						<option key={name} value={String(i + 1).padStart(2, "0")}>
							{name}
						</option>
					))}
				</select>

				<select
					value={year}
					onChange={handleYearChange}
					disabled={isPending}
					className="text-sm font-medium text-ink bg-transparent border-none outline-none cursor-pointer hover:text-primary-text transition-colors appearance-none"
				>
					{years.map((y) => (
						<option key={y} value={y}>
							{y}
						</option>
					))}
				</select>
			</div>

			<button
				type="button"
				onClick={next}
				disabled={isPending}
				className="p-1.5 rounded hover:bg-subtle text-ink-muted hover:text-ink transition-colors"
				aria-label="Next month"
			>
				{isPending ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={15} />}
			</button>
		</div>
	);
}
