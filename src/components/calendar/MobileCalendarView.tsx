"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarEvent = {
	id: string;
	kind: "job" | "survey";
	/** Customer name (preferred) or fallback identifier — what shows on the chip. */
	title: string;
	/** Secondary line shown in the agenda (job number, "Survey", etc.). */
	subtitle?: string;
	/** Short route string shown inside multi-day bands, e.g. "Semarang Barat → Surabaya". */
	detail?: string;
	/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" — used for date placement + time display. */
	start: string;
	/** Inclusive last day the event occupies (single-day events: same as start). */
	endInclusive: string;
	/** CSS color for the chip stripe + status dot. */
	color: string;
	/** Display-only status label (e.g. "scheduled", "in_progress"). */
	status?: string;
	/** Whether this event is currently linked to a Google Calendar event. */
	synced?: boolean;
	url: string;
};

/** Per-day placement of an event — knows whether it's day 1 of N etc. */
type EventOnDay = {
	event: CalendarEvent;
	dayIndex: number; // 1-based
	totalDays: number;
};

/** A multi-day event band within a single week row (for the overlay layer). */
type SpanningBand = {
	event: CalendarEvent;
	startCol: number; // 0-based column where the band starts in this week row
	colSpan: number; // how many columns the band spans in this week row
	isEventStart: boolean; // true when this is the event's actual first day
	isEventEnd: boolean; // true when this is the event's actual last day
};

type View = "month" | "week" | "day";

// ---------------------------------------------------------------------------
// Pure helpers (no React)
// ---------------------------------------------------------------------------

const WEEKDAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAYS_MED = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateStr(d: Date): string {
	// Use local-time getters — toISOString() returns UTC and shifts the date
	// backwards in UTC+ timezones (e.g. UTC+7: midnight local = 5 PM prev UTC day).
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function addDays(str: string, n: number): string {
	const d = new Date(`${str}T00:00:00`);
	d.setDate(d.getDate() + n);
	return toDateStr(d);
}

/** Returns the 7 date-strings (Sun→Sat) for the week containing `anchor`. */
function getWeekDays(anchor: string): string[] {
	const d = new Date(`${anchor}T00:00:00`);
	const sun = new Date(d);
	sun.setDate(d.getDate() - d.getDay());
	return Array.from({ length: 7 }, (_, i) => {
		const day = new Date(sun);
		day.setDate(sun.getDate() + i);
		return toDateStr(day);
	});
}

/** Number of days between two YYYY-MM-DD strings (inclusive). */
function daysBetweenInclusive(a: string, b: string): number {
	const da = new Date(`${a}T00:00:00`);
	const db = new Date(`${b}T00:00:00`);
	return Math.round((db.getTime() - da.getTime()) / 86_400_000) + 1;
}

/** Extract "HH:MM" from an ISO datetime string, or null for all-day events. */
function eventTime(start: string): string | null {
	if (!start.includes("T")) return null;
	return start.split("T")[1].slice(0, 5);
}

// ---------------------------------------------------------------------------
// Multi-day band helpers
// ---------------------------------------------------------------------------

function computeSpanningBands(
	weekDates: (string | null)[],
	entriesByDate: Map<string, EventOnDay[]>,
): SpanningBand[] {
	const seen = new Set<string>();
	const result: SpanningBand[] = [];
	for (let col = 0; col < 7; col++) {
		const ds = weekDates[col];
		if (!ds) continue;
		for (const entry of entriesByDate.get(ds) ?? []) {
			if (entry.totalDays <= 1 || seen.has(entry.event.id)) continue;
			seen.add(entry.event.id);
			let endCol = col;
			for (let c = col + 1; c < 7; c++) {
				const nextDs = weekDates[c];
				if (
					nextDs &&
					(entriesByDate.get(nextDs) ?? []).some((e) => e.event.id === entry.event.id)
				) {
					endCol = c;
				} else break;
			}
			result.push({
				event: entry.event,
				startCol: col,
				colSpan: endCol - col + 1,
				isEventStart: entry.dayIndex === 1,
				isEventEnd: entry.dayIndex + (endCol - col) === entry.totalDays,
			});
		}
	}
	return result;
}

/** Assigns each band to the first available lane (row) so no two bands overlap. */
function assignBandLanes(bands: SpanningBand[]): number[] {
	const laneEndCols: number[] = [];
	return bands.map((band) => {
		let lane = laneEndCols.findIndex((end) => end < band.startCol);
		if (lane === -1) {
			lane = laneEndCols.length;
			laneEndCols.push(band.startCol + band.colSpan - 1);
		} else {
			laneEndCols[lane] = band.startCol + band.colSpan - 1;
		}
		return lane;
	});
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Single-day event chip. Multi-day events are handled by the band overlay in MonthGrid.
 */
function Chip({ entry, compact = false }: { entry: EventOnDay; compact?: boolean }) {
	const { event } = entry;
	const time = eventTime(event.start);
	return (
		<Link
			href={event.url}
			onClick={(e) => e.stopPropagation()}
			className="group block w-full"
			title={event.title}
		>
			<div
				className={`flex items-center gap-1 ${compact ? "px-1 py-0.5" : "px-1.5 py-1"} rounded-md bg-surface hover:bg-subtle border border-line transition-colors`}
				style={{ borderLeft: `3px solid ${event.color}` }}
			>
				<span
					className={`flex-1 min-w-0 truncate ${compact ? "text-[10px]" : "text-[11px]"} font-medium text-ink`}
				>
					{time && <span className="font-mono text-ink-muted mr-1">{time}</span>}
					{event.title}
				</span>
			</div>
		</Link>
	);
}

type MonthGridProps = {
	viewDate: string;
	todayStr: string;
	entriesByDate: Map<string, EventOnDay[]>;
	onSelect: (ds: string) => void;
};

function MonthGrid({ viewDate, todayStr, entriesByDate, onSelect }: MonthGridProps) {
	const anchor = new Date(`${viewDate}T00:00:00`);
	const year = anchor.getFullYear();
	const month = anchor.getMonth();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const firstDOW = new Date(year, month, 1).getDay();

	const cells: (number | null)[] = [
		...Array<null>(firstDOW).fill(null),
		...Array.from({ length: daysInMonth }, (_, i) => i + 1),
	];
	const rem = cells.length % 7;
	if (rem !== 0) cells.push(...Array<null>(7 - rem).fill(null));

	// Split into week rows of 7.
	const weeks: (number | null)[][] = [];
	for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

	const monthName = anchor.toLocaleString("en", { month: "long" });

	function dayKey(day: number) {
		return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	}

	const MAX_CHIPS_MOBILE = 2;
	const MAX_CHIPS_DESKTOP = 3;
	// Each band lane is h-5 (20 px) + 2 px gap below it.
	const BAND_LANE_PX = 22;
	// Day-number section height — the band overlay's `top` must equal this.
	// Using h-7 (28 px) gives enough room for the day number + breathing space.
	const DAY_NUM_H = "1.75rem"; // 28 px = h-7

	return (
		<div className="px-2 pt-3 pb-4">
			{/* Weekday headers */}
			<div className="grid grid-cols-7 mb-1">
				{WEEKDAYS_SHORT.map((wd) => (
					<div
						key={wd}
						className="text-center text-xs md:text-sm font-medium text-ink-faint py-1 md:py-2"
					>
						{wd}
					</div>
				))}
			</div>

			{/* Week rows */}
			<div className="flex flex-col gap-1">
				{weeks.map((week) => {
					const weekKey = `w-${week.find((d) => d !== null) ?? 0}`;
					const weekDates = week.map((d) => (d ? dayKey(d) : null));
					const bands = computeSpanningBands(weekDates, entriesByDate);
					const lanes = assignBandLanes(bands);
					const numBandRows = bands.length ? Math.max(...lanes) + 1 : 0;
					const bandAreaPx = numBandRows * BAND_LANE_PX;

					return (
						<div key={weekKey} className="relative">
							{/* ── Day cells ── */}
							<div className="grid grid-cols-7 gap-1">
								{[...week.entries()].map(([colIdx, day]) => {
									if (!day) {
										return (
											<div
												key={`s-${weekKey}-${colIdx}`}
												className="min-h-[52px] md:min-h-[72px]"
											/>
										);
									}
									const key = dayKey(day);
									const allEntries = entriesByDate.get(key) ?? [];
									const singleEntries = allEntries.filter((e) => e.totalDays === 1);
									const isToday = key === todayStr;
									const isSelected = key === viewDate;

									const visibleM = singleEntries.slice(0, MAX_CHIPS_MOBILE);
									const overflowM = singleEntries.length - visibleM.length;
									const visibleD = singleEntries.slice(0, MAX_CHIPS_DESKTOP);
									const overflowD = singleEntries.length - visibleD.length;

									return (
										<button
											type="button"
											key={key}
											onClick={() => onSelect(key)}
											aria-label={`${day} ${monthName}${allEntries.length ? `, ${allEntries.length} event${allEntries.length > 1 ? "s" : ""}` : ""}`}
											aria-pressed={isSelected}
											className={[
												"flex flex-col items-stretch text-left rounded-lg md:rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] min-h-[52px] md:min-h-[72px]",
												isSelected
													? "bg-primary-subtle ring-1 ring-primary"
													: isToday
														? "bg-primary-subtle"
														: "hover:bg-subtle",
											].join(" ")}
										>
											{/* Day number — same fixed height as DAY_NUM_H so the overlay aligns */}
											<div
												className="flex items-center px-1 md:px-1.5 shrink-0"
												style={{ height: DAY_NUM_H }}
											>
												<span
													className={`text-xs md:text-sm font-semibold leading-none ${
														isToday ? "text-primary-text" : "text-ink-muted"
													}`}
												>
													{day}
												</span>
											</div>

											{/* Spacer — reserves room for the band overlay rows */}
											{numBandRows > 0 && (
												<div style={{ height: `${bandAreaPx}px` }} aria-hidden="true" />
											)}

											{/* Single-day chips */}
											{singleEntries.length > 0 && (
												<>
													<div className="md:hidden flex flex-col gap-0.5 px-1 pb-1 mt-0.5">
														{visibleM.map((entry) => (
															<Chip key={`${entry.event.id}-m`} entry={entry} compact />
														))}
														{overflowM > 0 && (
															<span className="text-[9px] text-ink-faint px-0.5">
																+{overflowM} more
															</span>
														)}
													</div>
													<div className="hidden md:flex flex-col gap-0.5 px-1.5 pb-1.5 mt-0.5">
														{visibleD.map((entry) => (
															<Chip key={`${entry.event.id}-d`} entry={entry} />
														))}
														{overflowD > 0 && (
															<span className="text-[10px] text-ink-faint px-0.5">
																+{overflowD} more
															</span>
														)}
													</div>
												</>
											)}
										</button>
									);
								})}
							</div>

							{/* ── Multi-day band overlay ──
								Positioned at the same top offset as DAY_NUM_H so bands sit
								directly below the day numbers.  Uses the same grid definition
								as the day cells, so column widths align automatically.       */}
							{bands.length > 0 && (
								<div
									className="absolute inset-x-0 grid grid-cols-7 gap-x-1 pointer-events-none"
									style={{ top: DAY_NUM_H }}
								>
									{bands.map((band, bi) => {
										const lane = lanes[bi];
										const time = band.isEventStart ? eventTime(band.event.start) : null;
										const radius = [
											band.isEventStart ? "4px" : "0",
											band.isEventEnd ? "4px" : "0",
											band.isEventEnd ? "4px" : "0",
											band.isEventStart ? "4px" : "0",
										].join(" ");
										return (
											<Link
												key={band.event.id}
												href={band.event.url}
												onClick={(e) => e.stopPropagation()}
												title={
													band.event.detail
														? `${band.event.title} — ${band.event.detail}`
														: band.event.title
												}
												className="pointer-events-auto flex items-center min-w-0 h-5 px-1.5 text-[10px] md:text-[11px] font-medium text-ink hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] bg-surface border border-line"
												style={{
													gridColumn: `${band.startCol + 1} / span ${band.colSpan}`,
													gridRow: lane + 1,
													borderRadius: radius,
													marginTop: lane > 0 ? "2px" : undefined,
													borderLeft: band.isEventStart
														? `3px solid ${band.event.color}`
														: "1px solid var(--line)",
												}}
											>
												{time && (
													<span className="font-mono opacity-80 mr-1 hidden md:inline shrink-0">
														{time}
													</span>
												)}
												<span className="truncate">
													{band.event.title}
													{band.event.detail && (
														<span className="opacity-70 ml-1">— {band.event.detail}</span>
													)}
												</span>
											</Link>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------

type WeekGridProps = {
	viewDate: string;
	todayStr: string;
	entriesByDate: Map<string, EventOnDay[]>;
	onSelect: (ds: string) => void;
};

function WeekGrid({ viewDate, todayStr, entriesByDate, onSelect }: WeekGridProps) {
	const days = getWeekDays(viewDate);

	return (
		<div className="px-2 pt-3 pb-4">
			<div className="grid grid-cols-7 gap-1.5">
				{days.map((ds) => {
					const d = new Date(`${ds}T00:00:00`);
					const dayNum = d.getDate();
					const dayName = WEEKDAYS_MED[d.getDay()];
					const entries = entriesByDate.get(ds) ?? [];
					const isToday = ds === todayStr;
					const isSelected = ds === viewDate;
					const visible = entries.slice(0, 4);
					const overflow = entries.length - visible.length;

					return (
						<button
							type="button"
							key={ds}
							onClick={() => onSelect(ds)}
							aria-label={`${dayName} ${dayNum}${entries.length ? `, ${entries.length} event${entries.length > 1 ? "s" : ""}` : ""}`}
							aria-pressed={isSelected}
							className={[
								"flex flex-col items-stretch text-left rounded-xl p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] min-h-[140px]",
								isSelected
									? "bg-primary-subtle ring-1 ring-primary"
									: isToday
										? "bg-primary-subtle"
										: "hover:bg-subtle",
							].join(" ")}
						>
							<div className="flex items-baseline justify-between">
								<span
									className={`text-xs font-medium ${
										isSelected ? "text-primary-text" : "text-ink-faint"
									}`}
								>
									{dayName}
								</span>
								<span
									className={`text-base font-semibold ${
										isToday ? "text-primary-text" : "text-ink-muted"
									}`}
								>
									{dayNum}
								</span>
							</div>
							<div className="flex flex-col gap-0.5 mt-2">
								{visible.map((entry) => (
									<Chip key={`${entry.event.id}-w`} entry={entry} />
								))}
								{overflow > 0 && (
									<span className="text-[10px] text-ink-faint px-1">+{overflow} more</span>
								)}
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------

type AgendaProps = {
	viewDate: string;
	entries: EventOnDay[];
};

function Agenda({ viewDate, entries }: AgendaProps) {
	const label = new Date(`${viewDate}T00:00:00`).toLocaleDateString("en", {
		weekday: "long",
		day: "numeric",
		month: "long",
	});

	return (
		<div className="px-4 py-4 border-t border-line">
			<p className="text-xs font-semibold text-ink-muted uppercase tracking-widest mb-3">{label}</p>

			{entries.length === 0 ? (
				<p className="text-sm text-ink-faint py-2">No events scheduled.</p>
			) : (
				<ul className="space-y-1.5">
					{entries.map(({ event, dayIndex, totalDays }) => {
						const time = eventTime(event.start);
						return (
							<li key={event.id}>
								<Link
									href={event.url}
									className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-subtle hover:bg-surface-raised transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
								>
									<span
										className="w-1 self-stretch rounded-full shrink-0"
										style={{ backgroundColor: event.color }}
										aria-hidden="true"
									/>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium text-ink truncate">
											{event.title}
											{totalDays > 1 && (
												<span className="ml-2 text-xs font-mono text-ink-faint">
													day {dayIndex}/{totalDays}
												</span>
											)}
										</p>
										<p className="text-xs text-ink-muted mt-0.5 flex items-center gap-2 flex-wrap">
											{event.subtitle && <span>{event.subtitle}</span>}
											{time && <span className="font-mono">· {time}</span>}
											{event.status && event.kind === "job" && (
												<span className="capitalize">· {event.status.replace("_", " ")}</span>
											)}
											{event.synced === false && (
												<span className="text-warning-text">· not synced</span>
											)}
										</p>
										{event.detail && (
											<p className="text-xs text-ink-faint mt-0.5 truncate">{event.detail}</p>
										)}
									</div>
									<span className="text-ink-faint text-sm" aria-hidden="true">
										›
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Custom calendar with Month / Week / Day views.
 * Multi-day events render on every spanned day with a day-N/M suffix.
 */
export function MobileCalendarView({ events }: { events: CalendarEvent[] }) {
	const today = new Date();
	const todayStr = toDateStr(today);

	const [view, setView] = useState<View>("month");
	const [viewDate, setViewDate] = useState(todayStr);

	// Build date → EventOnDay[] index. For multi-day events we push one entry
	// per spanned day with the right dayIndex/totalDays.
	const entriesByDate = useMemo(() => {
		const map = new Map<string, EventOnDay[]>();

		function push(key: string, entry: EventOnDay) {
			const arr = map.get(key);
			if (arr) arr.push(entry);
			else map.set(key, [entry]);
		}

		for (const ev of events) {
			const startDate = ev.start.split("T")[0];
			const endDate = ev.endInclusive ?? startDate;
			const total = Math.max(1, daysBetweenInclusive(startDate, endDate));
			for (let i = 0; i < total; i += 1) {
				const dayStr = addDays(startDate, i);
				push(dayStr, { event: ev, dayIndex: i + 1, totalDays: total });
			}
		}
		return map;
	}, [events]);

	// ── Navigation ────────────────────────────────────────────────────────

	function navigate(dir: 1 | -1) {
		if (view === "month") {
			const d = new Date(`${viewDate}T00:00:00`);
			d.setMonth(d.getMonth() + dir);
			setViewDate(toDateStr(d));
		} else if (view === "week") {
			setViewDate(addDays(viewDate, dir * 7));
		} else {
			setViewDate(addDays(viewDate, dir));
		}
	}

	function goToday() {
		setViewDate(todayStr);
	}

	// ── Header label ──────────────────────────────────────────────────────

	function headerLabel(): string {
		const d = new Date(`${viewDate}T00:00:00`);
		if (view === "month") {
			return d.toLocaleString("en", { month: "long", year: "numeric" });
		}
		if (view === "week") {
			const days = getWeekDays(viewDate);
			const s = new Date(`${days[0]}T00:00:00`);
			const e = new Date(`${days[6]}T00:00:00`);
			if (s.getMonth() === e.getMonth()) {
				return `${s.getDate()}–${e.getDate()} ${e.toLocaleString("en", { month: "short", year: "numeric" })}`;
			}
			return `${s.getDate()} ${s.toLocaleString("en", { month: "short" })} – ${e.getDate()} ${e.toLocaleString("en", { month: "short", year: "numeric" })}`;
		}
		// day
		return d.toLocaleDateString("en", {
			weekday: "short",
			day: "numeric",
			month: "short",
			year: "numeric",
		});
	}

	const prevLabel =
		view === "month" ? "Previous month" : view === "week" ? "Previous week" : "Previous day";
	const nextLabel = view === "month" ? "Next month" : view === "week" ? "Next week" : "Next day";

	const selectedEntries = entriesByDate.get(viewDate) ?? [];

	// ── Render ────────────────────────────────────────────────────────────

	return (
		<div className="rounded-xl border border-line bg-surface overflow-hidden">
			{/* ── Header ── */}
			<div className="flex items-center gap-2 px-3 py-3 border-b border-line">
				<button
					type="button"
					onClick={() => navigate(-1)}
					aria-label={prevLabel}
					className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-lg text-ink-muted hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
				>
					‹
				</button>

				<button
					type="button"
					onClick={goToday}
					className="flex-1 min-w-0 text-sm font-semibold text-ink hover:text-primary-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded px-1 text-left truncate"
					aria-label={`${headerLabel()} — tap to go to today`}
				>
					{headerLabel()}
				</button>

				<button
					type="button"
					onClick={() => navigate(1)}
					aria-label={nextLabel}
					className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-lg text-ink-muted hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
				>
					›
				</button>

				<fieldset
					aria-label="Calendar view"
					className="flex rounded-lg border border-line overflow-hidden text-xs font-medium shrink-0"
				>
					{(["month", "week", "day"] as View[]).map((v) => (
						<button
							type="button"
							key={v}
							onClick={() => setView(v)}
							aria-pressed={view === v}
							className={[
								"px-2.5 py-1.5 capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]",
								view === v ? "bg-primary text-primary-fg" : "text-ink-muted hover:bg-subtle",
							].join(" ")}
						>
							{v}
						</button>
					))}
				</fieldset>
			</div>

			{/* ── Body ── */}
			<div className="flex flex-col">
				{view === "month" && (
					<MonthGrid
						viewDate={viewDate}
						todayStr={todayStr}
						entriesByDate={entriesByDate}
						onSelect={setViewDate}
					/>
				)}

				{view === "week" && (
					<WeekGrid
						viewDate={viewDate}
						todayStr={todayStr}
						entriesByDate={entriesByDate}
						onSelect={setViewDate}
					/>
				)}

				{/* Day view: agenda only */}

				<Agenda viewDate={viewDate} entries={selectedEntries} />
			</div>
		</div>
	);
}
