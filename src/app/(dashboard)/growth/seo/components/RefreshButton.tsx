"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui";
import { refreshSeoData } from "../actions";

export function RefreshButton() {
	const t = useTranslations("pages.seo.refresh");
	const [pending, setPending] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const onClick = async () => {
		setPending(true);
		setMessage(null);
		try {
			const res = await refreshSeoData();
			setMessage(res.ok ? t("done") : t(res.reason));
		} catch {
			setMessage(t("error"));
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="flex items-center gap-2">
			{message && <span className="text-sm text-ink-muted">{message}</span>}
			<Button
				type="button"
				variant="secondary"
				size="sm"
				loading={pending}
				onClick={onClick}
				title={t("hint")}
			>
				<RefreshCw size={14} aria-hidden />
				{t("button")}
			</Button>
		</div>
	);
}
