import type { Metadata } from "next";
import { ObfuscatedEmail } from "@/components/ui";

export const metadata: Metadata = {
	title: "Privacy Policy — Indo Mover",
};

export default function PrivacyPage() {
	return (
		<main className="min-h-screen bg-background px-4 py-12">
			<div className="mx-auto max-w-2xl space-y-8">
				<div>
					<h1 className="text-3xl font-bold text-ink">Indo Mover — Privacy Policy</h1>
					<p className="mt-2 text-sm text-ink-muted">Last updated: October 2026</p>
				</div>

				<div className="bg-surface rounded-xl border border-line p-8 space-y-6 text-sm text-ink leading-relaxed">
					<section className="space-y-2">
						<h2 className="font-semibold text-base">About this application</h2>
						<p>
							Indo Mover (“IM Ops”) is a private, internal operations platform used exclusively by
							authorised personnel of Indo Mover, a moving services company based in Semarang,
							Indonesia. It is not a public-facing service and does not accept sign-ups from the
							general public. This policy explains what data the platform collects, how it is used,
							how long it is kept, and the choices available to you.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Data we collect</h2>
						<p>The platform collects and stores the following categories of data:</p>
						<ul className="list-disc pl-5 space-y-1">
							<li>
								<strong>Account data</strong> — when you sign in with Google, we store your Google
								account email address and display name to identify you within the platform. No other
								personal data is collected from your Google account.
							</li>
							<li>
								<strong>Business operations data</strong> — customer and lead contact details,
								estimates, proposals, invoices, payments, expenses, job schedules, crew and fleet
								records, and related notes you enter while using the platform.
							</li>
							<li>
								<strong>Marketing analytics data</strong> — aggregated, non-personal performance
								data for our public website (indo-mover.com) retrieved from Google Search Console,
								Google Analytics 4, and Google Ads: search queries, page URLs, impressions, clicks,
								sessions, conversions, and advertising spend. This data does not identify individual
								end users of the public website.
							</li>
						</ul>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">How we use data</h2>
						<p>
							All data is used solely to operate the business internally: managing leads and
							removals jobs, invoicing and accounting, crew scheduling, and measuring the
							performance of our marketing (website search performance and advertising campaigns).
							We do not use your data to train machine-learning models, and we do not build profiles
							of end users of the public website.
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
						<h2 className="font-semibold text-base">Other Google API integrations</h2>
						<p>
							The platform accesses additional Google services in read-only fashion to display
							marketing performance data to authorised users:
						</p>
						<ul className="list-disc pl-5 space-y-1">
							<li>
								<strong>Google Search Console</strong> — read-only access via a dedicated service
								account (scope{" "}
								<code className="bg-line px-1 rounded text-xs">
									https://www.googleapis.com/auth/webmasters.readonly
								</code>
								) to retrieve search-query and page performance data for indo-mover.com.
							</li>
							<li>
								<strong>Google Analytics 4</strong> — read-only access (scope{" "}
								<code className="bg-line px-1 rounded text-xs">
									https://www.googleapis.com/auth/analytics.readonly
								</code>
								) to retrieve aggregated website traffic and conversion metrics.
							</li>
							<li>
								<strong>Google Ads</strong> — read-only access to advertising campaign performance
								data (impressions, clicks, cost, conversions) for campaigns run by Indo Mover.
							</li>
						</ul>
						<p>
							Data obtained from these services is stored only as aggregated daily metrics in our
							database, is used exclusively for internal reporting and analysis, and is never shared
							with third parties. Access tokens and credentials for these integrations are held
							exclusively in server-side environment variables and are never exposed to the browser.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">AI-generated insights</h2>
						<p>
							The platform can send aggregated, non-personal marketing metrics (for example: weekly
							totals of clicks, sessions, advertising spend, and jobs closed) to Google’s Gemini API
							to generate internal business recommendations. These requests contain no customer
							personal data, no end-user identifiers, and no OAuth credentials.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">How we store data</h2>
						<p>
							All application data is stored in a Supabase (PostgreSQL) database. Access is
							restricted to authenticated users and protected by row-level security policies.
							Background integrations use a separately stored service-role credential that is never
							exposed to the browser. Data in transit is encrypted via HTTPS.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Data retention and deletion</h2>
						<p>
							Business and analytics data is retained for as long as the account remains active for
							internal operations and reporting. You may request deletion of your personal data or
							revocation of platform access at any time by contacting the administrator (see Contact
							below); we will remove your account data within 30 days, except where retention is
							required by Indonesian tax and accounting regulations for financial records (invoices
							and payments).
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Your rights</h2>
						<p>
							As a user of the platform you may request access to, correction of, or deletion of
							your personal data, and may withdraw consent for the Google Calendar integration at
							any time via{" "}
							<a
								href="https://myaccount.google.com/permissions"
								target="_blank"
								rel="noopener noreferrer"
								className="underline text-ink-muted hover:text-ink"
							>
								Google Account permissions
							</a>
							. Requests are handled by the platform administrator.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Third-party sharing</h2>
						<p>
							We do not sell, trade, or transfer your data to any third party. Data is shared only
							with the infrastructure and service providers necessary to operate the platform:
							Supabase (database hosting), Vercel (application hosting), Google APIs (calendar sync,
							analytics data), and Google’s Gemini API (aggregated marketing insights, no personal
							data). Each provider processes data only on our behalf.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Changes to this policy</h2>
						<p>
							We may update this policy as the platform evolves. The “Last updated” date above
							reflects the current version. Continued use of the platform after changes take effect
							constitutes acceptance of the updated policy.
						</p>
					</section>

					<section className="space-y-2">
						<h2 className="font-semibold text-base">Contact</h2>
						<p>
							For any questions about this policy, contact the platform administrator at{" "}
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
