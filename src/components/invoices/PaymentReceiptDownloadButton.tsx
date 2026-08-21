"use client";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { getLogoAsset } from "@/app/actions/getPdfAssets";
import { buttonStyles } from "@/components/ui";
import type { PaymentReceiptProps } from "./PaymentReceiptPDF";

function buildReceiptFilename(jobNumber: string, receiptNumber: number): string {
	return `Kwitansi-${jobNumber.replace(/\//g, "-")}-${String(receiptNumber).padStart(3, "0")}.pdf`;
}

export function PaymentReceiptDownloadButton({
	receiptProps,
	verificationToken,
	logoUrl,
}: {
	receiptProps: PaymentReceiptProps;
	verificationToken: string;
	/** Raw company logo URL — resolved to a base64 data URL on click, not on page load. */
	logoUrl: string;
}) {
	const tPanel = useTranslations("panels.payments");
	const [generating, setGenerating] = useState(false);

	const filename = buildReceiptFilename(receiptProps.jobNumber, receiptProps.receiptNumber);

	async function handleDownload() {
		if (generating) return;
		setGenerating(true);
		try {
			const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
			const verificationUrl = `${appUrl}/verify/${verificationToken}`;

			const [{ pdf }, { PaymentReceiptPDF }, QRCode, logoDataUrl] = await Promise.all([
				import("@react-pdf/renderer"),
				import("./PaymentReceiptPDF"),
				import("qrcode"),
				getLogoAsset(logoUrl),
			]);

			const verificationQrUrl = await QRCode.default.toDataURL(verificationUrl, {
				width: 160,
				margin: 1,
			});

			const props: PaymentReceiptProps = {
				...receiptProps,
				company: { ...receiptProps.company, logo: logoDataUrl },
				template: { ...receiptProps.template, verificationQrUrl, verificationUrl },
			};

			const blob = await pdf(<PaymentReceiptPDF {...props} />).toBlob();
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
				variant: "subtle",
				size: "icon",
				className: generating ? "cursor-wait pointer-events-none" : "",
			})}
			aria-label={tPanel("printReceipt")}
			title={tPanel("printReceipt")}
		>
			{generating ? (
				<span
					className="block size-[14px] animate-spin rounded-full border-2 border-current border-t-transparent"
					aria-hidden="true"
				/>
			) : (
				<Printer size={14} aria-hidden="true" />
			)}
		</button>
	);
}
