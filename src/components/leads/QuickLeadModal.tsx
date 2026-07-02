"use client";

import { Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import { CUSTOMER_PREFIX_OPTIONS, type CustomerPrefix } from "@/lib/constants";
import {
	type CustomerDuplicate,
	findDuplicateCustomer,
	formatCustomerLabel,
} from "@/lib/customerDuplicates";
import { createClient } from "@/lib/supabase/client";
import { capitalizeWords, cn, formatCustomerName } from "@/lib/utils";

type Customer = CustomerDuplicate;

const EMPTY = {
	customer_id: "",
	prefix: "",
	name: "",
	phone: "",
	pickup_address: "",
	destination_address: "",
	destination_address_2: "",
	preferred_date: "",
	lead_type: "whatsapp",
	origin_channel: "whatsapp",
	notes: "",
};

/**
 * Global fast lead-capture sheet. Opened from anywhere via the
 * `imops:new-lead` window event (top-bar "New" button + mobile ＋ sheet).
 */
export function QuickLeadModal() {
	const router = useRouter();
	const t = useTranslations("forms.lead");
	const tCustomerForm = useTranslations("forms.customer");
	const tButtons = useTranslations("common.buttons");
	const tLeadType = useTranslations("entity.leadType");
	const tChannel = useTranslations("entity.originChannel");

	const [open, setOpen] = useState(false);
	const [form, setForm] = useState(EMPTY);
	const [showDestination2, setShowDestination2] = useState(false);
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Combobox state
	const [query, setQuery] = useState("");
	const [comboOpen, setComboOpen] = useState(false);
	const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
	const [newMode, setNewMode] = useState(false);
	const comboRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open && !selectedCustomer && !newMode) searchRef.current?.focus();
	}, [open, selectedCustomer, newMode]);

	const close = useCallback(() => {
		setOpen(false);
		setError(null);
	}, []);

	useEffect(() => {
		function onOpen() {
			setForm(EMPTY);
			setShowDestination2(false);
			setQuery("");
			setComboOpen(false);
			setSelectedCustomer(null);
			setNewMode(false);
			setError(null);
			setOpen(true);
		}
		window.addEventListener("imops:new-lead", onOpen);
		return () => window.removeEventListener("imops:new-lead", onOpen);
	}, []);

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				if (comboOpen) setComboOpen(false);
				else close();
			}
		}
		window.addEventListener("keydown", onKey);
		document.body.style.overflow = "hidden";
		const supabase = createClient();
		supabase
			.from("customers")
			.select("id, prefix, name, phone")
			.order("name")
			.limit(200)
			.then(({ data }) => setCustomers(data ?? []));
		return () => {
			window.removeEventListener("keydown", onKey);
			document.body.style.overflow = "";
		};
	}, [open, close, comboOpen]);

	useEffect(() => {
		function onClickOutside(e: MouseEvent) {
			if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
				setComboOpen(false);
			}
		}
		document.addEventListener("mousedown", onClickOutside);
		return () => document.removeEventListener("mousedown", onClickOutside);
	}, []);

	function set<K extends keyof typeof form>(key: K, value: string) {
		setForm((prev) => ({ ...prev, [key]: value }));
	}

	const filtered = query.trim()
		? customers.filter((c) => {
				const q = query.toLowerCase();
				return c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q);
			})
		: customers.slice(0, 8);

	function selectExisting(customer: Customer) {
		setSelectedCustomer(customer);
		setForm((prev) => ({ ...prev, customer_id: customer.id, prefix: "", name: "", phone: "" }));
		setQuery("");
		setComboOpen(false);
		setNewMode(false);
	}

	function selectNew() {
		setSelectedCustomer(null);
		setForm((prev) => ({
			...prev,
			customer_id: "",
			prefix: "",
			name: capitalizeWords(query.trim()),
			phone: "",
		}));
		setQuery("");
		setComboOpen(false);
		setNewMode(true);
	}

	function clearCustomer() {
		setSelectedCustomer(null);
		setNewMode(false);
		setForm((prev) => ({ ...prev, customer_id: "", name: "", phone: "" }));
		setQuery("");
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSaving(true);
		try {
			const supabase = createClient();
			let customerId = form.customer_id;

			if (!customerId) {
				if (!form.name.trim()) throw new Error(t("nameRequired"));
				const { data: currentCustomers, error: customersErr } = await supabase
					.from("customers")
					.select("id, prefix, name, phone");
				if (customersErr) throw customersErr;
				const duplicateCustomer = findDuplicateCustomer(currentCustomers ?? [], {
					name: form.name,
					phone: form.phone,
				});
				if (duplicateCustomer) {
					throw new Error(
						`Customer already exists: ${formatCustomerLabel(duplicateCustomer)}. Please search and select them instead.`,
					);
				} else {
					const { data: cust, error: custErr } = await supabase
						.from("customers")
						.insert({
							prefix: (form.prefix as CustomerPrefix) || null,
							name: form.name.trim(),
							phone: form.phone.trim() || null,
						})
						.select("id")
						.single();
					if (custErr) throw custErr;
					customerId = cust.id;
				}
			}

			const { data: lead, error: leadErr } = await supabase
				.from("leads")
				.insert({
					customer_id: customerId,
					pickup_address: form.pickup_address.trim() || null,
					destination_address: form.destination_address.trim() || null,
					destination_address_2: form.destination_address_2.trim() || null,
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

				<form onSubmit={handleSubmit} className="space-y-4" noValidate autoComplete="off">
					{/* ── Customer: search → pick existing or create new ── */}
					<Field label={t("customer")} htmlFor="ql_customer_search" required>
						{selectedCustomer ? (
							<div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-line-strong bg-surface">
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium text-ink truncate">
										{formatCustomerName(selectedCustomer.prefix, selectedCustomer.name)}
									</p>
									{selectedCustomer.phone && (
										<p className="text-xs text-ink-faint">{selectedCustomer.phone}</p>
									)}
								</div>
								<button
									type="button"
									onClick={clearCustomer}
									className="text-xs text-primary-text hover:underline shrink-0"
								>
									{t("changeCustomer")}
								</button>
							</div>
						) : newMode ? (
							<div className="space-y-3">
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
									<Field label={tCustomerForm("prefix")} htmlFor="ql_prefix">
										<Select
											id="ql_prefix"
											value={form.prefix}
											onChange={(e) => set("prefix", e.target.value)}
										>
											<option value="">{tCustomerForm("prefixNone")}</option>
											{CUSTOMER_PREFIX_OPTIONS.map((p) => (
												<option key={p} value={p}>
													{p}.
												</option>
											))}
										</Select>
									</Field>
									<Field label={t("name")} htmlFor="ql_name" required>
										<Input
											id="ql_name"
											autoFocus
											value={form.name}
											onChange={(e) => set("name", capitalizeWords(e.target.value))}
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
								<button
									type="button"
									onClick={clearCustomer}
									className="text-xs text-ink-faint hover:text-ink hover:underline"
								>
									← {t("searchInstead")}
								</button>
							</div>
						) : (
							<div ref={comboRef} className="relative">
								<Search
									size={15}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
									aria-hidden="true"
								/>
								<input
									ref={searchRef}
									id="ql_customer_search"
									autoComplete="off"
									placeholder={t("searchPlaceholder")}
									value={query}
									onChange={(e) => {
										setQuery(e.target.value);
										setComboOpen(true);
									}}
									onFocus={() => setComboOpen(true)}
									className={cn(
										"w-full rounded-lg border border-line-strong bg-surface pl-8 pr-3 py-2 text-sm text-ink",
										"placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent",
									)}
								/>
								{comboOpen && (
									<div
										role="listbox"
										className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-surface shadow-token-md overflow-hidden max-h-52 overflow-y-auto"
									>
										{filtered.map((c) => (
											<button
												key={c.id}
												type="button"
												role="option"
												aria-selected={false}
												onClick={() => selectExisting(c)}
												className="w-full text-left px-3 py-2 text-sm hover:bg-subtle"
											>
												<span className="font-medium text-ink">
													{formatCustomerName(c.prefix, c.name)}
												</span>
												{c.phone && <span className="text-ink-faint ml-2">{c.phone}</span>}
											</button>
										))}
										<button
											type="button"
											role="option"
											aria-selected={false}
											onClick={selectNew}
											className={cn(
												"w-full text-left px-3 py-2 text-sm text-primary-text hover:bg-subtle flex items-center gap-1.5",
												filtered.length > 0 && "border-t border-line",
											)}
										>
											<Plus size={14} aria-hidden="true" />
											{query.trim()
												? t("createNamed", { name: query.trim() })
												: t("createNewCustomer")}
										</button>
									</div>
								)}
							</div>
						)}
					</Field>

					{/* ── Addresses ── */}
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<Field label={t("pickup")} htmlFor="ql_pickup">
							<Textarea
								id="ql_pickup"
								rows={3}
								value={form.pickup_address}
								onChange={(e) => set("pickup_address", e.target.value.toUpperCase())}
								className="uppercase"
							/>
						</Field>
						<Field label={t("destination")} htmlFor="ql_dest">
							<Textarea
								id="ql_dest"
								rows={3}
								value={form.destination_address}
								onChange={(e) => set("destination_address", e.target.value.toUpperCase())}
								className="uppercase"
							/>
						</Field>
					</div>

					{showDestination2 ? (
						<Field label={t("destination2")} htmlFor="ql_dest2">
							<Textarea
								id="ql_dest2"
								rows={3}
								value={form.destination_address_2}
								onChange={(e) => set("destination_address_2", e.target.value.toUpperCase())}
								className="uppercase"
							/>
							<button
								type="button"
								onClick={() => {
									setShowDestination2(false);
									set("destination_address_2", "");
								}}
								className="mt-1 text-xs text-ink-faint hover:text-danger transition-colors"
							>
								{t("removeDestination2")}
							</button>
						</Field>
					) : (
						<button
							type="button"
							onClick={() => setShowDestination2(true)}
							className="text-sm text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded"
						>
							+ {t("addDestination2")}
						</button>
					)}

					{/* ── Date + Type + Channel ── */}
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

					{/* ── Notes ── */}
					<Field label={t("notes")} htmlFor="ql_notes">
						<Textarea
							id="ql_notes"
							rows={2}
							value={form.notes}
							onChange={(e) => set("notes", e.target.value)}
						/>
					</Field>

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
