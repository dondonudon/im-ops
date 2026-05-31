import { getTranslations } from "next-intl/server";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { PageHeader } from "@/components/ui";

export default async function NewCustomerPage() {
	const t = await getTranslations("forms.customer");
	return (
		<div className="space-y-6">
			<PageHeader title={t("newTitle")} />
			<CustomerForm />
		</div>
	);
}
