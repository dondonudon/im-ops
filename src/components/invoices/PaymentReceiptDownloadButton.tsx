"use client";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { buttonStyles } from "@/components/ui";
import type { PaymentReceiptProps } from "./PaymentReceiptPDF";

function buildReceiptFilename(jobNumber: string, receiptNumber: number): string {
	return `Kwitansi-${jobNumber.replace(/\//g, "-")}-${String(receiptNumber).padStart(3, "0")}.pdf`;
}

export function PaymentReceiptDownloadButton({
	receiptProps,
}: {
	receiptProps: PaymentReceiptProps;
}) {
	const tPanel = useTranslations("panels.payments");
	const [generating, setGenerating] = useState(false);

	const filename = buildReceiptFilename(receiptProps.jobNumber, receiptProps.receiptNumber);

	async function handleDownload() {
		if (generating) return;
		setGenerating(true);
		try {
			const [{ pdf }, { PaymentReceiptPDF }] = await Promise.all([
				import("@react-pdf/renderer"),
				import("./PaymentReceiptPDF"),
			]);
			const blob = await pdf(<PaymentReceiptPDF {...receiptProps} />).toBlob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			setGenerating(false);
		}
	}

	return (
		<button
			type="button"
			onClick={handleDownload}
			disabled={generating}
			className={buttonStyles({
				variant: "ghost",
				size: "icon",
				className: generating ? "cursor-wait opacity-40 pointer-events-none" : "",
			})}
			aria-label={tPanel("printReceipt")}
			title={tPanel("printReceipt")}
		>
			{generating ? (
				<span className="animate-pulse">
					<Printer size={14} aria-hidden="true" className="opacity-40" />
				</span>
			) : (
				<Printer size={14} aria-hidden="true" />
			)}
		</button>
	);
}
