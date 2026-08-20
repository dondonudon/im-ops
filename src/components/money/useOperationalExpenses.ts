"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { receiptStoragePath } from "@/lib/storage/signedUrls";
import { createClient } from "@/lib/supabase/client";
import { resizeImage } from "@/lib/utils";
import {
	byNewest,
	type ExpenseFormState,
	OPERATIONAL_EXPENSE_COLUMNS,
	type OperationalExpense,
} from "./operationalExpense";

/**
 * CRUD for operational expenses, with the optimistic list and shared
 * saving/error state. Split from the panel so the component stays presentational.
 */
export function useOperationalExpenses(initial: OperationalExpense[]) {
	const router = useRouter();
	const tErrors = useTranslations("common.errors");
	const supabase = useMemo(() => createClient(), []);
	const [isPending, startTransition] = useTransition();

	const [expenses, setExpenses] = useState(initial);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	/** Wraps a mutation with shared saving/error handling; resolves to success. */
	async function mutate(run: () => Promise<void>): Promise<boolean> {
		setSaving(true);
		setError(null);
		try {
			await run();
			startTransition(() => router.refresh());
			return true;
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : tErrors("generic"));
			return false;
		} finally {
			setSaving(false);
		}
	}

	function validAmount(form: ExpenseFormState): number | null {
		const amount = Number(form.amount);
		if (!amount || amount <= 0) {
			setError(tErrors("amountMustBePositive"));
			return null;
		}
		return amount;
	}

	async function uploadReceipt(image: File): Promise<string> {
		// Job receipts are keyed by job id; operational ones have no job.
		const path = `operational/${crypto.randomUUID()}.webp`;
		const { error: uploadErr } = await supabase.storage
			.from("receipts")
			.upload(path, await resizeImage(image));
		if (uploadErr) throw uploadErr;
		return path;
	}

	async function create(form: ExpenseFormState, file: File | null): Promise<boolean> {
		const amount = validAmount(form);
		if (amount === null) return false;

		return mutate(async () => {
			const {
				data: { user },
			} = await supabase.auth.getUser();
			const receipt_url = file ? await uploadReceipt(file) : null;

			const { data, error: insertErr } = await supabase
				.from("expenses")
				.insert({
					// Both load-bearing: chk_operational_expense_has_no_job rejects a job here.
					job_id: null,
					expense_type: "operational",
					category: form.category,
					description: form.note.trim() || null,
					amount,
					incurred_at: form.date,
					receipt_url,
					logged_by: user?.id ?? null,
				})
				.select(OPERATIONAL_EXPENSE_COLUMNS)
				.single<OperationalExpense>();
			if (insertErr) throw insertErr;

			setExpenses((prev) => [data, ...prev].sort(byNewest));
		});
	}

	async function update(id: string, form: ExpenseFormState): Promise<boolean> {
		const amount = validAmount(form);
		if (amount === null) return false;

		return mutate(async () => {
			const { data, error: updateErr } = await supabase
				.from("expenses")
				.update({
					amount,
					category: form.category,
					description: form.note.trim() || null,
					incurred_at: form.date,
				})
				.eq("id", id)
				.select(OPERATIONAL_EXPENSE_COLUMNS)
				.single<OperationalExpense>();
			if (updateErr) throw updateErr;

			setExpenses((prev) => prev.map((e) => (e.id === id ? data : e)).sort(byNewest));
		});
	}

	async function remove(id: string): Promise<boolean> {
		const target = expenses.find((e) => e.id === id);
		return mutate(async () => {
			const { error: delErr } = await supabase.from("expenses").delete().eq("id", id);
			if (delErr) throw delErr;
			if (target?.receipt_url) {
				await supabase.storage.from("receipts").remove([receiptStoragePath(target.receipt_url)]);
			}
			setExpenses((prev) => prev.filter((e) => e.id !== id));
		});
	}

	return { supabase, expenses, create, update, remove, saving, error, setError, isPending };
}
