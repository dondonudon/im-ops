import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CustomerForm } from "@/components/customers/CustomerForm";

export default async function EditCustomerPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const supabase = await createClient();
	const t = await getTranslations("forms.customer");
	const { data: customer } = await supabase
		.from("customers")
		.select("*")
		.eq("id", id)
		.single();
	if (!customer) notFound();

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
				{t("editTitle")}
			</h1>
			<CustomerForm customer={customer} />
		</div>
	);
}
