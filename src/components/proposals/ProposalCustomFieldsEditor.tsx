"use client";
import { useState, useTransition } from "react";
import { updateProposalCustomFields } from "@/app/(dashboard)/proposals/[id]/actions";
import { Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import type { ProposalCustomFields } from "@/lib/proposalCustomFields";

export function ProposalCustomFieldsEditor({
	proposalId,
	initial,
}: {
	proposalId: string;
	initial: ProposalCustomFields;
}) {
	const [isPending, startTransition] = useTransition();
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [fields, setFields] = useState<ProposalCustomFields>(initial);

	function set(key: keyof ProposalCustomFields, value: string) {
		setSaved(false);
		setFields((prev) => ({ ...prev, [key]: value }));
	}

	function handleSave() {
		setError(null);
		setSaved(false);
		const cleaned: ProposalCustomFields = {};
		if (fields.price_suffix?.trim()) cleaned.price_suffix = fields.price_suffix.trim();
		if (fields.dp_note?.trim()) cleaned.dp_note = fields.dp_note.trim();
		if (fields.custom_conditions?.trim())
			cleaned.custom_conditions = fields.custom_conditions.trim();
		if (fields.override_services?.trim())
			cleaned.override_services = fields.override_services.trim();

		startTransition(async () => {
			try {
				await updateProposalCustomFields(proposalId, cleaned);
				setSaved(true);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Gagal menyimpan");
			}
		});
	}

	return (
		<Card>
			<CardHeader
				title={<span className="uppercase tracking-wide text-xs">Kustomisasi PDF</span>}
			/>
			<div className="p-5 space-y-4">
				<Field
					label="Keterangan Harga"
					hint='Ditampilkan setelah nominal harga, contoh: "/ trip", "/ hari"'
				>
					<Input
						value={fields.price_suffix ?? ""}
						onChange={(e) => set("price_suffix", e.target.value)}
						placeholder="/ trip"
					/>
				</Field>

				<Field
					label="Ketentuan Pembayaran (DP)"
					hint="Paragraf tambahan di bawah daftar layanan, contoh: Minimum DP 50% sebelum hari H"
				>
					<Input
						value={fields.dp_note ?? ""}
						onChange={(e) => set("dp_note", e.target.value)}
						placeholder="Minimum DP 50% sebelum hari H"
					/>
				</Field>

				<Field
					label="Catatan Tambahan"
					hint="Paragraf ekstra yang muncul setelah ketentuan pembayaran"
				>
					<Textarea
						value={fields.custom_conditions ?? ""}
						onChange={(e) => set("custom_conditions", e.target.value)}
						rows={3}
						placeholder="Ketentuan atau catatan khusus lainnya..."
					/>
				</Field>

				<Field
					label="Override Layanan Termasuk"
					hint="Satu layanan per baris. Kosongkan untuk menggunakan pengaturan global."
				>
					<Textarea
						value={fields.override_services ?? ""}
						onChange={(e) => set("override_services", e.target.value)}
						rows={4}
						placeholder={"Packing\nLoading\nRelokasi"}
					/>
				</Field>

				<div className="flex items-center gap-3 pt-1">
					<Button onClick={handleSave} disabled={isPending} size="sm">
						{isPending ? "Menyimpan..." : "Simpan Kustomisasi"}
					</Button>
					{saved && <span className="text-sm text-success-text">Tersimpan</span>}
					{error && <span className="text-sm text-danger-text">{error}</span>}
				</div>
			</div>
		</Card>
	);
}
