import { redirect } from "next/navigation";

/** Growth currently has a single screen; land on the SEO dashboard. */
export default function GrowthPage() {
	redirect("/growth/seo");
}
