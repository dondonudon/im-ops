import { getTranslations } from "next-intl/server";
import { VendorForm } from "@/components/vendors/VendorForm";

export default async function NewVendorPage() {
	const t = await getTranslations("forms.vendor");
	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-gray-900 dark:text-white">
				{t("newTitle")}
			</h1>
			<VendorForm />
		</div>
	);
}
