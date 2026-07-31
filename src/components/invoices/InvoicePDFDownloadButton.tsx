"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { getPdfAssets } from "@/app/actions/getPdfAssets";
import { Button } from "@/components/ui";
import type { InvoicePDFProps } from "./InvoicePDF";

function buildInvoiceFilename(invoiceNumber: string) {
	return `${invoiceNumber.replace(/\//g, "-")}.pdf`;
}

export function InvoicePDFDownloadButton({
	pdfProps,
	logoUrl,
	verificationToken,
}: {
	pdfProps: Omit<InvoicePDFProps, "company" | "template"> & {
		company: Omit<InvoicePDFProps["company"], "logo">;
		template: Omit<InvoicePDFProps["template"], "verificationQrUrl" | "verificationUrl">;
	};
	logoUrl: string;
	verificationToken: string;
}) {
	const tActions = useTranslations("common.actions");
	const tDetail = useTranslations("pages.invoiceDetail");
	const [generating, setGenerating] = useState(false);

	const filename = buildInvoiceFilename(pdfProps.invoice.invoice_number);

	async function handleDownload() {
		if (generating) return;
		setGenerating(true);
		try {
			const [{ pdf }, { InvoicePDF }, { logoDataUrl, verificationQrUrl, verificationUrl }] =
				await Promise.all([
					import("@react-pdf/renderer"),
					import("./InvoicePDF"),
					getPdfAssets(logoUrl, verificationToken),
				]);
			const fullProps: InvoicePDFProps = {
				...pdfProps,
				company: { ...pdfProps.company, logo: logoDataUrl },
				template: { ...pdfProps.template, verificationQrUrl, verificationUrl },
			};
			const blob = await pdf(<InvoicePDF {...fullProps} />).toBlob();
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
		<Button
			variant="secondary"
			size="sm"
			onClick={handleDownload}
			loading={generating}
			aria-label={`${tDetail("downloadInvoicePdf")} — ${pdfProps.invoice.invoice_number}`}
		>
			{generating ? tActions("generatingPdf") : `⬇ ${tDetail("downloadInvoicePdf")}`}
		</Button>
	);
}
