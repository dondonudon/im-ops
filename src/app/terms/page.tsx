import type { Metadata } from "next";
import { ObfuscatedEmail } from "@/components/ui";

export const metadata: Metadata = {
	title: "Terms of Service — Indo Mover",
};

export default function TermsPage() {
	return (
		<main className="min-h-screen bg-background px-4 py-12">
			<div className="mx-auto max-w-2xl space-y-8">
				<div>
					<h1 className="text-3xl font-bold text-ink">Indo Mover — Terms of Service</h1>
					<p className="mt-2 text-sm text-ink-muted">Last updated: June 2026</p>
				</div>

				<div className="bg-surface rounded-xl border border-line p-8 space-y-6 text-sm text-ink leading-relaxed">
					<section className="space-y-2">
						<h2 className="font-semibold text-base">1. Acceptance</h2>
						<p>
							By accessing IM Ops you confirm that you are an authorised user and agree to use the
							platform only for its intended internal business purposes.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">2. Authorised use</h2>
						<p>
							IM Ops is a private internal tool. Access is granted by the platform administrator on
							an individual basis. You must not share your credentials, attempt to access data
							belonging to other users, or use the platform for any purpose outside of your
							authorised role.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">3. Google account and Calendar access</h2>
						<p>
							Signing in requires a Google account. By connecting your account you authorise IM Ops
							to create, update, and delete events on the designated operations calendar on your
							behalf. You can revoke this access at any time via{" "}
							<a
								href="https://myaccount.google.com/permissions"
								target="_blank"
								rel="noopener noreferrer"
								className="underline text-ink-muted hover:text-ink"
							>
								Google Account permissions
							</a>
							.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">4. Data responsibility</h2>
						<p>
							All data entered into IM Ops — jobs, surveys, customers, crew, and related records —
							is the responsibility of the authorised user who entered it. Do not store sensitive
							personal data beyond what is necessary for operational purposes.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">5. Availability</h2>
						<p>
							IM Ops is provided on a best-effort basis. There are no uptime guarantees. The
							administrator may suspend or terminate access at any time without notice.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">6. Changes</h2>
						<p>
							These terms may be updated at any time. Continued use of the platform after changes
							are posted constitutes acceptance of the revised terms.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">7. Contact</h2>
						<p>
							Questions about these terms can be directed to the platform administrator at{" "}
							<ObfuscatedEmail
								user="alvianto.prasetyoeko"
								domain="gmail.com"
								className="underline text-ink-muted hover:text-ink"
							/>
							.
						</p>
					</section>
				</div>

				<p className="text-center text-xs text-ink-muted">
					<a href="/" className="hover:underline">
						← Back to IM Ops
					</a>
				</p>
			</div>
		</main>
	);
}
