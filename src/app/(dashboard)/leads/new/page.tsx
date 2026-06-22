"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useEffect, useState } from "react";
import { Button, Field, FormError, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { CUSTOMER_PREFIX_OPTIONS, type CustomerPrefix } from "@/lib/constants";
import {
	type CustomerDuplicate,
	findDuplicateCustomer,
	formatCustomerLabel,
} from "@/lib/customerDuplicates";
import { createClient } from "@/lib/supabase/client";

type Customer = CustomerDuplicate;

/**
 * Create new lead form.
 * Supports pre-selecting a customer via ?customer_id= query param.
 */
export default function NewLeadPage() {
	const router = useRouter();
	const sp = useSearchParams();
	const preselectedCustomerId = sp.get("customer_id");
	const t = useTranslations("forms.lead");
	const tCustomerForm = useTranslations("forms.customer");
	const tButtons = useTranslations("common.buttons");
	const tLeadType = useTranslations("entity.leadType");
	const tChannel = useTranslations("entity.originChannel");

	const [customers, setCustomers] = useState<Customer[]>([]);
	const [form, setForm] = useState({
		customer_id: preselectedCustomerId ?? "",
		pickup_address: "",
		destination_address: "",
		destination_address_2: "",
		preferred_date: "",
		lead_type: "whatsapp",
		origin_channel: "whatsapp",
		notes: "",
		// New customer inline fields
		new_customer_prefix: "",
		new_customer_name: "",
		new_customer_phone: "",
	});
	const [createNewCustomer, setCreateNewCustomer] = useState(!preselectedCustomerId);
	const [showDestination2, setShowDestination2] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const supabase = createClient();
		supabase
			.from("customers")
			.select("id, prefix, name, phone")
			.order("name")
			.then(({ data }) => setCustomers(data ?? []));
	}, []);

	function handleChange(
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
	) {
		setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setSaving(true);

		try {
			const supabase = createClient();
			let customerId = form.customer_id;

			// Create new customer if needed
			if (createNewCustomer) {
				if (!form.new_customer_name.trim()) throw new Error("Customer name is required.");
				const { data: currentCustomers, error: customersErr } = await supabase
					.from("customers")
					.select("id, prefix, name, phone");
				if (customersErr) throw customersErr;
				const duplicateCustomer = findDuplicateCustomer(currentCustomers ?? [], {
					name: form.new_customer_name,
					phone: form.new_customer_phone,
				});
				if (duplicateCustomer) {
					throw new Error(
						`Customer already exists: ${formatCustomerLabel(duplicateCustomer)}. Please select them from "Existing customer" instead.`,
					);
				} else {
					const { data: newCust, error: custErr } = await supabase
						.from("customers")
						.insert({
							prefix: (form.new_customer_prefix as CustomerPrefix) || null,
							name: form.new_customer_name.trim(),
							phone: form.new_customer_phone.trim() || null,
						})
						.select("id")
						.single();
					if (custErr) throw custErr;
					customerId = newCust.id;
				}
			} else {
				if (!customerId) throw new Error("Please select a customer.");
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

			router.push(`/leads/${lead.id}`);
			// Leave saving=true — button stays in loading state until navigation unmounts this page
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "An error occurred.");
			setSaving(false);
		}
	}

	return (
		<div className="space-y-6">
			<PageHeader title={t("newTitle")} />

			<form onSubmit={handleSubmit} className="space-y-5 max-w-lg" noValidate>
				{error && <FormError>{error}</FormError>}

				{/* Customer selection */}
				<fieldset className="space-y-3">
					<legend className="text-sm font-medium text-ink">{t("customer")}</legend>
					<div className="flex gap-4">
						<label className="flex items-center gap-2 text-sm text-ink">
							<input
								type="radio"
								name="customer_mode"
								checked={!createNewCustomer}
								onChange={() => setCreateNewCustomer(false)}
								className="text-primary"
							/>
							{t("existingCustomer")}
						</label>
						<label className="flex items-center gap-2 text-sm text-ink">
							<input
								type="radio"
								name="customer_mode"
								checked={createNewCustomer}
								onChange={() => setCreateNewCustomer(true)}
								className="text-primary"
							/>
							{t("newCustomer")}
						</label>
					</div>

					{createNewCustomer ? (
						<div className="space-y-3 pl-1">
							<Field label={tCustomerForm("prefix")} htmlFor="new_customer_prefix">
								<Select
									id="new_customer_prefix"
									name="new_customer_prefix"
									value={form.new_customer_prefix}
									onChange={handleChange}
								>
									<option value="">{tCustomerForm("prefixNone")}</option>
									{CUSTOMER_PREFIX_OPTIONS.map((p) => (
										<option key={p} value={p}>
											{p}.
										</option>
									))}
								</Select>
							</Field>
							<Field label={t("name")} htmlFor="new_customer_name" required>
								<Input
									id="new_customer_name"
									name="new_customer_name"
									type="text"
									value={form.new_customer_name}
									onChange={handleChange}
								/>
							</Field>
							<Field label={t("phone")} htmlFor="new_customer_phone">
								<Input
									id="new_customer_phone"
									name="new_customer_phone"
									type="tel"
									value={form.new_customer_phone}
									onChange={handleChange}
								/>
							</Field>
						</div>
					) : (
						<Select
							name="customer_id"
							value={form.customer_id}
							onChange={handleChange}
							aria-label="Select existing customer"
						>
							<option value="">— Select customer —</option>
							{customers.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
									{c.phone ? ` (${c.phone})` : ""}
								</option>
							))}
						</Select>
					)}
				</fieldset>

				{/* Addresses */}
				<Field label={t("pickup")} htmlFor="pickup_address">
					<Textarea
						id="pickup_address"
						name="pickup_address"
						rows={3}
						value={form.pickup_address}
						onChange={(e) => {
							e.target.value = e.target.value.toUpperCase();
							handleChange(e);
						}}
						className="uppercase"
					/>
				</Field>

				<Field label={t("destination")} htmlFor="destination_address">
					<Textarea
						id="destination_address"
						name="destination_address"
						rows={3}
						value={form.destination_address}
						onChange={(e) => {
							e.target.value = e.target.value.toUpperCase();
							handleChange(e);
						}}
						className="uppercase"
					/>
				</Field>

				{showDestination2 ? (
					<Field label={t("destination2")} htmlFor="destination_address_2">
						<Textarea
							id="destination_address_2"
							name="destination_address_2"
							rows={3}
							value={form.destination_address_2}
							onChange={(e) => {
								e.target.value = e.target.value.toUpperCase();
								handleChange(e);
							}}
							className="uppercase"
						/>
						<button
							type="button"
							onClick={() => {
								setShowDestination2(false);
								setForm((prev) => ({ ...prev, destination_address_2: "" }));
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

				<Field label={t("preferredDate")} htmlFor="preferred_date">
					<Input
						id="preferred_date"
						name="preferred_date"
						type="date"
						value={form.preferred_date}
						onChange={handleChange}
						className="w-auto"
					/>
				</Field>

				{/* Lead metadata */}
				<div className="grid grid-cols-2 gap-4">
					<Field label={t("leadType")} htmlFor="lead_type">
						<Select id="lead_type" name="lead_type" value={form.lead_type} onChange={handleChange}>
							{(["whatsapp", "onsite", "returning", "corporate"] as const).map((v) => (
								<option key={v} value={v}>
									{tLeadType(v)}
								</option>
							))}
						</Select>
					</Field>
					<Field label={t("originChannel")} htmlFor="origin_channel">
						<Select
							id="origin_channel"
							name="origin_channel"
							value={form.origin_channel}
							onChange={handleChange}
						>
							{(["whatsapp", "call", "referral", "walkin"] as const).map((v) => (
								<option key={v} value={v}>
									{tChannel(v)}
								</option>
							))}
						</Select>
					</Field>
				</div>

				<Field label={t("notes")} htmlFor="notes">
					<Textarea
						id="notes"
						name="notes"
						rows={3}
						value={form.notes}
						onChange={handleChange}
						className="resize-none"
					/>
				</Field>

				<div className="flex gap-3">
					<Button type="submit" loading={saving} variant="primary" size="md">
						{saving ? tButtons("saving") : t("createLead")}
					</Button>
					<Button type="button" onClick={() => router.back()} variant="secondary" size="md">
						{tButtons("cancel")}
					</Button>
				</div>
			</form>
		</div>
	);
}
