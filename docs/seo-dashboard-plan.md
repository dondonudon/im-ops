# IM Ops SEO Dashboard — Implementation Plan (repo-aligned revision)

> Revision of the original external plan, corrected to match the **actual** IM Ops
> codebase (conventions, existing dependencies, timezone rules, design system,
> i18n, and navigation). Where the original assumed a generic Next.js/Supabase
> app, this version references the real files and patterns already in the repo.

> **Status (2026-08-03): SHIPPED — PRs 1–6 complete.** The full pipeline is
> built and merged locally: schema → GSC client → two-dataset sync + backfill →
> daily cron → `/growth/seo` dashboard → trends + top tables + opportunity
> engine. 151 unit tests pass; `tsc`, Biome, and `next build` are green. Verified
> against live GSC data for `sc-domain:indo-mover.com`. See §16 for the
> item-by-item Definition of Done and §17 for as-built notes (decisions that
> emerged during implementation). Remaining work is deployment-gated (Vercel env
> + cron) and two deferred niceties.

---

## 1. Purpose

Add an internal Google Search Console (GSC) analytics dashboard to IM Ops under a
new top-level **Growth** section, at `/growth/seo`. GSC is the single source of
truth. No SERP scraping.

**Naming note:** the *app* brand is "IM Operations" (per CLAUDE.md), but the
*website being measured* is the public marketing site **`indo-mover.com`** — a
separate property/codebase. Keep that distinction in all UI copy: the dashboard
is "SEO performance for indo-mover.com", surfaced inside IM Ops.

Target keywords (seed):

```
jasa pindah semarang
jasa pindahan semarang
jasa pindah rumah semarang
jasa pindah rumah
jasa pindah
```

First release = GSC reporting. Lead/revenue attribution is explicitly deferred
(see §12 — it depends on work outside this repo).

---

## 2. What changed from the original plan (read this first)

These are the corrections that make the plan fit *this* repo. Rationale for each
is in the referenced section.

| # | Original said | This repo requires | Where |
|---|---|---|---|
| 1 | `npm install recharts` | **No new chart lib.** Match the existing hand-rolled inline-SVG chart (`src/components/reports/YearlyProfitChart.tsx`) built on semantic tokens. | §9 |
| 2 | Use `date-fns` for date windows | **Use `todayInJakarta()`** and Jakarta-based helpers from `@/lib/utils`. CLAUDE.md forbids UTC-derived calendar dates on the server. | §7 |
| 3 | Nested nav `Reports → Ops/Financial/SEO` (and the earlier "4th tab in Money bar" idea) | SEO isn't financial and doesn't belong under Money. Add a **new top-level `Growth` section** (`/growth`) with SEO as its first sub-tab; attribution etc. become siblings later. | §11 |
| 4 | (i18n unmentioned) | Default locale is **`id`**. Every string needs keys in `src/messages/id.json` **and** `en.json`. | §10 |
| 5 | "reuse dark-mode tokens" / `dark:` | **Never** use `dark:` variants or raw colors. Semantic tokens + `@/components/ui` kit only. | §9 |
| 6 | Full pagination/batching/materialized-view machinery up front | **Right-size it.** One local mover's GSC footprint is tiny. Start with the §13 slice; defer the heavy machinery until volume proves it's needed. | §13 |
| 7 | Extensive 6-suite test matrix + 30-item DoD | Keep the **metric-math + normalization** unit tests (real bug surface). Defer the exhaustive route/UI matrix. | §14 |
| 8 | Generic Google auth snippet | **Mirror `src/lib/gcal/sync.ts`** exactly: `google-auth-library@10` is already installed; same `JSON.parse(key)` → `GoogleAuth` → `getAccessToken()` pattern. | §5 |
| 9 | Attribution framed as a later "phase" | It's a **cross-system project** (needs the public site instrumented + lead-intake fields). Flag expectations now. | §12 |

**New surface area to review carefully:** this feature introduces the **first
use of `SUPABASE_SERVICE_ROLE_KEY`** in the app (grep confirms none today). See
§4 for the containment rules.

---

## 3. Repo facts this plan relies on

- `google-auth-library@^10.7.0` — already a dependency (used by GCal).
- `date-fns@^4.3.0` — installed, but only safe for *duration* math, not for
  deriving "today" on the server (§7).
- Migrations: `supabase/migrations/` currently has `001_consolidated_schema.sql`,
  `002_perf_indexes.sql`. **Next number is `003`.**
- Charts: no library installed. Existing pattern = inline SVG + tokens
  (`YearlyProfitChart.tsx`, a `"use client"` component receiving serializable props).
- Reports nav: `/reports` is one page, registered as a tab in the Money area of
  `src/components/layout/SectionTabs.tsx` (alongside `/money`, `/invoices`).
- Auth model: Supabase Auth + RLS, single org, any authenticated user gets full
  read/write. No service-role usage anywhere yet.
- Timezone helper: `todayInJakarta()` at `src/lib/utils.ts:248` → `"YYYY-MM-DD"`.

---

## 4. Security model (service-role containment)

The sync path needs to bypass RLS to upsert metrics, so it uses the Supabase
service-role key. Because this is the **first** service-role usage in the app,
treat it as the highest-risk part of the change.

Rules (enforce in review):

- `src/lib/supabase/admin.ts` starts with `import "server-only"`.
- The admin client is imported **only** by: `src/lib/search-console/sync.ts`,
  the cron route, and the backfill script. Never by a Server Component that
  renders for a user, never by anything under `src/components/`.
- Secrets never prefixed `NEXT_PUBLIC_`. Never logged. Never serialized into
  Client Component props.
- Reads for the dashboard use the **normal** authenticated server client
  (`src/lib/supabase/server.ts`) + RLS — not the admin client.

Env vars (add to `.env.local.example`):

```dotenv
# Google Search Console (dedicated service account, read-only)
GSC_SERVICE_ACCOUNT_KEY=
GSC_SITE_URL=sc-domain:indo-mover.com

# Server-only Supabase access for the background sync (bypasses RLS)
SUPABASE_SERVICE_ROLE_KEY=

# Vercel cron auth
CRON_SECRET=
```

RLS: enable on all `seo_*` tables; authenticated users may `SELECT` (single-org
policy, `using (true)`, matching existing tables). No `INSERT/UPDATE` policy for
`authenticated` on the metric tables — writes happen only via service role.

---

## 5. GSC API client — mirror the GCal pattern

File: `src/lib/search-console/client.ts` (`import "server-only"` at top).

Reuse the **exact** auth shape already proven in `src/lib/gcal/sync.ts:44`:

```ts
import "server-only";
import { GoogleAuth } from "google-auth-library";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

function loadCredentials() {
  let key: Record<string, string>;
  try {
    key = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_KEY ?? "{}");
    if (!key.client_email || !key.private_key) throw new Error("incomplete");
  } catch {
    throw new Error("GSC service account key is missing or malformed.");
  }
  return key;
}

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({ credentials: loadCredentials(), scopes: [SCOPE] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to obtain GSC access token.");
  return token.token;
}
```

Endpoint (POST, site URL URL-encoded):

```
POST https://www.googleapis.com/webmasters/v3/sites/{encodeURIComponent(siteUrl)}/searchAnalytics/query
```

Types live in `src/lib/search-console/types.ts` (query input, row, response,
normalized error code). Normalize Google errors into a small union
(`MISSING_CONFIGURATION | INVALID_CREDENTIALS | UNAUTHORIZED_PROPERTY |
RATE_LIMITED | GOOGLE_API_ERROR | UNKNOWN`) and **never** let credential/token
material into an error message or log.

**Pagination — right-sized:** GSC allows 25,000 rows/request. For this property,
a single page almost always suffices. Implement simple loop-until-short-page
pagination with a defensive cap (e.g. 5 pages) so it's correct if volume grows,
but don't build parallel fetching. (§13)

---

## 6. Database — migration `003_add_seo_reporting.sql`

Keep the table set from the original (it's well-designed), applied as a single
new migration. Tables:

- `seo_properties` — one row now (`sc-domain:indo-mover.com`, "Indo Mover"),
  keyed by `property_id` everywhere for future-proofing.
- `seo_target_keywords` — seeded with the 5 keywords + target pages + priority
  (`unique (property_id, keyword)`).
- `seo_query_daily` — PK `(property_id, metric_date, query)`.
- `seo_page_query_daily` — PK `(property_id, metric_date, page, query)`.
- `seo_sync_runs` — sync history/health (`sync_type`, `status`, row counts,
  `error_message`, `metadata jsonb`).

Store `clicks/impressions/position` as `double precision`; **you may drop the
stored `ctr` column** — it's derivable and aggregates must be recomputed weighted
anyway (§8). Metric dates are PostgreSQL `date`; sync timestamps are `timestamptz`.

Indexes: `(property_id, metric_date desc)` and `(property_id, query)` /
`(property_id, page)` on the daily tables; `(property_id, started_at desc)` on
sync runs. (Full SQL bodies carry over verbatim from the original §9 — only the
migration number and the dropped `ctr` change.)

**Defer** `seo_device_query_daily` — Phase 2, not now.

After migration: regenerate `src/lib/supabase/types.ts` (the repo uses generated
types).

---

## 7. Timezone (hard rule — this is where bugs hide)

The server runs UTC; business tz is Asia/Jakarta. GSC data is date-based and
lags ~2–3 days.

- "Today" on the server → `todayInJakarta()` (`src/lib/utils.ts`). **Never**
  `new Date().toISOString().slice(0,10)`.
- Sync window and "last N complete days" are computed by taking
  `todayInJakarta()`, splitting `"YYYY-MM-DD"`, and doing calendar math on those
  integers (or `date-fns` `sub`/`format` seeded *from that string*, not from
  `new Date()`).
- Recommended normal sync window: **10 days ago → 3 days ago** (re-sync overlap
  absorbs GSC's late corrections; upsert makes it idempotent).
- Default dashboard range: **last 28 complete days**, excluding today (data
  incomplete). Comparison: **previous 28 days**.
- GSC date params are passed as plain `"YYYY-MM-DD"` strings — never round-trip
  through a JS `Date`/UTC.
- Sync *timestamps* display in `Asia/Jakarta` (WIB) via
  `toLocaleString(..., { timeZone: "Asia/Jakarta" })`.

MVP date presets: **Last 28 days**, **Last 3 months**. Others later.

---

## 8. Metric math

- Total clicks / impressions: sum.
- CTR: `impressions > 0 ? clicks / impressions : 0` — **never** average per-row CTR.
- Average position: **impression-weighted**
  (`Σ(position·impressions) / Σ impressions`), `null` when no impressions.
- Position change: `previous − current` (positive = improved; it's a point delta,
  show "improved by 1.9", not a %).
- % change for clicks/impressions/CTR: guard `previous === 0` → return `null` →
  render "New" instead of ∞.

These are the functions that most deserve unit tests (§14).

---

## 9. Dashboard UI

Route: `/growth/seo`. `page.tsx` is a **Server Component** — verify session
(existing pattern), parse `?range=`, query Supabase via the normal server client,
compute aggregates, pass serializable data to client sub-components.

Structure:

```
src/app/(dashboard)/growth/seo/
├── page.tsx            (Server Component)
├── loading.tsx         (skeleton — required, per repo convention)
├── error.tsx
└── components/
    ├── SeoDateRange.tsx        ("use client")
    ├── SeoSummaryCards.tsx
    ├── TargetKeywordTable.tsx
    ├── SeoSyncStatus.tsx
    ├── KeywordTrendChart.tsx   ("use client", inline SVG — see below)
    ├── TopQueriesTable.tsx
    ├── TopPagesTable.tsx
    └── SeoOpportunityTable.tsx
```

**Components/tokens (mandatory):** build on `PageHeader`, `Card`, `Stat`,
`Table`/`TableRow`/`TableCell`, `Badge`, `EmptyState` from `@/components/ui`, and
`StatusChip`/`toneFor` for status coloring. Only semantic tokens
(`bg-surface`, `text-ink-muted`, `bg-success-bg`, …). **No raw Tailwind colors,
no `dark:`** — dark mode is automatic via tokens.

**Trend chart — no dependency.** Copy the approach of
`src/components/reports/YearlyProfitChart.tsx`: a `"use client"` inline-SVG chart
receiving `{date, position, clicks, impressions}[]` as props. Invert the Y-axis
(position 1 at top). **Do not** plot missing dates as position 0 — a gap means
"no measurable row", so break the line / skip the point. Tooltip shows date,
position, clicks, impressions.

Status band → tone mapping (via `toneFor`/`Badge`):

```
Top 3 (≤3)          success
Page 1 (>3, ≤10)    success
Near page 1 (>10,≤20) warning
Needs work (>20)    neutral
Declining           danger
No data             muted
```

Target-keyword table: show configured keyword vs **actual ranking page**; when
they differ, surface a subtle "different page ranking" hint — **not** an error
(could be intended). Top-queries default sort: impressions desc, limit 25. Top
pages: aggregate page-query rows, normalize display to path (`/…`) with full URL
in a title tooltip.

Opportunities (`src/lib/search-console/opportunities.ts`): near-page-one, low-CTR
(heuristic, label it), unexpected-page, possible-cannibalization ("Possible page
overlap", never "confirmed"), declining-keyword. Each carries
`evidence` + `recommendation`; conservative thresholds; never auto-act.

---

## 10. i18n (was missing entirely)

Default locale `id`. Add every SEO string to **both** `src/messages/id.json` and
`src/messages/en.json` under a new `seo` namespace. Server components use
`getTranslations()`, client components `useTranslations()`. Metric names, status
bands, opportunity types, tooltips, and the sync-status copy all need keys.
Number/percent formatting via `Intl.NumberFormat("id-ID", …)`.

---

## 11. Navigation — new top-level "Growth" section

SEO gets its own top-level section rather than living under Money (it isn't
financial). This adds the first new top-level nav item since the flat IA was set,
justified by Growth becoming a real home for marketing/growth surfaces
(SEO now; attribution, GBP, ads later — §12b).

Three touch points, all in `src/components/layout/`:

1. **`Sidebar.tsx` (desktop):** add a `Growth` entry pointing to `/growth`, with
   `match: (p) => p.startsWith("/growth")`. Pick a `lucide-react` icon consistent
   with the existing set (e.g. `TrendingUp` / `LineChart`). Place it after
   `Directory`, before `Settings` (per the chosen ordering:
   `… · Directory · Growth · Settings`).

2. **`SectionTabs.tsx`:** add a new area group so `/growth` shows its own sub-tab
   bar, ready for future siblings:

   ```ts
   {
     test: (p) => p.startsWith("/growth"),
     tabs: [
       { href: "/growth/seo", key: "seo", match: (p) => p.startsWith("/growth/seo") },
       // future: attribution, business-profile, …
     ],
   }
   ```

3. **Landing redirect:** `/growth` should redirect to `/growth/seo` (mirror the
   existing `/dashboard → /today` redirect pattern) so the top-level item always
   lands somewhere concrete while it has a single child.

Also:

- Add `nav.growth` and the `seo` sub-tab label to **both** `src/messages/id.json`
  and `en.json`.
- **`BottomNav.tsx` (mobile):** do **not** add Growth to the primary bottom bar —
  it's low-frequency and mobile slots are scarce. It stays reachable via the
  mobile menu/overflow. (Revisit only if SEO becomes a frequent mobile task.)
- Leave the Money-area tabs (`Overview | Invoices | Reports`) unchanged.

---

## 12. Sync, cron, backfill

**Sync service** `src/lib/search-console/sync.ts` — entry
`syncSearchConsoleProperty({ propertyId, startDate, endDate, syncType })`.
Lifecycle: insert `seo_sync_runs` (`running`) → fetch+upsert Dataset A
(`["date","query"]` → `seo_query_daily`) → fetch+upsert Dataset B
(`["date","page","query"]` → `seo_page_query_daily`) → mark `success`.
Partial-failure: one dataset ok / one fails → `partial`, preserve the good data,
store short error. Both fail → `failed`. Malformed rows skipped + counted into
`metadata`. Upsert in batches of ~500 (sequential). Overlap guard: reject if a
`running` run started recently; mark runs `running` > 30 min as stale/failed.

**Cron** `src/app/api/cron/seo-sync/route.ts` (`GET`, `dynamic="force-dynamic"`,
`maxDuration=60`). Auth via `Authorization: Bearer ${CRON_SECRET}` header only
(never query/body/cookie). `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/seo-sync", "schedule": "0 1 * * *" }] }
```

01:00 UTC = 08:00 WIB, once daily (GSC lag makes hourly pointless).

> ⚠️ **Vercel tier:** daily cron + `maxDuration=60` require **Pro**. Confirm the
> deployment plan before Phase "cron"; on Hobby, cron frequency and function
> duration are capped and this won't run as specced.

**Backfill** `scripts/backfill-search-console.ts`, run locally via `tsx`
(`npm i -D tsx`; add `"seo:backfill"` script). Month-chunked, `--start`/`--end`
args, resume (skip periods with a successful `backfill` run), `--force` override.
Keeping the heavy job **local** (not on Vercel) is deliberate and correct. Start
with **90 days**; extend toward 16 months once verified.

---

## 12b. Attribution (explicitly out of scope for v1 — set expectations)

The "SEO → leads → jobs → revenue" payoff is the real long-term value, but it is
**a separate, cross-system project**, not a later phase of this dashboard:

- GSC **cannot** join a query to an individual lead. The only meaningful join is
  **landing page + date period**.
- Capturing `utm_*` / `landing_page` / `referrer` requires instrumenting the
  **public marketing site (`indo-mover.com`)** — a different codebase — *and*
  adding those fields to the IM Ops lead-intake path.

Do not scope, estimate, or promise attribution as part of this deliverable.
Ship the GSC dashboard first; treat attribution as its own initiative. When it
does happen, it slots in cleanly as a second `/growth/*` sub-tab — which is part
of why the top-level Growth section (§11) is worth the nav cost.

---

## 13. Right-sized first slice (build this before anything fancy)

A single Semarang mover's GSC data is small (5 target keywords; likely hundreds
of rows/day). Build the smallest vertical slice, verify against the GSC UI, then
layer on:

1. Service account + `GSC_*`/service-role/`CRON_SECRET` env (Phase 0).
2. Migration `003`: `seo_properties`, `seo_target_keywords`, `seo_query_daily`,
   `seo_sync_runs` (**defer** `seo_page_query_daily` to the second slice).
3. GSC client (§5) — single-page fetch + defensive pagination cap.
4. Sync service for **Dataset A only** (`date + query`).
5. Backfill **90 days**.
6. `/growth/seo`: KPI cards + 5-keyword target table + sync status +
   empty/loading states + Growth nav item/sub-tab + i18n.
7. Daily cron.

Then the second slice adds `seo_page_query_daily`, the trend chart, top
queries/pages, and the opportunity engine.

Explicitly **defer** until volume justifies: parallel batching, materialized
views / SQL aggregate functions, device dimension, 25k-row multi-page pagination.

---

## 14. Testing (focused, not exhaustive)

Tests live in `src/lib/__tests__/` (Vitest). **Prioritize the pure logic that
actually breaks:**

- Metric math: total clicks/impressions, weighted position, aggregate CTR,
  zero-impression → `null`, comparison %-change with `previous === 0` → `null`,
  position-improvement direction.
- Row normalization: correct key order for `[date,query]` and
  `[date,page,query]`; missing/undefined keys skipped + counted.
- Date logic: last-28-complete-days and comparison window computed from a fixed
  `todayInJakarta()` (mock it) — assert Jakarta correctness, month boundaries.
- Opportunity rules: threshold boundaries, no false positives under thresholds.

Client-mock the GSC `fetch` for a couple of error paths (401/403/429/malformed).
**Defer** the full route/UI test matrix and the 30-item DoD checklist — this is
an internal, read-only reporting page.

**Manual verification before release:** compare dashboard totals to the GSC UI
(same property, same range, Web type, excluding incomplete recent days), confirm
WIB labels, and confirm no secrets appear in browser network responses.

---

## 15. PR breakdown

1. ✅ **PR 1 — schema + config:** migration `003`, hand-written types,
   `.env.local.example`, property + keyword seeds, `admin.ts` (with the §4
   containment rules in its doc comment).
2. ✅ **PR 2 — GSC client:** auth (mirrors gcal), query, pagination, typed errors,
   unit tests. Added the vitest `server-only` alias (§17).
3. ✅ **PR 3 — sync (Dataset A) + backfill:** normalization, batched upsert, sync
   logs, overlap/stale guard, local backfill script, tests. Added `tsx` devDep +
   `scripts/tsconfig.json` for the runtime `server-only` alias (§17).
4. ✅ **PR 4 — cron:** protected route + `vercel.json` + `/api/cron` middleware
   exemption. Pro-tier `maxDuration` requirement noted in the route.
5. ✅ **PR 5 — dashboard MVP:** `/growth/seo` + `/growth` redirect, new Growth
   top-level nav item + Growth-area sub-tab (§11), KPI cards, target-keyword
   table, date presets, sync status, i18n, responsive/empty/loading states.
6. ✅ **PR 6 — second slice:** migration `004` (`seo_page_query_daily`),
   two-dataset sync with partial-failure, inline-SVG trend chart, top
   queries/pages, opportunity engine, i18n.

Attribution is **not** in this sequence (§12b).

---

## 16. Definition of Done (through PR 6)

**Shipped & verified**

- [x] `sc-domain:indo-mover.com` verified; read-only service account can query it
      (required enabling the Search Console API + adding the SA as a property user).
- [x] Migrations `003` + `004` apply cleanly; RLS on; config tables read/write,
      metric + sync tables authenticated-read only, writes via service role only;
      types added to `types.ts`.
- [x] Seeds present (property + 5 keywords).
- [x] GSC client: read-only scope, defensive pagination cap, no secret logging,
      `server-only`, no client imports.
- [x] Sync idempotent; runs logged; **two datasets** with partial-failure
      preserving the good one; overlap/stale guard works; dates via
      `todayInJakarta()`.
- [x] Backfill loaded (query-level); dashboard totals ≈ GSC UI (visually
      confirmed).
- [x] Cron route: 401 on bad/missing secret; delegates to `runScheduledSync`;
      500 only on hard failure; `/api/cron` exempted in middleware.
- [x] `/growth/seo` shows KPI cards + comparison deltas + 5-keyword table
      (visible even with no data) + trend chart + top queries/pages +
      opportunities + sync status; empty/loading/error handled.
- [x] New `Growth` top-level nav item (Sidebar) + Growth-area sub-tab
      (`SectionTabs`) + `/growth → /growth/seo` redirect; not in `BottomNav`.
- [x] All strings in `id.json` **and** `en.json`; only semantic tokens; dark mode
      automatic; responsive grid/tables.
- [x] Unit tests (151): metric math, normalization (both datasets), date logic,
      aggregation, opportunity thresholds, client error paths, sync lifecycle,
      cron auth. `tsc` + Biome + `next build` green.
- [x] No secrets in error output (asserted in tests); `.env.local.example`
      updated.

**Deployment-gated (do at deploy time)**

- [ ] Set `GSC_SERVICE_ACCOUNT_KEY`, `GSC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `CRON_SECRET` in Vercel (Production).
- [ ] Confirm Vercel plan allows the daily cron + `maxDuration=60` (Pro+); lower
      `maxDuration` on Hobby.
- [ ] Verify the production cron run logs a `seo_sync_runs` row and data stays
      visible after a failed run.
- [ ] Apply migration `004` to production Supabase, then re-run the backfill with
      `--force` to populate historical **page-query** data (top pages /
      unexpected-page / cannibalization stay empty until then — see §17).
- [x] Update the project README + CLAUDE.md with a "Growth › SEO" section.

**Niceties (shipped after v1)**

- [x] Per-query "change vs previous period" column in Top Queries (shared
      `PositionChange` indicator with the target-keyword table).
- [x] Manual-refresh button (§24) — authenticated Server Action (`actions.ts`),
      15-min throttle, reuses the sync overlap guard, `revalidatePath`; labels
      that GSC data is delayed.
- [x] GSC 403 disambiguation — `API_DISABLED` vs `UNAUTHORIZED_PROPERTY` from the
      response body (with a unit test).
- [x] Bonus: `partial` sync status now surfaced in the sync card.

---

## 17. As-built notes (decisions made during implementation)

Things that were decided or discovered while building, worth recording for the
next person:

- **`server-only` runtime resolution.** The bare `server-only` specifier is only
  bundled inside `next` — plain Node/tsx/vitest can't resolve it. Rather than
  weaken the guard, it's aliased to a no-op stub in two places: `vitest.config.ts`
  (so server-only modules are unit-testable) and `scripts/tsconfig.json` (so the
  `tsx` backfill can import the sync/admin/GSC chain). Next's real client/server
  guard is untouched. `tsx` was added as a devDependency.

- **KPI aggregation = app-layer pagination, not SQL.** `queries.ts` pages past
  PostgREST's 1000-row cap and aggregates in JS (weighted position etc.), so
  totals are correct for windows with >1000 rows. Swap for a SQL aggregate
  function only if this gets slow (§28). No `seo_*` RPCs exist yet.

- **`dataState: "all"`.** The client requests the freshest finalized data;
  combined with the delayed sync window (10→3 days ago) and idempotent upserts,
  late corrections are absorbed on the next run.

- **Two-dataset sync + partial status.** A run syncs `date+query` and
  `date+page+query` independently; one failing → run `partial` with the other's
  data preserved; both failing → `failed` + rethrow.

- **Migration split.** `003` = registry + target keywords + `seo_query_daily` +
  `seo_sync_runs`. `004` = `seo_page_query_daily` (second slice). Types are
  hand-maintained in `types.ts` (no generator run); re-running the real generator
  should reproduce them.

- **Opportunity output is structured, not prose.** `opportunities.ts` returns
  `{ type, priority, query, page?, metrics }`; the table formats evidence +
  recommendation via i18n (`pages.seo.opportunities.*`), so wording/locale live
  in the message files. Thresholds are in `DEFAULT_THRESHOLDS` (overridable).

- **Trend chart is dependency-free.** Inline SVG mirroring
  `YearlyProfitChart.tsx`; the page pre-fetches all target-keyword series so the
  client selector switches without refetching. Missing days are not plotted
  (never position 0).

- **Google setup gotchas (Phase 0).** Two separate 403s bit us in order: (1) the
  Search Console **API was disabled** in the Cloud project — enable it at
  `console.developers.google.com/apis/api/searchconsole.googleapis.com`; (2) the
  service account **wasn't a user on the property** — add its `client_email` under
  **Search Console → Settings → Users and permissions** (this is *not* Cloud IAM).
