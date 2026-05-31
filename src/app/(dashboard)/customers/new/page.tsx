import { getTranslations } from "next-intl/server";
import { CustomerForm } from "@/components/customers/CustomerForm";

export default async function NewCustomerPage() {
	const t = await getTranslations("forms.customer");
	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
				{t("newTitle")}
			</h1>
			<CustomerForm />
		</div>
	);
}
