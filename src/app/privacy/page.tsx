import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Privacy Policy — Indo Mover",
};

export default function PrivacyPage() {
	return (
		<main className="min-h-screen bg-background px-4 py-12">
			<div className="mx-auto max-w-2xl space-y-8">
				<div>
					<h1 className="text-3xl font-bold text-ink">Indo Mover — Privacy Policy</h1>
					<p className="mt-2 text-sm text-ink-muted">Last updated: June 2026</p>
				</div>

				<div className="bg-surface rounded-xl border border-line p-8 space-y-6 text-sm text-ink leading-relaxed">
					<section className="space-y-2">
						<h2 className="font-semibold text-base">About this application</h2>
						<p>
							Indo Mover is a private, internal operations platform used exclusively by authorised
							personnel. It is not a public-facing service and does not accept sign-ups from the
							general public.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Data we collect</h2>
						<p>
							When you sign in, we store your Google account email address and display name to
							identify you within the platform. No other personal data is collected from your Google
							account.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Google Calendar integration</h2>
						<p>
							With your authorisation, IM Ops creates, updates, and deletes events on a designated
							Google Calendar to reflect job schedules and surveys managed inside the platform.
						</p>
						<p>
							We request only the{" "}
							<code className="bg-line px-1 rounded text-xs">
								https://www.googleapis.com/auth/calendar
							</code>{" "}
							scope. Calendar data is used solely to keep that calendar in sync and is never shared
							with third parties or used for any other purpose.
						</p>
						<p>
							You can revoke access at any time via{" "}
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
						<h2 className="font-semibold text-base">How we store data</h2>
						<p>
							All application data is stored in a Supabase (PostgreSQL) database. Access is
							restricted to authenticated users and protected by row-level security policies. OAuth
							credentials used for calendar sync are held exclusively in server-side environment
							variables and are never exposed to the browser.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Third-party sharing</h2>
						<p>
							We do not sell, trade, or transfer your data to any third party. Data is shared only
							with the infrastructure providers necessary to operate the platform (Supabase for
							database hosting, Google APIs for calendar sync).
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Contact</h2>
						<p>
							For any questions about this policy, contact the platform administrator at{" "}
							<a
								href="mailto:alvianto.prasetyoeko@gmail.com"
								className="underline text-ink-muted hover:text-ink"
							>
								alvianto.prasetyoeko@gmail.com
							</a>
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
