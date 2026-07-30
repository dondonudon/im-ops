"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { getPdfAssets } from "@/app/actions/getPdfAssets";
import { Button } from "@/components/ui";
import type { ProposalPDFProps } from "./ProposalPDF";

function buildProposalFilename(proposalNumber: string) {
	return `Proposal_${proposalNumber.replace(/\//g, "-")}.pdf`;
}

export function ProposalPDFDownloadButton({
	pdfProps,
	logoUrl,
	verificationToken,
}: {
	pdfProps: Omit<ProposalPDFProps, "company" | "template"> & {
		company: Omit<ProposalPDFProps["company"], "logo">;
		template: Omit<ProposalPDFProps["template"], "verificationQrUrl">;
	};
	logoUrl: string;
	verificationToken: string;
}) {
	const tActions = useTranslations("common.actions");
	const [generating, setGenerating] = useState(false);

	const filename = buildProposalFilename(pdfProps.proposal.proposal_number);

	async function handleDownload() {
		if (generating) return;
		setGenerating(true);
		try {
			const [{ pdf }, { ProposalPDF }, { logoDataUrl, verificationQrUrl }] = await Promise.all([
				import("@react-pdf/renderer"),
				import("./ProposalPDF"),
				getPdfAssets(logoUrl, verificationToken),
			]);
			const fullProps: ProposalPDFProps = {
				...pdfProps,
				company: { ...pdfProps.company, logo: logoDataUrl },
				template: { ...pdfProps.template, verificationQrUrl },
			};
			const blob = await pdf(<ProposalPDF {...fullProps} />).toBlob();
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
			aria-label={`${tActions("downloadPdf")} — ${filename}`}
		>
			{generating ? tActions("generatingPdf") : `⬇ ${tActions("downloadPdf")}`}
		</Button>
	);
}
