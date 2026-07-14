"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { buttonStyles } from "@/components/ui";
import type { InvoicePDFProps } from "./InvoicePDF";

function buildInvoiceFilename(invoiceNumber: string) {
	return `${invoiceNumber.replace(/\//g, "-")}.pdf`;
}

export function InvoicePDFDownloadButton({ pdfProps }: { pdfProps: InvoicePDFProps }) {
	const tActions = useTranslations("common.actions");
	const tDetail = useTranslations("pages.invoiceDetail");
	const [generating, setGenerating] = useState(false);

	const filename = buildInvoiceFilename(pdfProps.invoice.invoice_number);

	async function handleDownload() {
		if (generating) return;
		setGenerating(true);
		try {
			const [{ pdf }, { InvoicePDF }] = await Promise.all([
				import("@react-pdf/renderer"),
				import("./InvoicePDF"),
			]);
			const blob = await pdf(<InvoicePDF {...pdfProps} />).toBlob();
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
				variant: "secondary",
				size: "sm",
				className: generating ? "cursor-wait opacity-60" : "",
			})}
			aria-label={`${tDetail("downloadInvoicePdf")} — ${pdfProps.invoice.invoice_number}`}
		>
			{generating ? tActions("generatingPdf") : `⬇ ${tDetail("downloadInvoicePdf")}`}
		</button>
	);
}
