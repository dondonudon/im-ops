"use client";
import { useTranslations } from "next-intl";
import { type Entity, StatusChip, VARIANT_FOR_ENTITY } from "./StatusChip";

/**
 * Translation-aware status badge. Looks up `status.{entity}.{status}` in the
 * active locale and picks the colour from the matching variant helper. Falls
 * back to the raw status string (with underscores replaced) if no translation
 * is registered.
 *
 * Client-only (uses useTranslations). Server components should pre-translate
 * via getTranslations + render the plain <StatusChip>.
 */
export function EntityStatusChip({
	entity,
	status,
	className,
}: {
	entity: Entity;
	status: string;
	className?: string;
}) {
	const t = useTranslations("status");
	const key = `${entity}.${status}`;
	const translated = t.has(key as never) ? t(key as never) : null;
	const label = translated ?? status.replace(/_/g, " ");
	return (
		<StatusChip label={label} variant={VARIANT_FOR_ENTITY[entity](status)} className={className} />
	);
}
