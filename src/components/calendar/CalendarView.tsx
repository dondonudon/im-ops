"use client";
import { type CalendarEvent, MobileCalendarView } from "./MobileCalendarView";

/**
 * Calendar view — custom mini-grid + day agenda at all screen sizes.
 * Single component for both desktop and mobile; layout responds via Tailwind.
 */
export function CalendarView({ events }: { events: CalendarEvent[] }) {
	return <MobileCalendarView events={events} />;
}

export type { CalendarEvent };
