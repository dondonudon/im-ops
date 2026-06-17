"use client";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
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
	const tActions = useTranslations("common.actions");
	const tPanel = useTranslations("panels.payments");
	const [DownloadLink, setDownloadLink] = useState<React.ReactNode>(null);

	const filename = buildReceiptFilename(receiptProps.jobNumber, receiptProps.receiptNumber);

	// Refs capture the initial values so the one-time effect has no stale closures
	// and [] is legitimately correct (payment data is immutable after save).
	const propsRef = useRef(receiptProps);
	const filenameRef = useRef(filename);
	const tPanelRef = useRef(tPanel);

	useEffect(() => {
		const props = propsRef.current;
		const fn = filenameRef.current;
		const t = tPanelRef.current;

		Promise.all([import("@react-pdf/renderer"), import("./PaymentReceiptPDF")]).then(
			([renderer, pdfModule]) => {
				const { PDFDownloadLink } = renderer;
				const { PaymentReceiptPDF } = pdfModule;

				setDownloadLink(
					<PDFDownloadLink
						document={<PaymentReceiptPDF {...props} />}
						fileName={fn}
						className={buttonStyles({ variant: "ghost", size: "icon" })}
						aria-label={t("printReceipt")}
						title={t("printReceipt")}
					>
						{({ loading }: { loading: boolean }) =>
							loading ? (
								<span className="animate-pulse">
									<Printer size={14} aria-hidden="true" className="opacity-40" />
								</span>
							) : (
								<Printer size={14} aria-hidden="true" />
							)
						}
					</PDFDownloadLink>,
				);
			},
		);
	}, []);

	if (!DownloadLink) {
		return (
			<span
				className={buttonStyles({
					variant: "ghost",
					size: "icon",
					className: "cursor-wait opacity-40 pointer-events-none",
				})}
				title={tActions("loadingPdf")}
			>
				<Printer size={14} aria-hidden="true" />
			</span>
		);
	}

	return <>{DownloadLink}</>;
}
