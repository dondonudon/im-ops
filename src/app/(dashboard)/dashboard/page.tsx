import { redirect } from "next/navigation";

/** The dashboard has been replaced by the redesigned /today screen. */
export default function DashboardPage() {
	redirect("/today");
}
