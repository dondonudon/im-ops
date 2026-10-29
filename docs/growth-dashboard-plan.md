# IM Ops Growth Dashboard — Implementation Plan (GA4 + Google Ads + AI Advisor)

> Extends the shipped SEO dashboard (`docs/seo-dashboard-plan.md`, PRs 1–6) into a
> full **Growth** section: Google Search Console + Google Analytics 4 + Google Ads
> in one place, a unified funnel overview that joins marketing data with IM Ops
> business data (leads → jobs → revenue), and an AI "Growth Advisor" that turns
> deterministic signals into prioritized recommendations.

> **Status (2026-10-29): PLANNED — not started.** Phase 0 progress: Google Ads
> developer token **Basic access approved**; OAuth brand verification in
> progress (privacy policy expanded, awaiting re-verification).

---

## 1. Purpose & scope

The owner recently activated **Google Ads** and **Google Analytics 4** for the
public marketing site `indo-mover.com` (repo: `indomover`, a Vite/React SPA —
separate codebase, not touched by this plan). The Growth section should become
the single place to digest all three Google sources **plus** the business data
only IM Ops has.

**Decisions locked in with the owner:**

| Decision | Choice | Rationale |
|---|---|---|
| Ads ingestion | **Full Google Ads API from day one** | Zero ongoing maintenance; dev-token approval lead time runs in parallel while GA4 is built |
| AI provider | **Gemini (Google AI Studio API key)** | Same GCP project as existing credentials; free tier covers weekly digests; good `id` output; no new vendor |

**Naming note (carried from the SEO plan):** the dashboard measures the public
site **indo-mover.com**; the app is "IM Operations". Keep the distinction in UI
copy ("Ads performance for indo-mover.com", etc.).

**Explicitly in scope:** GA4 sync, Ads sync, `/growth/overview` funnel page,
`/growth/analytics` + `/growth/ads` tabs, Gemini advisor (manual trigger first).
**Explicitly out of scope:** per-lead campaign attribution (`utm_*` capture on
the indomover site + lead-intake fields) — still a separate cross-system project
(see §12b of the SEO plan); chat-style AI; automated bid changes.

---

## 2. Repo facts this plan relies on

- Verified against the repo on 2026-10-29.
- `google-auth-library@^10.7.0` installed; **no `googleapis` package** — all
  Google calls are raw `fetch` with bearer tokens. Keep it that way.
- GSC pipeline to mirror: `src/lib/search-console/` (`client.ts` service-account
  auth + normalized errors, `sync.ts` two-dataset partial-failure sync, cron +
  throttled manual refresh + backfill script).
- `SUPABASE_SERVICE_ROLE_KEY` containment rules already established (SEO plan
  §4): `admin.ts` is `server-only`; imported only by sync services, cron routes,
  and backfill scripts.
- Migrations: next number is **`016`**.
- Cron: `vercel.json` has one daily cron (`/api/cron/seo-sync`, `0 1 * * *`);
  routes gated by `CRON_SECRET` bearer, exempted in middleware under `/api/cron`.
- Timezone hard rule (SEO plan §7): server "today" is always
  `todayInJakarta()`; date params are plain `"YYYY-MM-DD"` strings; GSC-style
  delayed windows (10 → 3 days ago for GSC) with idempotent upserts.
- Money convention: BIGINT minor units (IDR). Ads `cost_micros` (millionths) is
  converted once at normalization time, stored BIGINT.
- i18n: default locale `id`; every string in **both** `src/messages/id.json`
  and `en.json`.
- Charts: no library; inline SVG client components (`YearlyProfitChart.tsx`
  pattern) on semantic tokens. No `dark:` variants, no raw colors.
- Nav: `Growth` is already a top-level section; `SectionTabs.tsx` has a Growth
  group with a single `seo` tab; `/growth` redirects to `/growth/seo`.
- No LLM/AI code exists anywhere in the repo — Phase 4 is net-new.

---

## 3. Architecture

```
indomover (Vite landing, separate repo)          im-ops (this repo)
────────────────────────────────────             ─────────────────────────────────────
  Google Ads ◄──┐   daily cron (01:00 UTC)        ads_campaign_daily   (new, 016)
  GA4       ◄───┤   same service-account /        ga4_daily            (new, 016)
  GSC   ◄───────┤   OAuth patterns as GSC         seo_*                (shipped)
                │                                        │
                │                 /growth/overview  ← funnel: impressions → clicks
                │                                       → sessions → leads → jobs → revenue
                │                 /growth/seo | /growth/analytics | /growth/ads
                │                                        │
                │                                        ▼
                │                 signals (deterministic, extended opportunities.ts)
                │                                        │
                │                                        ▼
                │                 Gemini Flash → growth_insights (cached, dated)
                │                                        │
                │                 "Generate insights" Server Action (throttled)
                └─ done —───────────────────────────────┘
```

Key principle carried over from the opportunities engine: **deterministic
signals first, AI second.** Gemini receives the signals plus compact aggregates
(never raw rows), and its output is stored, dated, and reviewable — it does not
compute metrics itself.

---

## 4. Phase 0 — External setup (owner track, start immediately)

Longest lead times first. Nothing in this section needs code.

1. **Google Ads developer token** — Google Ads account → Tools → API Center →
   apply (Basic access). Takes days. Blocks Phase 2 only.
2. **OAuth client + refresh token** — in the same GCP project as the existing
   service account: configure an OAuth consent screen, create an OAuth client,
   run the one-time consent flow (a tiny local script is acceptable) and mint a
   **refresh token**. The Ads API cannot use the plain service account for the
   owner's own Ads account without Workspace domain-wide delegation.
   Store: `ADS_CLIENT_ID`, `ADS_CLIENT_SECRET`, `ADS_REFRESH_TOKEN`,
   `ADS_CUSTOMER_ID` (the 10-digit account id, no dashes).
3. **GA4 property access** — GA4 Admin → Property Access Management → add the
   existing service account's `client_email` as **Viewer** (this is *not* Cloud
   IAM; same gotcha as GSC users in SEO plan §17). Record the **Property ID**
   (`GA4_PROPERTY_ID`). Enable the **Google Analytics Data API** in the Cloud
   project.
4. **Google Ads API** — enable in the Cloud project (blocks on the dev token
   for real calls; can be pre-enabled).
5. **Gemini API key** — AI Studio → create key → `GEMINI_API_KEY`. Free tier
   first; move to billing if quota becomes the limit.

New env vars for `.env.local.example` (all server-only, never `NEXT_PUBLIC_`):

```dotenv
# GA4 (same service account as GSC, added as Viewer on the property)
GA4_PROPERTY_ID=
GA4_SERVICE_ACCOUNT_KEY=        # may reuse GSC key if identical; separate var for clarity

# Google Ads (OAuth refresh token — service account alone cannot access Ads)
ADS_DEVELOPER_TOKEN=
ADS_CLIENT_ID=
ADS_CLIENT_SECRET=
ADS_REFRESH_TOKEN=
ADS_CUSTOMER_ID=

# Gemini (Growth Advisor)
GEMINI_API_KEY=
```

---

## 4b. Security model (extension of SEO plan §4)

Same containment rules, now covering three more sync paths:

- New lib modules (`src/lib/ga4/`, `src/lib/google-ads/`, `src/lib/ai/`) all
  start with `import "server-only"`.
- The admin (service-role) client may only be imported by the new sync
  services, their cron routes, and backfill scripts — same allowlist pattern.
- Secrets (refresh token, service-account JSON, Gemini key) are never logged,
  never in error messages, never in Client Component props.
- Dashboard reads use the normal authenticated server client + RLS.
- New `growth_insights` table: RLS enabled, `authenticated` may `SELECT`; the
  advisor writes via service role only.

---

## 5. Phase 1 — GA4 sync (mirror the GSC pattern)

### 5.1 Client — `src/lib/ga4/client.ts`

- Auth: identical `GoogleAuth` shape to `search-console/client.ts` (scope
  `https://www.googleapis.com/auth/analytics.readonly`).
- Endpoint:
  `POST https://analyticsdata.googleapis.com/v1beta/properties/{GA4_PROPERTY_ID}:runReport`
- Reports:
  - Dataset A: dimensions `["date","sessionDefaultChannelGroup"]`, metrics
    `["sessions","activeUsers","conversions","engagementRate"]`
  - Dataset B: dimensions `["date","sessionSource","sessionMedium"]`, same
    metrics — gives source/medium tables without buying a GA4 front end.
- GA4 Data API has a 3-day-ish finalization lag too; use `limit` pagination
  (10k rows/page, defensive cap) and the same delayed-window approach.
- Normalize errors into the same union style
  (`MISSING_CONFIGURATION | INVALID_CREDENTIALS | UNAUTHORIZED_PROPERTY |
  RATE_LIMITED | GOOGLE_API_ERROR | UNKNOWN`).

### 5.2 Schema — migration `016_add_growth_ga4.sql`

- `ga4_properties` (`property_id` text PK, label) — one row now, future-proofed.
- `ga4_daily` — PK `(property_id, metric_date, channel_group)`; columns:
  `sessions int`, `active_users int`, `conversions int`,
  `engagement_rate double precision`.
- `ga4_source_daily` — PK `(property_id, metric_date, source, medium)`.
- `ga4_sync_runs` — same shape as `seo_sync_runs`.
- RLS: authenticated `SELECT` only; writes via service role.
- Extend `src/lib/supabase/types.ts` (hand-maintained, per as-built notes).

### 5.3 Sync service + cron + backfill

- `src/lib/ga4/sync.ts` — lifecycle copied from `search-console/sync.ts`:
  `running` row → both datasets → `success` / `partial` / `failed`; batched
  idempotent upserts (~500); overlap + 30-min stale guard. A single GA4
  failure must never break the GSC cron run.
- Extend `runScheduledSync()` to loop GA4 after GSC (sequentially; each source
  independently try/caught and logged).
- Cron route: extend the existing daily cron rather than adding a second one —
  one `/api/cron/growth-sync` path would be cleaner long-term, but for this
  phase simply chain inside the existing `seo-sync` route and **rename later**
  if the combined runtime approaches the 60 s cap (one mover's data is tiny).
- Backfill: extend the local `tsx` script pattern with a `ga4:backfill`
  script; GA4 allows 90+ days easily. Start with 90 days.

### 5.4 UI — `/growth/analytics`

- `SectionTabs` Growth group gains an `analytics` tab; `/growth` keeps
  redirecting to `/growth/seo` for now (revisit in Phase 3).
- KPI cards (sessions, users, conversions, engagement rate, with
  previous-period deltas using the existing guard: `previous === 0` → "New"),
  channel breakdown table, source/medium table, daily sessions inline-SVG trend
  chart (reuse the chart pattern; gaps are not plotted as 0).
- i18n under a `pages.ga4.*` namespace in both message files.

---

## 6. Phase 2 — Google Ads sync

### 6.1 Client — `src/lib/google-ads/client.ts`

- Auth: OAuth2 refresh-token flow — `POST
  https://oauth2.googleapis.com/token` with `ADS_CLIENT_ID` +
  `ADS_CLIENT_SECRET` + `ADS_REFRESH_TOKEN` (+ `grant_type=refresh_token`).
  Cache the access token in module scope until expiry.
- Endpoint:
  `POST https://googleads.googleapis.com/v18/customers/{ADS_CUSTOMER_ID}/googleAds:searchStream`
  with GAQL:
  ```gaql
  SELECT campaign.id, campaign.name, segments.date,
         metrics.impressions, metrics.clicks, metrics.cost_micros,
         metrics.conversions
  FROM campaign
  WHERE segments.date BETWEEN '{start}' AND '{end}'
    AND campaign.status = 'ENABLED'
  ```
- `cost_micros` → IDR major units (÷ 1e6) → store BIGINT per repo money
  convention, converted exactly once at normalization.
- No pagination needed (`searchStream` streams all rows); normalize errors in
  the same union style.

### 6.2 Schema — migration `017_add_growth_ads.sql`

- `ads_customers` (`customer_id` text PK, label).
- `ads_campaign_daily` — PK `(customer_id, metric_date, campaign_id)`; columns:
  `campaign_name text`, `impressions int`, `clicks int`,
  `cost_idr bigint`, `conversions int`.
- `ads_sync_runs` — same shape as the other sync tables. RLS as in §5.2.

### 6.3 Sync, cron, backfill, UI

- `src/lib/google-ads/sync.ts` — same lifecycle; chained into the same daily
  cron as GA4.
- `ads:backfill` local script (Ads data is final when reported; still use a
  small overlap window for safety).
- `/growth/ads` tab: spend, clicks, impressions, conversions, average CPC
  (weighted: `Σcost / Σclicks`, never averaged per row), per-campaign table
  with previous-period deltas, spend trend chart.
- Landing-page reporting per campaign is deferred (needs ad final URLs — nice
  later, not now).

---

## 7. Phase 3 — `/growth/overview` — the funnel page

The page no external tool can produce: it joins Google marketing data with IM
Ops business data (leads, jobs, invoices).

### 7.1 Redirect & tabs

- `/growth` now redirects to `/growth/overview` (overview becomes the landing
  tab; update the §11 nav wiring from the SEO plan).
- Tabs: `Overview | SEO | Analytics | Ads`.

### 7.2 Funnel (period-matched, not user-level)

```
Impressions (GSC organic + Ads paid)   ← sum of the two, labeled separately
  → Clicks   (GSC clicks + Ads clicks)
  → Sessions (GA4)
  → Leads    (GA4 conversions AND/OR im-ops leads table)
  → Jobs     (im-ops)
  → Revenue  (im-ops trigger-derived invoice revenue — same math as /reports)
```

Honest framing: this is a **period funnel**, not per-user attribution (§12b of
the SEO plan still applies). Every stage shows its period totals + deltas;
joins are labeled by source. KPI cards: total spend, blended CPL,
**cost per closed job** (spend ÷ jobs won in period), revenue vs spend.

### 7.3 Cross-source signals — extend `opportunities.ts` pattern

New module `src/lib/growth/signals.ts` (pure functions, heavily unit-tested):
reuses the existing philosophy — structured output `{ type, priority, evidence,
metrics }`, conservative thresholds, never auto-act. Seed rules:

- **Paid vs organic overlap** — Ads pays for a keyword/query that GSC shows
  ranking page-one organically (evidence: keyword, position, ad spend).
- **Spend with no return** — campaign with ≥ N spend and 0 conversions in the
  period.
- **Traffic→lead gap** — landing page / channel with sessions ≥ threshold but
  no GA4 conversions (suggests page or offer problem, not traffic problem).
- **Rising spend, flat conversions** — week-over-week spend ↑, conversions flat.
- **Missing GA4 data** — sync gaps that would make the funnel misleading
  (data-quality signal; keeps the advisor honest).

---

## 8. Phase 4 — Growth Advisor (Gemini)

### 8.1 Module — `src/lib/ai/advisor.ts`

- `import "server-only"`. Calls
  `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=...`
  via raw `fetch` (no SDK — consistent with the repo).
- Input = compact JSON: period KPIs per source, the output of `signals.ts`
  (existing SEO opportunities + new cross-source signals), top-10 tables per
  source, and **business context** (jobs closed, revenue in period, target
  keywords). Deliberately excludes raw row dumps — keeps prompts small,
  cheap, and within free-tier quota.
- Prompt contract: respond in the dashboard locale (`id` default); JSON
  output validated against a zod-lite hand check; instructions to cite only
  numbers present in the input (no hallucinated metrics), and to prioritize by
  expected impact. Structured result per insight:
  `{ kind: "fix" | "double_down" | "stop_spend" | "watch", severity, title,
     body, signals_used[] }`.
- Failure mode: Gemini errors/timeouts are logged and surfaced as a neutral
  "advisor unavailable" state — **the dashboard never depends on the AI to be
  useful**.

### 8.2 Storage & trigger

- Migration `018_add_growth_insights.sql`: `growth_insights` —
  `id uuid`, `period_start date`, `period_end date`, `kind text`,
  `severity text`, `title text`, `body text`, `signals_used jsonb`,
  `model text`, `created_at timestamptz`; RLS authenticated-read.
- **Manual first:** "Generate insights" Server Action on `/growth/overview`,
  auth-checked, throttled (15-min, matching `refreshSeoData`), generates for
  the selected range, upserts (one set per period), `revalidatePath`.
- Weekly cron digest later (only after manual proves the prompt quality) —
  extend `vercel.json` with e.g. `/api/cron/growth-insights` `0 2 * * 1`.
- Retention: keep all insights; the panel shows latest per period with a
  history dropdown. Stored insights double as an audit trail of what the AI
  claimed vs what the data said.

---

## 9. i18n, UI conventions, navigation (summary of mandatory rules)

- Every string in **both** `id.json` and `en.json` (namespaces: `pages.ga4.*`,
  `pages.ads.*`, `pages.growthOverview.*`).
- Semantic tokens + `@/components/ui` kit only (`PageHeader`, `Card`, `Stat`,
  `Table` family, `Badge`, `EmptyState`, `StatusChip`/`toneFor`). No raw
  colors, no `dark:`.
- Charts: inline SVG client components receiving serializable props; missing
  days never plotted as 0.
- `BottomNav` unchanged; mobile Growth access stays in the overflow menu.
- Metric math rules carry over: aggregate CTR (never row-average),
  impression-weighted position, weighted CPC (`Σcost/Σclicks`), `previous === 0`
  → render "New".

---

## 10. Testing (focused, same philosophy as the SEO plan)

Unit tests in `src/lib/__tests__/` (Vitest), prioritizing pure logic:

- GA4 + Ads row normalization (key order, malformed rows skipped + counted,
  `cost_micros` conversion exactness for BIGINT).
- Funnel join logic (period matching, null/zero guards).
- New signal rules: threshold boundaries, no false positives below thresholds.
- Advisor prompt assembly: signals + aggregates correctly serialized; output
  validation rejects malformed AI JSON; no secrets in prompts (asserted).
- Client error paths via mocked `fetch` (401/403/429/malformed) for both new
  clients; OAuth token refresh path.
- Manual verification: dashboard totals vs GA4 UI and Ads UI for the same
  range; currency sanity on spend.

---

## 11. PR breakdown

| PR | Content |
|---|---|
| 1 | Env setup docs + `.env.local.example` additions; Phase 0 checklist completed by owner |
| 2 | Migration `016` (GA4 tables) + `ga4/` client + sync + backfill + tests |
| 3 | `/growth/analytics` tab + charts + i18n; cron chains GA4 |
| 4 | Migration `017` (Ads tables) + `google-ads/` client (OAuth) + sync + backfill + tests (requires dev token approved) |
| 5 | `/growth/ads` tab + i18n; `/growth` → `/growth/overview` redirect |
| 6 | `/growth/overview` funnel page + `signals.ts` cross-source rules + tests |
| 7 | Migration `018` (`growth_insights`) + `ai/advisor.ts` + manual "Generate insights" action + advisor panel + i18n |
| 8 | (Later, optional) weekly insights cron + insight history UI |

Phases 1–3 (PRs 2–3) are unblocked today; PR 4 waits on the Google dev token;
PR 7 is unblocked after PR 6 and needs only `GEMINI_API_KEY`.

---

## 12. Definition of Done (through PR 7)

- [ ] Phase 0 complete: dev token (Basic access) approved; refresh token minted;
      SA is Viewer on the GA4 property; APIs enabled; Gemini key created.
- [ ] Migrations `016`–`018` apply cleanly; RLS on; writes service-role only.
- [ ] GA4 + Ads syncs idempotent, logged, partial-failure-safe, chained into
      the daily cron without breaking the GSC path; backfills run locally.
- [ ] `/growth/analytics` and `/growth/ads` totals match the Google UIs for the
      same ranges; spend amounts round-trip BIGINT exactly.
- [ ] `/growth/overview` shows the six-stage funnel with labeled sources and
      cost-per-closed-job; works (with honest gaps) even when only GSC+GA4 have
      data.
- [ ] Cross-source signals unit-tested; no false positives below thresholds.
- [ ] Advisor generates, validates, stores, and renders insights; manual
      trigger throttled; graceful "advisor unavailable" state; insights are in
      `id` locale and cite only input numbers.
- [ ] i18n complete in both locales; semantic tokens only; dark mode automatic;
      `tsc` + Biome + `next build` + Vitest green; no secrets in any error,
      log, prompt, or client payload.

---

## 13. Risks & open questions

- **Google Ads API v18 + dev-token approval** is the schedule risk; the build
  order deliberately front-runs it (PRs 2–3, 6–7 don't need it).
- **Vercel cron budget:** chaining three syncs into one daily run should stay
  well under `maxDuration=60` at this data volume; revisit if not.
- **GA4 conversions require a key event to exist** (e.g. WhatsApp-click or
  form-submit marked as key event in GA4). Verify during Phase 0; without it,
  GA4 shows sessions but no conversions, and the funnel's Leads stage falls
  back to im-ops lead counts.
- **Funnel semantics are period totals, not attribution** — the UI must keep
  saying so (copy + docs) to avoid the owner over-reading joins.
- **Gemini free-tier quota:** fine for manual + weekly; if throttle errors
  appear, enable billing on the GCP project (Flash pricing is negligible at
  this volume).
- **Open question (owner, before PR 6):** should Leads count GA4 conversions,
  im-ops leads, or both side-by-side? Default plan: GA4 conversions for the
  marketing funnel, im-ops leads shown as a separate business row — avoids
  double counting until attribution exists.
