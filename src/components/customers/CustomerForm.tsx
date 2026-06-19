"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useState } from "react";
import { Button, Field, FormError, Input, Select, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { capitalizeWords, mapDbError } from "@/lib/utils";

/**
 * Create / edit customer form.
 * @param customer - if provided, renders in edit mode with pre-filled values.
 */
const PREFIX_OPTIONS = ["Mr", "Ms", "Mrs", "Tn", "Ny", "Nn"] as const;
type Prefix = (typeof PREFIX_OPTIONS)[number];

export function CustomerForm({
	customer,
}: {
	customer?: {
		id: string;
		prefix: Prefix | null;
		name: string;
		phone: string | null;
		email: string | null;
		type: "individual" | "corporate";
		company_name: string | null;
		address: string | null;
		notes: string | null;
	};
}) {
	const router = useRouter();
	const t = useTranslations("forms.customer");
	const tButtons = useTranslations("common.buttons");
	const tActions = useTranslations("actions");
	const tCustomerType = useTranslations("entity.customerType");
	const isEdit = Boolean(customer);

	const [form, setForm] = useState({
		prefix: customer?.prefix ?? "",
		name: customer?.name ?? "",
		phone: customer?.phone ?? "",
		email: customer?.email ?? "",
		type: customer?.type ?? "individual",
		company_name: customer?.company_name ?? "",
		address: customer?.address ?? "",
		notes: customer?.notes ?? "",
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			const payload = {
				prefix: (form.prefix as Prefix) || null,
				name: form.name.trim(),
				phone: form.phone.trim() || null,
				email: form.email.trim() || null,
				type: form.type as "individual" | "corporate",
				company_name: form.company_name.trim() || null,
				address: form.address.trim() || null,
				notes: form.notes.trim() || null,
			};

			if (isEdit && customer) {
				const { error: err } = await supabase
					.from("customers")
					.update(payload)
					.eq("id", customer.id);
				if (err) throw err;
				router.push(`/customers/${customer.id}`);
			} else {
				const { data, error: err } = await supabase
					.from("customers")
					.insert(payload)
					.select("id")
					.single();
				if (err) throw err;
				router.push(`/customers/${data.id}`);
			}
		} catch (err: unknown) {
			setError(mapDbError(err));
		} finally {
			setSaving(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-5 max-w-lg" noValidate>
			{error && <FormError>{error}</FormError>}

			<Field label={t("prefix")} htmlFor="prefix">
				<Select id="prefix" name="prefix" value={form.prefix} onChange={handleChange}>
					<option value="">{t("prefixNone")}</option>
					{PREFIX_OPTIONS.map((p) => (
						<option key={p} value={p}>
							{p}.
						</option>
					))}
				</Select>
			</Field>

			<Field label={t("fullName")} htmlFor="name" required>
				<Input
					id="name"
					name="name"
					type="text"
					required
					value={form.name}
					onChange={(e) => setForm((prev) => ({ ...prev, name: capitalizeWords(e.target.value) }))}
					autoComplete="name"
				/>
			</Field>

			<Field label={t("type")} htmlFor="type">
				<Select id="type" name="type" value={form.type} onChange={handleChange}>
					<option value="individual">{tCustomerType("individual")}</option>
					<option value="corporate">{tCustomerType("corporate")}</option>
				</Select>
			</Field>

			{form.type === "corporate" && (
				<Field label={t("companyName")} htmlFor="company_name">
					<Input
						id="company_name"
						name="company_name"
						type="text"
						value={form.company_name}
						onChange={handleChange}
					/>
				</Field>
			)}

			<Field label={t("phone")} htmlFor="phone">
				<Input
					id="phone"
					name="phone"
					type="tel"
					value={form.phone}
					onChange={handleChange}
					autoComplete="tel"
					placeholder={t("phonePlaceholder")}
				/>
			</Field>

			<Field label={t("email")} htmlFor="email">
				<Input
					id="email"
					name="email"
					type="email"
					value={form.email}
					onChange={handleChange}
					autoComplete="email"
				/>
			</Field>

			<Field label={t("address")} htmlFor="address">
				<Textarea
					id="address"
					name="address"
					rows={3}
					value={form.address}
					onChange={(e) => {
						e.target.value = e.target.value.toUpperCase();
						handleChange(e);
					}}
					className="uppercase"
				/>
			</Field>

			<Field label={t("notes")} htmlFor="notes">
				<Textarea id="notes" name="notes" rows={3} value={form.notes} onChange={handleChange} />
			</Field>

			<div className="flex gap-3">
				<Button type="submit" loading={saving}>
					{saving
						? tButtons("saving")
						: isEdit
							? tButtons("saveChanges")
							: tActions("createCustomer")}
				</Button>
				<Button type="button" variant="secondary" onClick={() => router.back()}>
					{tButtons("cancel")}
				</Button>
			</div>
		</form>
	);
}
