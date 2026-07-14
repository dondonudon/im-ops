"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { buttonStyles } from "@/components/ui";
import type { ProposalPDFProps } from "./ProposalPDF";

function buildProposalFilename(proposalNumber: string) {
	return `Proposal_${proposalNumber.replace(/\//g, "-")}.pdf`;
}

export function ProposalPDFDownloadButton({ pdfProps }: { pdfProps: ProposalPDFProps }) {
	const tActions = useTranslations("common.actions");
	const [generating, setGenerating] = useState(false);

	const filename = buildProposalFilename(pdfProps.proposal.proposal_number);

	async function handleDownload() {
		if (generating) return;
		setGenerating(true);
		try {
			const [{ pdf }, { ProposalPDF }] = await Promise.all([
				import("@react-pdf/renderer"),
				import("./ProposalPDF"),
			]);
			const blob = await pdf(<ProposalPDF {...pdfProps} />).toBlob();
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
			aria-label={`${tActions("downloadPdf")} — ${filename}`}
		>
			{generating ? tActions("generatingPdf") : `⬇ ${tActions("downloadPdf")}`}
		</button>
	);
}
