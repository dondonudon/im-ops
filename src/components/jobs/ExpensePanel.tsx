"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useEffect, useState, useTransition } from "react";
import { NumericInput } from "@/components/shared/NumericInput";
import { Badge, Button, Card, CardHeader, Field, FormError, Input } from "@/components/ui";
import {
	enqueueExpense,
	flushQueue,
	isOfflineError,
	queuedCount,
	subscribe,
} from "@/lib/offline/expenseQueue";
import { createClient } from "@/lib/supabase/client";
import { formatRupiah, resizeImage } from "@/lib/utils";

type Expense = {
	id: string;
	category: string;
	description: string | null;
	amount: number;
	incurred_at: string;
	receipt_url: string | null;
};

const CATEGORIES: { value: string; key: string }[] = [
	{ value: "Food", key: "food" },
	{ value: "Labor", key: "labor" },
	{ value: "Packing materials", key: "packing_materials" },
	{ value: "Transport", key: "transport" },
	{ value: "Other", key: "other" },
];

const CATEGORY_KEY_BY_VALUE: Record<string, string> = CATEGORIES.reduce(
	(acc, c) => {
		acc[c.value] = c.key;
		return acc;
	},
	{} as Record<string, string>,
);

/**
 * Mobile-optimized expense entry panel.
 * Design target: < 5 seconds for a standard entry.
 */
export function ExpensePanel({
	jobId,
	expenses: initial,
	lockReason,
}: {
	jobId: string;
	expenses: Expense[];
	/** When set, edit/delete is disabled and this message is shown in the list. */
	lockReason: string | null;
}) {
	const router = useRouter();
	const tExpense = useTranslations("forms.expense");
	const tCommonButtons = useTranslations("common.buttons");
	const tCommonHints = useTranslations("common.hints");
	const tCommonErrors = useTranslations("common.errors");
	const tEntityCategory = useTranslations("entity.expenseCategory");
	const tOffline = useTranslations("offline");
	const tJobDetail = useTranslations("pages.jobDetail");
	const [isPending, startTransition] = useTransition();
	const [expenses, setExpenses] = useState(initial);
	const [form, setForm] = useState({
		amount: "",
		category: "Fuel",
		note: "",
		date: todayISO(),
	});
	const [saving, setSaving] = useState(false);
	const [receiptFile, setReceiptFile] = useState<File | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [showMore, setShowMore] = useState(false);
	const [pendingCount, setPendingCount] = useState(0);
	const [info, setInfo] = useState<string | null>(null);

	// Edit state
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState({ amount: "", category: "Fuel", note: "", date: "" });
	const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
	const [editReceiptRemove, setEditReceiptRemove] = useState(false);
	const [editSaving, setEditSaving] = useState(false);
	const [editError, setEditError] = useState<string | null>(null);

	// Delete state
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deleteInProgress, setDeleteInProgress] = useState(false);

	// Lightbox
	const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

	// Keep the pending badge in sync with the queue + auto-flush when back online.
	useEffect(() => {
		setPendingCount(queuedCount());
		const unsub = subscribe(() => setPendingCount(queuedCount()));
		const onOnline = async () => {
			const supabase = createClient();
			const result = await flushQueue(supabase);
			if (result.succeeded > 0) {
				setInfo(tOffline("syncedCount", { count: result.succeeded }));
				startTransition(() => router.refresh());
			}
		};
		window.addEventListener("online", onOnline);
		// Try one flush on mount in case we came back online before this view did.
		if (navigator.onLine) void onOnline();
		return () => {
			unsub();
			window.removeEventListener("online", onOnline);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tOffline, router.refresh]);

	function resetForm() {
		setForm({ amount: "", category: "Fuel", note: "", date: todayISO() });
		setReceiptFile(null);
	}

	function startEdit(expense: Expense) {
		setEditingId(expense.id);
		setEditForm({
			amount: String(expense.amount),
			category: expense.category,
			note: expense.description ?? "",
			date: expense.incurred_at,
		});
		setEditReceiptFile(null);
		setEditReceiptRemove(false);
		setEditError(null);
		setDeletingId(null);
	}

	function cancelEdit() {
		setEditingId(null);
		setEditReceiptFile(null);
		setEditReceiptRemove(false);
		setEditError(null);
	}

	async function handleUpdate(expenseId: string) {
		const amt = Number(editForm.amount);
		if (!amt || amt <= 0) {
			setEditError(tCommonErrors("amountMustBePositive"));
			return;
		}
		setEditSaving(true);
		setEditError(null);
		try {
			const supabase = createClient();
			const currentExpense = expenses.find((e) => e.id === expenseId);

			// Resolve receipt_url change: undefined = keep, null = remove, string = new url
			let receipt_url: string | null | undefined;

			if (editReceiptFile) {
				if (currentExpense?.receipt_url) {
					const oldPath = extractStoragePath(currentExpense.receipt_url);
					if (oldPath) await supabase.storage.from("receipts").remove([oldPath]);
				}
				const resized = await resizeImage(editReceiptFile);
				const path = `${jobId}/${Date.now()}.webp`;
				const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, resized);
				if (uploadErr) throw uploadErr;
				const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
				receipt_url = urlData.publicUrl;
			} else if (editReceiptRemove && currentExpense?.receipt_url) {
				const oldPath = extractStoragePath(currentExpense.receipt_url);
				if (oldPath) await supabase.storage.from("receipts").remove([oldPath]);
				receipt_url = null;
			}

			const { data, error: updateErr } = await supabase
				.from("expenses")
				.update({
					amount: amt,
					category: editForm.category,
					description: editForm.note.trim() || null,
					incurred_at: editForm.date,
					...(receipt_url !== undefined && { receipt_url }),
				})
				.eq("id", expenseId)
				.select("id, category, description, amount, incurred_at, receipt_url")
				.single();

			if (updateErr) throw updateErr;

			setExpenses((prev) => prev.map((e) => (e.id === expenseId ? (data as Expense) : e)));
			setEditingId(null);
			setEditReceiptFile(null);
			setEditReceiptRemove(false);
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			setEditError(err instanceof Error ? err.message : "Error");
		} finally {
			setEditSaving(false);
		}
	}

	async function handleDelete(expenseId: string) {
		setDeleteInProgress(true);
		try {
			const supabase = createClient();
			const { error: deleteErr } = await supabase.from("expenses").delete().eq("id", expenseId);
			if (deleteErr) throw deleteErr;
			setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
			setDeletingId(null);
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			// Surface delete error inline in the row
			setEditError(err instanceof Error ? err.message : "Error");
		} finally {
			setDeleteInProgress(false);
		}
	}

	function queueLocally(amt: number) {
		const entry = enqueueExpense({
			job_id: jobId,
			category: form.category,
			description: form.note.trim() || null,
			amount: amt,
			incurred_at: form.date,
		});
		// Render the queued expense in the list with a synthetic id so the
		// operator gets immediate feedback. It'll be replaced on next refresh
		// after a successful flush.
		setExpenses((p) => [
			{
				id: `pending:${entry.id}`,
				category: form.category,
				description: form.note.trim() || null,
				amount: amt,
				incurred_at: form.date,
				receipt_url: null,
			},
			...p,
		]);
		setInfo(tOffline("savedOffline"));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const amt = Number(form.amount);
		if (!amt || amt <= 0) {
			setError(tCommonErrors("amountMustBePositive"));
			return;
		}
		setSaving(true);
		setError(null);
		setInfo(null);

		// If we're already offline, queue immediately and skip the network try.
		// Receipt photos can't be queued — surface that so the operator can retry.
		if (typeof navigator !== "undefined" && navigator.onLine === false) {
			if (receiptFile) {
				setError(tOffline("removeReceiptToSave"));
				setSaving(false);
				return;
			}
			queueLocally(amt);
			resetForm();
			setSaving(false);
			return;
		}

		try {
			const supabase = createClient();
			let receipt_url: string | null = null;

			if (receiptFile) {
				const resized = await resizeImage(receiptFile);
				const path = `${jobId}/${Date.now()}.webp`;
				const { error: uploadErr } = await supabase.storage.from("receipts").upload(path, resized);
				if (uploadErr) throw uploadErr;
				const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
				receipt_url = urlData.publicUrl;
			}

			const { data, error: insertErr } = await supabase
				.from("expenses")
				.insert({
					job_id: jobId,
					category: form.category,
					description: form.note.trim() || null,
					amount: amt,
					incurred_at: form.date,
					receipt_url,
				})
				.select("id, category, description, amount, incurred_at, receipt_url")
				.single();

			if (insertErr) throw insertErr;

			setExpenses((p) => [data as Expense, ...p]);
			resetForm();
			startTransition(() => router.refresh());
		} catch (err: unknown) {
			if (isOfflineError(err) && !receiptFile) {
				queueLocally(amt);
				resetForm();
			} else {
				setError(err instanceof Error ? err.message : "Error");
			}
		} finally {
			setSaving(false);
		}
	}

	const total = expenses.reduce((s, e) => s + e.amount, 0);

	return (
		<>
			<div className="space-y-6">
				{/* Entry form — large touch targets for mobile */}
				<form onSubmit={handleSubmit} autoComplete="off">
					<Card className="p-5 space-y-4">
						<div className="flex items-center justify-between gap-3">
							<h2 className="text-base font-semibold text-ink">{tExpense("title")}</h2>
							{pendingCount > 0 && (
								<Badge tone="pending" dot>
									{tOffline("pendingSync", { count: pendingCount })}
								</Badge>
							)}
						</div>

						{info && (
							<div
								role="status"
								className="rounded bg-warning-bg border border-warning px-3 py-2 text-sm text-warning-text"
							>
								{info}
							</div>
						)}

						{error && <FormError>{error}</FormError>}

						{/* Amount — large input for thumb-friendly entry */}
						<div>
							<label htmlFor="exp-amount" className="block text-sm font-medium mb-1 text-ink">
								{tExpense("amountIdr")}{" "}
								<span aria-hidden="true" className="text-danger">
									*
								</span>
							</label>
							<NumericInput
								id="exp-amount"
								required
								autoFocus
								value={Number(form.amount) || 0}
								onChange={(v) => setForm((p) => ({ ...p, amount: v > 0 ? String(v) : "" }))}
								className="w-full rounded-lg border border-line-strong bg-surface px-4 py-4 text-2xl tabular-nums font-bold focus:outline-none focus:ring-2 focus:ring-[var(--ring)] text-right text-ink"
							/>
							{form.amount && Number(form.amount) > 0 && (
								<p className="text-xs text-ink-faint mt-1 text-right">
									{formatRupiah(Number(form.amount))}
								</p>
							)}
						</div>

						{/* Category chips */}
						<div>
							<span className="block text-sm font-medium mb-2 text-ink">
								{tExpense("category")}
							</span>
							<fieldset
								aria-label={tExpense("category")}
								className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap"
							>
								{CATEGORIES.map((c) => (
									<button
										key={c.value}
										type="button"
										onClick={() => setForm((p) => ({ ...p, category: c.value }))}
										aria-pressed={form.category === c.value}
										className={`last:col-span-2 sm:shrink-0 rounded-full min-h-[44px] px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
											form.category === c.value
												? "bg-primary text-primary-fg"
												: "bg-subtle text-ink-muted hover:bg-subtle hover:text-ink"
										}`}
									>
										{tEntityCategory(c.key)}
									</button>
								))}
							</fieldset>
						</div>

						<Button
							type="submit"
							disabled={saving || isPending}
							loading={saving}
							variant="primary"
							size="lg"
							className="w-full"
						>
							{saving ? tCommonButtons("saving") : tExpense("saveExpense")}
						</Button>

						{/* Secondary fields — toggle to keep critical path short */}
						<div>
							<button
								type="button"
								onClick={() => setShowMore((p) => !p)}
								aria-expanded={showMore}
								className="text-sm text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
							>
								{showMore ? `▲ ${tExpense("hideOptions")}` : `▼ ${tExpense("moreOptions")}`}
							</button>
							{showMore && (
								<div className="mt-3 space-y-3">
									<Field label={tExpense("note")} htmlFor="exp-note">
										<Input
											id="exp-note"
											type="text"
											value={form.note}
											onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
											placeholder="e.g. Jakarta–Bandung toll"
										/>
									</Field>
									<Field label={tExpense("date")} htmlFor="exp-date">
										<Input
											id="exp-date"
											type="date"
											value={form.date}
											onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
										/>
									</Field>
									<div>
										<label
											htmlFor="exp-receipt"
											className="block text-sm font-medium mb-1 text-ink"
										>
											{tExpense("receipt")}{" "}
											<span className="text-ink-faint font-normal">
												{tCommonHints("optionalParen")}
											</span>
										</label>
										<input
											id="exp-receipt"
											type="file"
											accept="image/*"
											onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
											className="block text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-text hover:file:opacity-80"
										/>
										{receiptFile && (
											<p className="text-xs text-ink-faint mt-1">{receiptFile.name}</p>
										)}
									</div>
								</div>
							)}
						</div>
					</Card>
				</form>

				{/* List */}
				<Card>
					<CardHeader
						title={tJobDetail("expenses")}
						action={
							<span className="tabular-nums text-sm font-bold text-ink">{formatRupiah(total)}</span>
						}
					/>
					{lockReason && (
						<div className="px-4 py-2.5 border-b border-line bg-subtle">
							<p className="text-xs text-ink-muted">{lockReason}</p>
						</div>
					)}
					{expenses.length === 0 && (
						<p className="px-4 py-6 text-center text-sm text-ink-faint">
							{tJobDetail("noExpenses")}
						</p>
					)}
					{expenses.map((e) => {
						const isPendingItem = e.id.startsWith("pending:");
						const isEditing = editingId === e.id;
						const isDeleting = deletingId === e.id;

						if (isEditing) {
							return (
								<div key={e.id} className="px-4 py-3 border-b border-line last:border-0 space-y-3">
									<p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
										{tExpense("editTitle")}
									</p>
									{editError && <FormError>{editError}</FormError>}

									{/* Edit amount */}
									<div>
										<label
											htmlFor={`edit-amount-${e.id}`}
											className="block text-sm font-medium mb-1 text-ink"
										>
											{tExpense("amountIdr")}
										</label>
										<NumericInput
											id={`edit-amount-${e.id}`}
											value={Number(editForm.amount) || 0}
											onChange={(v) =>
												setEditForm((p) => ({ ...p, amount: v > 0 ? String(v) : "" }))
											}
											className="w-full rounded-lg border border-line-strong bg-surface px-4 py-3 text-xl tabular-nums font-bold focus:outline-none focus:ring-2 focus:ring-[var(--ring)] text-right text-ink"
										/>
										{editForm.amount && Number(editForm.amount) > 0 && (
											<p className="text-xs text-ink-faint mt-1 text-right">
												{formatRupiah(Number(editForm.amount))}
											</p>
										)}
									</div>

									{/* Edit category chips */}
									<div>
										<span className="block text-sm font-medium mb-2 text-ink">
											{tExpense("category")}
										</span>
										<fieldset
											aria-label={tExpense("category")}
											className="flex gap-2 overflow-x-auto pb-0.5"
										>
											{CATEGORIES.map((c) => (
												<button
													key={c.value}
													type="button"
													onClick={() => setEditForm((p) => ({ ...p, category: c.value }))}
													aria-pressed={editForm.category === c.value}
													className={`shrink-0 rounded-full min-h-[44px] px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
														editForm.category === c.value
															? "bg-primary text-primary-fg"
															: "bg-subtle text-ink-muted hover:bg-subtle hover:text-ink"
													}`}
												>
													{tEntityCategory(c.key)}
												</button>
											))}
										</fieldset>
									</div>

									{/* Edit note and date */}
									<Field label={tExpense("note")} htmlFor={`edit-note-${e.id}`}>
										<Input
											id={`edit-note-${e.id}`}
											type="text"
											value={editForm.note}
											onChange={(ev) => setEditForm((p) => ({ ...p, note: ev.target.value }))}
										/>
									</Field>
									<Field label={tExpense("date")} htmlFor={`edit-date-${e.id}`}>
										<Input
											id={`edit-date-${e.id}`}
											type="date"
											value={editForm.date}
											onChange={(ev) => setEditForm((p) => ({ ...p, date: ev.target.value }))}
										/>
									</Field>

									{/* Receipt edit section */}
									<div>
										<label
											htmlFor="edit-receipt-upload"
											className="block text-sm font-medium mb-1 text-ink"
										>
											{tExpense("receipt")}{" "}
											<span className="text-ink-faint font-normal">
												{tCommonHints("optionalParen")}
											</span>
										</label>

										{/* Existing receipt — show when not removing and no new file selected */}
										{e.receipt_url && !editReceiptRemove && !editReceiptFile && (
											<div className="mb-2 rounded-lg overflow-hidden border border-line bg-subtle">
												<button
													type="button"
													onClick={() => setLightboxUrl(e.receipt_url)}
													className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
													aria-label={tExpense("viewReceipt")}
												>
													<Image
														src={e.receipt_url}
														alt={tExpense("viewReceipt")}
														width={600}
														height={400}
														className="w-full max-h-48 object-contain"
													/>
												</button>
												<div className="flex items-center gap-2 px-3 py-1.5">
													<span className="text-xs text-ink-faint flex-1">
														{tExpense("receipt")}
													</span>
													<button
														type="button"
														onClick={() => setEditReceiptRemove(true)}
														className="text-xs text-danger hover:underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
													>
														{tCommonButtons("remove")}
													</button>
												</div>
											</div>
										)}

										{/* Marked for removal — show undo option */}
										{e.receipt_url && editReceiptRemove && !editReceiptFile && (
											<div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-subtle">
												<span className="text-sm text-ink-faint line-through flex-1">
													{tExpense("receiptMarkedForRemoval")}
												</span>
												<button
													type="button"
													onClick={() => setEditReceiptRemove(false)}
													className="text-xs text-primary-text hover:underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
												>
													{tCommonButtons("cancel")}
												</button>
											</div>
										)}

										{/* File input — for adding or replacing */}
										<input
											id="edit-receipt-upload"
											type="file"
											accept="image/*"
											onChange={(ev) => {
												const file = ev.target.files?.[0] ?? null;
												setEditReceiptFile(file);
												if (file) setEditReceiptRemove(false);
											}}
											className="block text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-text hover:file:opacity-80"
										/>
										{editReceiptFile && (
											<p className="text-xs text-ink-faint mt-1">{editReceiptFile.name}</p>
										)}
									</div>

									<div className="flex gap-2 pt-1">
										<Button
											type="button"
											variant="primary"
											size="sm"
											loading={editSaving}
											disabled={editSaving}
											onClick={() => handleUpdate(e.id)}
										>
											{tCommonButtons("saveChanges")}
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={editSaving}
											onClick={cancelEdit}
										>
											{tCommonButtons("cancel")}
										</Button>
									</div>
								</div>
							);
						}

						return (
							<div
								key={e.id}
								className={`border-b border-line last:border-0 text-sm ${isPendingItem ? "bg-warning-bg" : ""}`}
							>
								<div className="flex items-start justify-between px-4 py-3 gap-3">
									<div className="flex items-start gap-3 min-w-0">
										{/* Receipt thumbnail */}
										{e.receipt_url && (
											<button
												type="button"
												onClick={() => setLightboxUrl(e.receipt_url)}
												aria-label={tExpense("viewReceipt")}
												className="shrink-0 rounded overflow-hidden border border-line w-10 h-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
											>
												<Image
													src={e.receipt_url}
													alt={tExpense("viewReceipt")}
													width={40}
													height={40}
													className="w-10 h-10 object-cover"
												/>
											</button>
										)}
										<div className="min-w-0">
											<span className="font-medium text-ink">
												{CATEGORY_KEY_BY_VALUE[e.category]
													? tEntityCategory(CATEGORY_KEY_BY_VALUE[e.category])
													: e.category}
											</span>
											{e.description && (
												<span className="text-ink-faint text-xs ml-2">{e.description}</span>
											)}
											<span className="block text-xs text-ink-faint">
												{e.incurred_at}
												{isPendingItem && (
													<span className="ml-1 text-warning-text">· {tOffline("pending")}</span>
												)}
											</span>
										</div>
									</div>
									<div className="flex items-center gap-3 shrink-0">
										<span className="tabular-nums font-medium text-ink">
											{formatRupiah(e.amount)}
										</span>
										{!isPendingItem && !lockReason && (
											<div className="flex gap-1">
												<button
													type="button"
													onClick={() => startEdit(e)}
													aria-label={tCommonButtons("edit")}
													className="p-1.5 rounded text-ink-faint hover:text-ink hover:bg-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
												>
													<PencilIcon />
												</button>
												<button
													type="button"
													onClick={() => {
														setDeletingId(e.id);
														setEditingId(null);
													}}
													aria-label={tCommonButtons("delete")}
													className="p-1.5 rounded text-ink-faint hover:text-danger hover:bg-danger-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
												>
													<TrashIcon />
												</button>
											</div>
										)}
									</div>
								</div>

								{/* Inline delete confirmation */}
								{isDeleting && (
									<div className="px-4 pb-3 flex items-center gap-3">
										<span className="text-xs text-ink-muted">{tExpense("deleteConfirm")}</span>
										<Button
											type="button"
											variant="danger"
											size="sm"
											loading={deleteInProgress}
											disabled={deleteInProgress}
											onClick={() => handleDelete(e.id)}
										>
											{tCommonButtons("delete")}
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={deleteInProgress}
											onClick={() => setDeletingId(null)}
										>
											{tCommonButtons("cancel")}
										</Button>
									</div>
								)}
							</div>
						);
					})}
				</Card>
			</div>
			{lightboxUrl && (
				<ReceiptLightbox
					url={lightboxUrl}
					onClose={() => setLightboxUrl(null)}
					label={tExpense("viewReceipt")}
					closeLabel={tCommonButtons("close")}
				/>
			)}
		</>
	);
}

function ReceiptLightbox({
	url,
	onClose,
	label,
	closeLabel,
}: {
	url: string;
	onClose: () => void;
	label: string;
	closeLabel: string;
}) {
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onClose]);

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label={label}
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
		>
			{/* Backdrop close */}
			<button
				type="button"
				className="absolute inset-0 w-full h-full cursor-default"
				aria-label={closeLabel}
				onClick={onClose}
			/>
			{/* Close button */}
			<button
				type="button"
				className="absolute top-4 right-4 z-10 text-white text-2xl leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
				onClick={onClose}
				aria-label={closeLabel}
			>
				✕
			</button>
			{/* Image — click does nothing; backdrop button handles close */}
			<div className="relative z-10 max-w-[90vw] max-h-[90vh]">
				<Image
					src={url}
					alt={label}
					width={800}
					height={1100}
					className="max-w-[90vw] max-h-[90vh] w-auto h-auto object-contain rounded shadow-2xl"
				/>
			</div>
		</div>
	);
}

function todayISO() {
	return new Date().toISOString().slice(0, 10);
}

function extractStoragePath(url: string): string | null {
	const marker = "/receipts/";
	const idx = url.indexOf(marker);
	return idx !== -1 ? url.slice(idx + marker.length) : null;
}

function PencilIcon() {
	return (
		<svg
			width="15"
			height="15"
			viewBox="0 0 15 15"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d="M11.854.146a.5.5 0 0 0-.707 0l-10 10a.5.5 0 0 0-.134.26l-.5 2.5a.5.5 0 0 0 .61.61l2.5-.5a.5.5 0 0 0 .26-.134l10-10a.5.5 0 0 0 0-.707l-2-2ZM11.5 1.207 13.793 3.5l-1 1L10.5 2.207l1-1ZM9.793 3 12.086 5.293 4.5 12.879l-2-.667-.667-2L9.793 3Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function TrashIcon() {
	return (
		<svg
			width="15"
			height="15"
			viewBox="0 0 15 15"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d="M5.5 1C5.224 1 5 1.224 5 1.5V2H2.5a.5.5 0 0 0 0 1H3v9.5A1.5 1.5 0 0 0 4.5 14h6a1.5 1.5 0 0 0 1.5-1.5V3h.5a.5.5 0 0 0 0-1H10v-.5C10 1.224 9.776 1 9.5 1h-4ZM6 2h3v-.001L9 2H6Zm-2 1h7v9.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5V3Zm2 2a.5.5 0 0 0-.5.5v5a.5.5 0 0 0 1 0v-5A.5.5 0 0 0 6 5Zm3 0a.5.5 0 0 0-.5.5v5a.5.5 0 0 0 1 0v-5A.5.5 0 0 0 9 5Z"
				fill="currentColor"
			/>
		</svg>
	);
}
