import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonStyles } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

/**
 * Public landing page — explains the app and links to sign-in.
 * Authenticated users are sent straight to /today.
 */
export default async function HomePage() {
	const supabase = await createClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (user) redirect("/today");

	return (
		<main className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
			<div className="w-full max-w-lg space-y-10 text-center">
				{/* Brand */}
				<div className="space-y-3">
					<h1 className="text-4xl font-bold text-ink">IM Operations</h1>
					<p className="text-lg text-ink-muted">Internal Operations Platform</p>
				</div>

				{/* Purpose */}
				<div className="bg-surface rounded-xl border border-line p-8 space-y-4 text-left">
					<h2 className="text-xl font-semibold text-ink">What is IM Operations?</h2>
					<p className="text-sm text-ink-muted leading-relaxed">
						IM Operations is a private, invite-only operations management platform for Indo
						Mover&apos;s moving and relocation business. It helps authorised staff manage daily
						jobs, crews, vehicles, leads, invoices, and expenses — all in one place.
					</p>
					<ul className="text-sm text-ink-muted space-y-2 list-disc list-inside">
						<li>Schedule and track moving jobs end-to-end</li>
						<li>Manage crew assignments and availability</li>
						<li>Handle invoicing, payments, and expenses</li>
						<li>Monitor fleet and equipment</li>
						<li>View pipeline and business reports</li>
					</ul>
				</div>

				{/* CTA */}
				<div className="space-y-4">
					<Link
						href="/login"
						className={buttonStyles({ size: "lg", className: "w-full max-w-xs mx-auto" })}
					>
						Sign In
					</Link>
					<p className="text-xs text-ink-muted">
						Access is restricted to authorised Indo Mover staff only.
					</p>
				</div>

				{/* Footer */}
				<p className="text-xs text-ink-muted">
					<Link href="/privacy" className="hover:underline">
						Privacy Policy
					</Link>
					{" · "}
					<Link href="/terms" className="hover:underline">
						Terms of Service
					</Link>
				</p>
			</div>
		</main>
	);
}
