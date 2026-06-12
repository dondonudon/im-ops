"use client";

import { ChevronDown, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Customer = { id: string; name: string; phone: string | null };

const EMPTY = {
	customer_id: "",
	name: "",
	phone: "",
	pickup_address: "",
	destination_address: "",
	preferred_date: "",
	lead_type: "whatsapp",
	origin_channel: "whatsapp",
	notes: "",
};

/**
 * Global fast lead-capture sheet. Opened from anywhere via the
 * `imops:new-lead` window event (top-bar "New" button + mobile ＋ sheet).
 * Essentials only; advanced fields are collapsed behind "Add details".
 */
export function QuickLeadModal() {
	const router = useRouter();
	const t = useTranslations("forms.lead");
	const tButtons = useTranslations("common.buttons");
	const tLeadType = useTranslations("entity.leadType");
	const tChannel = useTranslations("entity.originChannel");

	const [open, setOpen] = useState(false);
	const [details, setDetails] = useState(false);
	const [form, setForm] = useState(EMPTY);
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const close = useCallback(() => {
		setOpen(false);
		setError(null);
	}, []);

	// Open via global event; reset state each time it opens.
	useEffect(() => {
		function onOpen() {
			setForm(EMPTY);
			setDetails(false);
			setError(null);
			setOpen(true);
		}
		window.addEventListener("imops:new-lead", onOpen);
		return () => window.removeEventListener("imops:new-lead", onOpen);
	}, []);

	// Esc to close; lock body scroll while open.
	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") close();
		}
		window.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		// Lazy-load customers for the optional "link existing" picker.
		const supabase = createClient();
		supabase
			.from("customers")
			.select("id, name, phone")
			.order("name")
			.then(({ data }) => setCustomers(data ?? []));
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [open, close]);

	function set<K extends keyof typeof form>(key: K, value: string) {
		setForm((prev) => ({ ...prev, [key]: value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSaving(true);
		try {
			const supabase = createClient();
			let customerId = form.customer_id;

			// Default path: create a new customer from name (+ phone).
			if (!customerId) {
				if (!form.name.trim()) throw new Error(t("nameRequired"));
				const { data: cust, error: custErr } = await supabase
					.from("customers")
					.insert({
						name: form.name.trim(),
						phone: form.phone.trim() || null,
					})
					.select("id")
					.single();
				if (custErr) throw custErr;
				customerId = cust.id;
			}

			const { data: lead, error: leadErr } = await supabase
				.from("leads")
				.insert({
					customer_id: customerId,
					pickup_address: form.pickup_address.trim() || null,
					destination_address: form.destination_address.trim() || null,
					preferred_date: form.preferred_date || null,
					lead_type: form.lead_type as "whatsapp" | "onsite" | "returning" | "corporate",
					origin_channel: form.origin_channel as "whatsapp" | "call" | "referral" | "walkin",
					notes: form.notes.trim() || null,
					status: "new",
				})
				.select("id")
				.single();
			if (leadErr) throw leadErr;

			setOpen(false);
			router.push(`/leads/${lead.id}`);
		} catch (err: unknown) {
			if (err instanceof Error) {
				setError(err.message);
			} else if (err && typeof err === "object" && "message" in err) {
				setError(String((err as { message: unknown }).message));
			} else {
				setError(t("nameRequired"));
			}
		} finally {
			setSaving(false);
		}
	}

	if (!open) return null;

	const usingExisting = Boolean(form.customer_id);

	return (
		<div
			className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
			role="dialog"
			aria-modal="true"
			aria-labelledby="quick-lead-title"
		>
			<button
				type="button"
				aria-label={tButtons("close")}
				onClick={close}
				className="absolute inset-0 bg-black/50 backdrop-blur-sm"
			/>
			<div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-surface border border-line rounded-t-2xl sm:rounded-2xl shadow-token-md p-5 animate-fade-in-up scrollbar-thin">
				<div className="flex items-center justify-between mb-4">
					<h2
						id="quick-lead-title"
						className="text-base font-semibold text-ink flex items-center gap-2"
					>
						<span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-subtle text-primary">
							<Plus size={16} aria-hidden="true" />
						</span>
						{t("newTitle")}
					</h2>
					<button
						type="button"
						onClick={close}
						aria-label={tButtons("close")}
						className="p-1.5 rounded-lg text-ink-faint hover:bg-subtle hover:text-ink"
					>
						<X size={18} aria-hidden="true" />
					</button>
				</div>

				{error && (
					<div className="mb-4">
						<FormError>{error}</FormError>
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-4" noValidate>
					{!usingExisting && (
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<Field label={t("name")} htmlFor="ql_name" required>
								<Input
									id="ql_name"
									autoFocus
									value={form.name}
									onChange={(e) => set("name", e.target.value)}
								/>
							</Field>
							<Field label={t("phone")} htmlFor="ql_phone">
								<Input
									id="ql_phone"
									type="tel"
									value={form.phone}
									onChange={(e) => set("phone", e.target.value)}
								/>
							</Field>
						</div>
					)}

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<Field label={t("pickup")} htmlFor="ql_pickup">
							<Textarea
								id="ql_pickup"
								rows={3}
								value={form.pickup_address}
								onChange={(e) => set("pickup_address", e.target.value)}
							/>
						</Field>
						<Field label={t("destination")} htmlFor="ql_dest">
							<Textarea
								id="ql_dest"
								rows={3}
								value={form.destination_address}
								onChange={(e) => set("destination_address", e.target.value)}
							/>
						</Field>
					</div>

					{/* Progressive disclosure */}
					<button
						type="button"
						onClick={() => setDetails((d) => !d)}
						className="flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline"
						aria-expanded={details}
					>
						<ChevronDown
							size={15}
							className={cn("transition-transform", details && "rotate-180")}
							aria-hidden="true"
						/>
						{t("addDetails")}
					</button>

					{details && (
						<div className="space-y-4 border-t border-line pt-4">
							<Field label={t("linkExisting")} htmlFor="ql_customer">
								<Select
									id="ql_customer"
									value={form.customer_id}
									onChange={(e) => set("customer_id", e.target.value)}
								>
									<option value="">{t("newCustomer")}</option>
									{customers.map((c) => (
										<option key={c.id} value={c.id}>
											{c.name}
											{c.phone ? ` (${c.phone})` : ""}
										</option>
									))}
								</Select>
							</Field>

							<Field label={t("preferredDate")} htmlFor="ql_date">
								<Input
									id="ql_date"
									type="date"
									value={form.preferred_date}
									onChange={(e) => set("preferred_date", e.target.value)}
									className="w-auto"
								/>
							</Field>

							<div className="grid grid-cols-2 gap-3">
								<Field label={t("leadType")} htmlFor="ql_type">
									<Select
										id="ql_type"
										value={form.lead_type}
										onChange={(e) => set("lead_type", e.target.value)}
									>
										{(["whatsapp", "onsite", "returning", "corporate"] as const).map((v) => (
											<option key={v} value={v}>
												{tLeadType(v)}
											</option>
										))}
									</Select>
								</Field>
								<Field label={t("originChannel")} htmlFor="ql_channel">
									<Select
										id="ql_channel"
										value={form.origin_channel}
										onChange={(e) => set("origin_channel", e.target.value)}
									>
										{(["whatsapp", "call", "referral", "walkin"] as const).map((v) => (
											<option key={v} value={v}>
												{tChannel(v)}
											</option>
										))}
									</Select>
								</Field>
							</div>

							<Field label={t("notes")} htmlFor="ql_notes">
								<Textarea
									id="ql_notes"
									rows={2}
									value={form.notes}
									onChange={(e) => set("notes", e.target.value)}
								/>
							</Field>
						</div>
					)}

					<div className="flex gap-3 pt-1">
						<Button type="submit" loading={saving} className="flex-1">
							{saving ? tButtons("saving") : t("createLead")}
						</Button>
						<Button type="button" variant="secondary" onClick={close}>
							{tButtons("cancel")}
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}
