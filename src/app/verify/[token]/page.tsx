import { CheckCircle, XCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type VerifyResult = {
	doc_type: "Proposal" | "Invoice" | "Kwitansi";
	doc_number: string;
	issued_at: string;
	signatory_name: string;
	company_name: string;
} | null;

async function findDocument(token: string): Promise<VerifyResult> {
	const supabase = await createClient();
	const { data } = await supabase.rpc("verify_document_by_token", { p_token: token });
	return (data as VerifyResult) ?? null;
}

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const [result, t] = await Promise.all([findDocument(token), getTranslations("pages.verify")]);

	if (!result) {
		return (
			<main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
				<div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
					<XCircle className="mx-auto text-red-500" size={48} />
					<h1 className="text-lg font-semibold text-gray-900">{t("notFoundTitle")}</h1>
					<p className="text-sm text-gray-500">{t("notFoundDesc")}</p>
				</div>
			</main>
		);
	}

	const docTypeLabel = t(`docTypes.${result.doc_type}` as never);

	return (
		<main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
			<div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
				{/* Status badge */}
				<div className="flex items-center gap-3">
					<CheckCircle className="text-green-500 shrink-0" size={32} />
					<div>
						<p className="text-xs font-semibold text-green-600 uppercase tracking-wide">
							{t("verifiedBadge")}
						</p>
						<p className="text-sm text-gray-500">{t("issuedBy")}</p>
					</div>
				</div>

				{/* Company name */}
				<p className="text-base font-bold text-gray-900 -mt-2">{result.company_name}</p>

				{/* Details */}
				<div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden text-sm">
					<Row label={t("docType")} value={docTypeLabel} />
					<Row label={t("number")} value={result.doc_number} />
					<Row label={t("date")} value={formatDate(result.issued_at)} />
					{result.signatory_name && (
						<Row label={t("signatory")} value={result.signatory_name} />
					)}
				</div>

				<p className="text-xs text-gray-400 text-center">{t("footer")}</p>
			</div>
		</main>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-4 px-4 py-3">
			<span className="text-gray-500">{label}</span>
			<span className="font-medium text-gray-900 text-right">{value}</span>
		</div>
	);
}
