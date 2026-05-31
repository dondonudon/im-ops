"use client";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setLocale } from "@/app/actions/locale";
import { LOCALES, type Locale } from "@/i18n/config";

/**
 * Compact two-state EN/ID switch. Lives next to the theme toggle in the
 * TopBar. Calls the server action to persist the cookie + revalidate the
 * tree so all server-rendered strings flip at once.
 */
export function LocaleToggle() {
	const current = useLocale() as Locale;
	const t = useTranslations("topbar");
	const [pending, startTransition] = useTransition();

	function change(next: Locale) {
		if (next === current || pending) return;
		startTransition(() => {
			void setLocale(next);
		});
	}

	return (
		<div
			role="group"
			aria-label={t("language")}
			className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden text-[10px] font-semibold"
		>
			{LOCALES.map((loc) => {
				const active = loc === current;
				return (
					<button
						key={loc}
						type="button"
						onClick={() => change(loc)}
						disabled={pending}
						aria-pressed={active}
						className={[
							"px-2 py-1 uppercase tracking-wide transition-colors min-w-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500",
							active
								? "bg-brand-600 text-white"
								: "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700",
						].join(" ")}
					>
						{pending && active ? (
							<Loader2 size={11} className="animate-spin mx-auto" aria-hidden="true" />
						) : (
							loc
						)}
					</button>
				);
			})}
		</div>
	);
}
