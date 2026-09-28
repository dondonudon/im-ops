# CLAUDE.md — IM Ops Agent Handover

Agent-facing reference for this codebase. Read this before touching anything.

> **Visual reference:** `docs/diagrams.md` — entity lifecycle, invoice/payment model, and C4 system context (all Mermaid).

---

## What this is

**IM Ops** is a single-org internal ops platform for a moving/logistics company. It captures leads, runs them through estimation → proposal → job → invoice → payment. Every operator in the org uses a single Supabase project; there are no multi-tenant concerns. All routes are auth-gated (Google OAuth only).

---

## Architecture

### Server-first
React Server Components by default. Use `"use client"` only where interaction or browser APIs are strictly required. Data fetches happen in Server Components or Server Actions; client components receive data as props.

### Auth
- Supabase Auth with Google OAuth only
- Middleware (`src/middleware.ts`) gates every route except `/login`, `/auth`, `/privacy`, `/terms`, `/verify`
- `/verify/[token]` is a public eSign verification route — no auth required
- OAuth callback is at `/auth/callback/route.ts` with safe redirect allowlist (14 routes)
- RLS is enabled on all tables — single-org policy, any authenticated user gets full access

### Data layer
- Supabase JS client: `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts` (server)
- Full DB types live in `src/lib/supabase/types.ts` — **hand-maintained, not generated.**
  It encodes CHECK constraints as literal unions (`type: "individual" | "corporate"`),
  which `supabase gen types` would flatten to `string`. Edit it by hand after a
  schema change; don't add a codegen script.
- All currency stored as `BIGINT` (IDR, no decimals). Never use `FLOAT` or `DECIMAL` for money.
- Schema lives in `supabase/migrations/` — numbered SQL files applied in order. The first migration is the consolidated base schema; later files layer changes on top. Running the full set on a fresh DB is safe.

---

## Design system — MUST follow

All UI must go through the semantic token system. **Never use raw Tailwind color utilities or `dark:` class variants.**

### Token palette (`src/app/globals.css` → `tailwind.config.ts`)
| Token | Use |
|---|---|
| `bg-background` / `text-foreground` | Page base |
| `bg-surface` / `bg-surface-raised` / `bg-surface-sunken` | Cards, panels, inputs |
| `border-line` / `border-line-strong` | Dividers, borders |
| `text-ink` / `text-ink-muted` / `text-ink-faint` | Body / secondary / placeholder text |
| `bg-primary` / `text-primary-fg` / `text-primary-text` | Brand actions |
| `bg-success-bg` / `text-success-text` | Success states |
| `bg-warning-bg` / `text-warning-text` | Warning states |
| `bg-danger-bg` / `text-danger-text` | Error / danger states |

### Component kit (`src/components/ui/`)
Always prefer these over raw HTML + classes:
- `Button` — `variant`, `size`, `loading` props
- `Card` — surface wrapper with optional header slot
- `Badge` — semantic status badge driven by `tone` prop
- `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell` — responsive table primitives
- `Input`, `Select`, `Textarea`, `Field`, `FormError` — form primitives
- `PageHeader` — page title + breadcrumb + action slot
- `EmptyState` — zero-state placeholder
- `Money` — IDR formatter component (wraps `formatRupiah`)
- `Stat` — KPI card (label + value)
- `MonthPicker` — month selector used by `/money`, `/expenses`, `/reports`; emits `YYYY-MM` strings
- `Pagination` — page-number controls; used wherever list data is paginated
- `RouteLine` — renders a pickup → destination route summary (takes `points: string[]`)
- `ObfuscatedEmail` — renders an email address that bots can't scrape
- `StatusChip` (in `src/components/shared/`) — status dot + label; uses `toneFor(entity, status)`
- `EntityStatusChip` (in `src/components/shared/`) — StatusChip variant typed to a specific entity; prefer this over raw StatusChip on entity pages
- `LocationInput` (in `src/components/shared/`) — address search + map pin via Google Maps; stores lat/lng; requires `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env var (optional — input degrades gracefully without it)
- `AddressListInput` (in `src/components/shared/`) — dynamic add/remove of `LocationInput` rows; used on lead forms for multi-stop routes
- `AddressLink` (in `src/components/shared/`) — renders a stop as a Google Maps directions link when coords exist, plain text otherwise; never expose raw lat/lng to users
- `MediaThumb` (in `src/components/shared/`) — grid tile for photo or video; detects type from `media_type`
- `PhotoLightbox` (in `src/components/shared/`) — fullscreen photo/video viewer; `kind: 'video'` branch renders native `<video>`
- `ReceiptLightbox` (in `src/components/shared/`) — lightbox variant for expense receipts (signed URL aware)
- `NumericInput` (in `src/components/shared/`) — IDR-aware numeric field; parses/formats via `parseRupiah` / `formatRupiah`
- `WhatsAppButton` (in `src/components/shared/`) — pre-fills and opens a WhatsApp deeplink; wraps `buildWhatsAppLink`
- `CommandPalette` (in `src/components/shared/`) — global ⌘K search overlay
- `FilterForm` (in `src/components/shared/`) — collapsible filter row used on list pages
- `BackLink` (in `src/components/shared/`) — breadcrumb back-navigation link
- `Skeleton` (in `src/components/shared/`) — loading placeholder; use in `loading.tsx` files
- `PendingLink` (in `src/components/shared/`) — `<Link>` wrapper that shows a spinner while the route is loading (uses `useNavFeedback`)

### Status colors
`toneFor(entity, status)` in `src/components/ui/status.ts` is the **single source of truth** for mapping any domain status to a semantic tone. Never hardcode status colors inline.

---

## Data model invariants — DO NOT BREAK

These are enforced at the DB level and in app logic:

1. **Lead status mirrors reality.** `converted` ⟺ a job exists; `proposal_sent` ⟺ at least one non-terminal proposal.
2. **Proposals lock on approval.** `final_price`, `proposal_number`, and the estimation snapshot become immutable once `status = 'approved'`.
3. **Job base revenue locked at conversion.** `jobs.base_revenue` is copied from `proposal.final_price` at job creation and never touched again. `jobs.revenue` is derived by a BEFORE trigger: `base_revenue + Σ job_adjustments.amount` (signed — charges positive, discounts negative). Write `base_revenue`; read `revenue` for totals.
4. **One active master invoice per job.** Enforced by a partial unique index on `invoices(job_id) WHERE parent_invoice_id IS NULL AND status <> 'cancelled'`. A job may have one master (grand total) plus N children (termin — DP, Pelunasan, …). Children carry `parent_invoice_id = master.id`. Payments attach to **leaf** invoices only (children when any exist, else the master itself). Master `paid_amount` is derived by trigger rollup — never paid directly. Views and AR functions must use leaf-only filters to avoid double-counting master + children; the `invoice_outstanding` view and `get_invoice_status_breakdown()` / `get_ar_totals()` RPCs already do this.

5. **One job per proposal.** `jobs.proposal_id` has a unique constraint.
6. **Estimations store a `settings_snapshot`.** The JSONB snapshot captures `system_settings` at estimation time so historical pricing stays explainable.
7. **Invoice status starts at `sent`** (no draft state). Lifecycle: `sent` → `partially_paid` / `paid` / `overdue` / `cancelled`. The `update_invoice_status` trigger auto-advances status when payments are recorded; on a child invoice the trigger also rolls up `paid_amount` and status to the master.
8. **Calendar failures are non-fatal.** `lib/gcal/sync.ts` always returns `null` on failure; records are created without `gcal_event_id`. Never let a gcal error block a write.

9. **Job expenses lock once the job is settled.** A job's `expense_type = 'job'` rows become immutable (no insert/update/delete) when the job is cancelled, OR its active master invoice is fully paid, OR (no invoice yet) collected payments cover `jobs.revenue`. Enforced in two places that must stay in sync: the UI (`ExpensePanel` + `jobs/[id]/expenses/page.tsx`) and a DB trigger (`before_expense_lock_check` → `is_job_expenses_locked()`, migration `009`). A single paid termin must NOT lock — only the master's rolled-up total or the payments-vs-revenue check does. Operational expenses (`job_id IS NULL`) are never locked.

---

## Key files

| File | Role |
|---|---|
| `src/middleware.ts` | Auth gate + CSP headers (nonce-based strict-dynamic in prod, wasm-unsafe-eval for react-pdf) |
| `src/lib/supabase/types.ts` | Full DB type definitions — hand-edit after schema changes (not codegen) |
| `src/lib/supabase/client.ts` | Browser client (for Client Components) |
| `src/lib/supabase/server.ts` | Server client (for Server Components + Actions) |
| `src/lib/supabase/admin.ts` | Service-role client — **bypasses RLS**; `server-only`; approved importers: SEO sync path + `scripts/reencode-png-images.ts` only |
| `src/lib/supabase/queries.ts` | Shared query helpers used across Server Components + Actions |
| `src/lib/search-console/` | GSC client, two-dataset sync, dashboard queries, aggregation, opportunity engine (all `server-only` where they touch secrets) |
| `src/app/api/cron/seo-sync/route.ts` | Daily GSC sync cron (bearer `CRON_SECRET`); `/api/cron` is exempt in middleware |
| `vercel.json` | Vercel cron schedule (daily SEO sync) |
| `src/lib/pdfSettings.ts` | PDF document defaults (fonts, margins, signature/eSign settings) |
| `src/lib/estimation/engine.ts` | ENGINE_VERSION 2.5.1 — cost + margin calculation, tiered margin table |
| `src/lib/gcal/sync.ts` | Google Calendar push sync (never blocks) |
| `src/lib/invoices.ts` | Pure helpers: `deriveJobRevenue`, `splitSumStatus`, `deriveInvoiceStatus`, `rollupMasterPaid`, `billableLeaves` |
| `src/lib/utils.ts` | `formatRupiah`, `parseRupiah`, `formatDate`, `cn`, `resizeImage`, `sanitizeSearch`, `prepareVideoUpload`, `buildWhatsAppLink`, `numberToIndonesianWords`, `formatCustomerName`, `todayInJakarta`, `deriveJobStatus` |
| `src/lib/constants.ts` | `PAGE_SIZE` (10), `CUSTOMER_PREFIX_OPTIONS` |
| `src/lib/month.ts` | `parseMonth(raw?)` — falls back to Jakarta month; `monthRange(ym)` — half-open `[start, end)`; `formatMonthLabel(ym, locale)` — used by `/money`, `/expenses`, `/reports` |
| `src/lib/profit.ts` | `summarizeProfit(rows, operationalTotal)` — single source of truth for gross/operating profit and margins on `/money` and `/reports` |
| `src/lib/expenseCategories.ts` | `JOB_EXPENSE_CATEGORIES` and `OPERATIONAL_EXPENSE_CATEGORIES` — app-level vocabulary for `expenses.category`; DB stores free text so renderers must fall back to the raw value for historical rows |
| `src/lib/customerDuplicates.ts` | Phone + name normalisation for duplicate customer detection |
| `src/lib/leadAddresses.ts` | `groupLeadAddresses`, `routePoints`, `replaceLeadAddresses`, `routePointsFromText` — read/write helpers for the `lead_addresses` child table |
| `src/lib/parseGoogleMapsUrl.ts` | `extractAddressFromMapsUrl`, `resolveMapUrl` — server-side resolver for pasted `maps.app.goo.gl` share links |
| `src/lib/proposalCustomFields.ts` | `ProposalCustomFields`, `parseCustomFields` — JSONB custom fields on proposals (`price_suffix`, `custom_conditions`, `override_services`) |
| `src/lib/pdfFit.ts` | `countPdfPages(blob)` — regex-based page counter for fit-to-one-page retry loop in PDF generation |
| `src/lib/security/ssrf.ts` | `isPrivateHostname` — best-effort SSRF guard for server-side outbound fetches on user-influenced URLs |
| `src/lib/storage/signedUrls.ts` | `batchSignedUrls`, `receiptStoragePath` — batch-sign private bucket URLs with cache (60 s margin before expiry) |
| `src/lib/useReceiptUrls.ts` | `useReceiptUrls(supabase, rows)` — client hook that signs and caches receipt URLs for expense lists |
| `src/lib/useNavFeedback.ts` | `useNavFeedback()` — tracks the last-clicked nav href so items light up instantly before the route settles |
| `src/lib/env.ts` | Startup env var validation (checks Supabase vars on import) |
| `src/app/globals.css` | CSS custom properties for all semantic tokens |
| `tailwind.config.ts` | Token definitions mapping CSS vars to Tailwind classes |
| `src/i18n/config.ts` | i18n: locales = ["id", "en"], default = "id", cookie = "imops-locale" |
| `src/messages/id.json` | Indonesian translations (default locale) |
| `src/messages/en.json` | English translations |

---

## Component patterns

### Adding a new page
1. Create `src/app/(dashboard)/[route]/page.tsx` (Server Component)
2. Add a `loading.tsx` skeleton alongside it
3. Use `PageHeader` for the title, `DashboardShell` wraps automatically via `layout.tsx`
4. Fetch data server-side; pass to client sub-components via props

### Adding a new entity form
1. Build on `Field`, `Input`, `Select`, `FormError` from `src/components/ui/`
2. Submit via Server Action or `router.push`; show feedback via the `loading` prop on `Button`
3. Validate at the boundary (user input) — don't add redundant validation for internal invariants

### Translation keys
Use `getTranslations()` in Server Components, `useTranslations()` in Client Components. Add keys to both `src/messages/id.json` and `src/messages/en.json` when adding UI text.

---

## Utility conventions

```ts
import { formatRupiah, parseRupiah, formatDate, cn } from "@/lib/utils"

// Currency display
formatRupiah(1500000)        // "Rp 1.500.000"
parseRupiah("Rp 1.500.000") // 1500000

// Date display
formatDate(dateStr)               // locale-aware short date
formatIndonesianDate(dateStr)     // Indonesian long format
formatJobSchedule(...)            // job time + crew summary string

// Number to words (for invoice/proposal text)
numberToIndonesianWords(1500000)  // "satu juta lima ratus ribu"

// Customer name with honorific prefix
formatCustomerName(prefix, name)

// WhatsApp deeplink (no Business API — opens user's own WhatsApp)
buildWhatsAppLink(phone, message) // "https://wa.me/62…?text=…"

// Derived job status from move_date (no stored state)
// DerivedJobStatus = "upcoming" | "today" | "done" | "cancelled"
deriveJobStatus(moveDate, dbStatus)

// Tailwind merging
cn("base-class", condition && "conditional-class", "override")

// Sanitize before passing to PostgREST ilike/fts
sanitizeSearch(query)

// Resize before upload (≤1600px; returns { blob, ext, contentType } — WebP, JPEG, or PNG depending on browser)
const { blob, ext, contentType } = await resizeImage(file)

// Video upload prep (src/lib/utils.ts — under 50 MB: pass-through; over 50 MB: canvas downscale; throws VideoTooLargeError if still too large)
const { blob, ext, contentType } = await prepareVideoUpload(file)
isVideoFile(file)           // true for video/* MIME types
MAX_VIDEO_BYTES             // 50 * 1024 * 1024

// Today's date in Jakarta time (use this — never new Date().toISOString().slice(0,10))
todayInJakarta()  // → "2026-07-31"

// Month helpers (src/lib/month.ts — for ?month=YYYY-MM pages)
parseMonth(searchParams.month)        // → current Jakarta month if missing/malformed
monthRange("2026-08")                 // → { start: "2026-08-01", end: "2026-09-01" }

// Profit summary (src/lib/profit.ts)
summarizeProfit(jobRows, operationalTotal) // → ProfitSummary with grossProfit, operatingProfit, margins

// Error mapping (maps Supabase/PostgREST error codes to user-facing strings)
mapDbError(err)
```

---

## Timezone — MUST follow

The server runs in UTC. The business timezone is **Asia/Jakarta (UTC+7)**. At 1 AM Jakarta time the server clock still reads the previous day.

**Rule: never use UTC-based methods to derive a calendar date on the server.**

| ❌ Wrong (UTC) | ✅ Right (Jakarta) |
|---|---|
| `new Date().toISOString().slice(0, 10)` | `todayInJakarta()` from `@/lib/utils` |
| `new Date().getFullYear()` / `.getMonth()` / `.getDate()` | parse `todayInJakarta().split("-")` |
| `someDate.toISOString().slice(0, 10)` for a window boundary | `someDate.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })` |
| `new Date().toLocaleDateString(locale, { … })` without `timeZone` | add `timeZone: "Asia/Jakarta"` to the options |

**Client components are exempt** — the browser runs in the user's local timezone (Jakarta), so `new Date().toLocaleDateString("en-CA")` (no `timeZone` arg) is correct there.

**UTC is correct** for full-timestamp writes (`created_at`, `updated_at`, `approved_at`, etc.) — use `.toISOString()` for those.

---

## Estimation engine

`src/lib/estimation/engine.ts` — ENGINE_VERSION 2.5.1 (ported from MarginCalc spreadsheet).

Tiered margin table (loaded from `system_settings`, snapshot stored in estimation):
| Job cost cap | Margin rate | Min profit |
|---|---|---|
| ≤ Rp 1M | 45% | Rp 300K |
| ≤ Rp 3M | 35% | Rp 500K |
| ≤ Rp 7M | 25% | Rp 750K |
| ≤ Rp 15M | 20% | Rp 1.3M |
| > Rp 15M | 15% | Rp 2.1M |

Do not change the engine without updating ENGINE_VERSION.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon key (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ server | Service-role key — bypasses RLS; used by admin.ts + scripts only |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | optional | Google Maps Places API; LocationInput degrades gracefully without it |
| `GCAL_SERVICE_ACCOUNT_KEY` | optional | Full GCal service account JSON (single-line); required for calendar sync |
| `GSC_SERVICE_ACCOUNT_KEY` | optional | Read-only GSC service account JSON; required for SEO dashboard |
| `GSC_SITE_URL` | optional | Property URL registered in Google Search Console |
| `CRON_SECRET` | optional | Bearer token protecting `/api/cron/*` routes |
| `NEXT_PUBLIC_APP_URL` | optional | Canonical app URL; used for eSign verification links |
| `PDF_FONT_BASE` | optional | URL base for PDF fonts (Inter); falls back to bundled fonts |
| `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` | auto | Injected by Vercel; used for canonical URL fallback |

---

## system_settings keys

All keys live in the `system_settings` table (`key`, `value`, `category`). Loaded per-request via `getSystemSettings()` from `src/lib/supabase/queries.ts` (React `cache()` deduplicates within a render pass). The estimation engine snapshot (`settings_snapshot` on estimations) records the values at estimation time.

| Key | Category | Purpose |
|---|---|---|
| `margin_tiers` | estimation | JSON array — tiered margin table (see Estimation engine section) |
| `crew_day_rate` | estimation | Default crew day rate (IDR) when not set per-crew |
| `food_per_crew` | estimation | Food allowance per crew member (IDR) |
| `travel_cost_per_crew` | estimation | Travel cost per crew member (IDR) |
| `spot_hire_cost` | estimation | Spot hire vehicle cost (IDR) |
| `spot_hire_count` | estimation | Default number of spot-hire vehicles |
| `operational_buffer` | estimation | Operational buffer percentage |
| `vehicle_rate_box_truck` | estimation | Box truck day rate (IDR) |
| `negotiation_buffer_pct` | estimation | Negotiation headroom percentage |
| `price_round_increment` | estimation | Rounding increment for final price |
| `gcal_calendar_id` | calendar | Target Google Calendar ID; calendar must be shared with the service account |
| `revenue_targets` / `revenue_target_monthly` | finance | Monthly revenue target (IDR); surfaced on `/today` and `/money` |
| `proposal_valid_days` | proposals | Days a proposal is valid from issue date (default 14); printed on proposal PDFs |
| `expense_grace_days` | expenses | Days after full payment that expense logging remains open (default 7) |

---

## Navigation / IA

Top-level nav, split into two tiers in the sidebar by a divider:
- **Operations** (daily, labeled): **Today · Pipeline · Jobs · Calendar · Money · Directory**
- Low-frequency (unlabeled, below the divider): **Growth · Settings**

Order is unchanged from the original flat list. Only the Operations tier gets a
`SectionLabel` heading (`nav.sections.operations`); the bottom tier is left
unlabeled on purpose — Growth (monitoring) and Settings (config) don't share a
function, so the divider signals "secondary" without a misleading label.
`BottomNav` carries only the Operations tier.

- `Sidebar` (desktop) + `BottomNav` (mobile, `md:hidden`) — both in `src/components/layout/`
- Sub-tabs (Pipeline, Money, Directory, Growth) handled by `SectionTabs` within each page
- `/today` is the operator triage cockpit — this is the post-login landing page
- `/dashboard` redirects to `/today` (legacy URL compatibility)
- **Growth** is the marketing/growth area (SEO now; attribution later). `/growth`
  redirects to `/growth/seo`. Not in `BottomNav` (low-frequency). See the SEO
  section below and `docs/seo-dashboard-plan.md`.

### Routes not in top-level nav (accessed from Settings or linked internally)
- `/fleet` + `/fleet/[id]` — fleet vehicle management (add/edit vehicles, mark active/inactive)
- `/crew` + `/crew/[id]` — crew member management (add/edit crew, daily rates, active status)
- `/expenses` — standalone operational expenses page (month-scoped, separate from per-job expenses)
- `/reports` — profit breakdown card + yearly profit chart; uses `summarizeProfit` from `src/lib/profit.ts`
- `/customers` + `/customers/[id]` — customer directory (the "Directory" nav item links here)

---

## Code style & tooling

- **Formatter/linter**: Biome (`biome.json`) — tabs, 100-char lines, double quotes, trailing commas, semicolons
- **ESLint**: `next lint` for Next.js-specific rules only
- **TypeScript**: strict mode, path alias `@/*` → `./src/*`
- Run `npm run check:fix` to auto-fix Biome issues before committing
- CI runs: `tsc --noEmit` → `biome check .` → `vitest run` → `next build`

---

## Testing

```bash
npm test              # vitest run (unit tests)
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

Tests live in `src/lib/__tests__/`. Coverage includes `utils.test.ts`,
`customerDuplicates.test.ts`, `invoices.test.ts` (split-invoice pure helpers),
and the Search Console suite (`searchConsole*.test.ts` — client, sync, dates,
metrics, normalize, aggregate, opportunities, cron route).
Server-only modules are testable because `vitest.config.ts` aliases `server-only`
to a stub (see the SEO section).

---

## Google Calendar integration

- Service account auth via `GCAL_SERVICE_ACCOUNT_KEY` env var (full JSON as single-line string)
- `gcal_calendar_id` must be set in `system_settings` table; calendar must be shared with service account email
- One-way push only — IM Ops is the source of truth; edits in GCal don't sync back
- Failure path: logs error, returns `null`, record saved without `gcal_event_id`

---

## Google Search Console (Growth › SEO)

Internal SEO analytics at `/growth/seo`. Full design + as-built notes in
`docs/seo-dashboard-plan.md` — read it before touching this area. Key points:

- **Data flow:** GSC API → daily Vercel cron (`/api/cron/seo-sync`) → Supabase
  (`seo_*` tables) → Server Component dashboard. Historical load via the local
  `npm run seo:backfill` script. No SERP scraping.
- **Auth:** dedicated read-only service account, `GSC_SERVICE_ACCOUNT_KEY` +
  `GSC_SITE_URL` (mirrors the gcal auth pattern). Cron protected by `CRON_SECRET`.
- **Service-role client (`src/lib/supabase/admin.ts`)** — the app's ONLY RLS
  bypass. Import it *only* from the sync path (sync service, cron route, backfill
  script) or the one-off storage maintenance script
  (`scripts/reencode-png-images.ts`). Never from a user-facing Server Component
  or anything under `src/components/`. It's guarded by `import "server-only"`.
- **`server-only` gotcha:** the bare specifier is only bundled inside `next`, so
  plain Node/tsx/vitest can't resolve it. It's aliased to a no-op stub in
  `vitest.config.ts` (tests) and `scripts/tsconfig.json` (the `tsx` backfill).
  Next's real guard is untouched. Don't remove those aliases.
- **Tables:** `seo_properties`, `seo_target_keywords`, `seo_query_daily`,
  `seo_page_query_daily`, `seo_sync_runs` (migrations `003`/`004`). Metric + sync
  tables are authenticated-read-only; writes go through the service role.
- **Timezone:** all sync/dashboard windows derive from `todayInJakarta()` — never
  UTC. Dashboard reads paginate past PostgREST's 1000-row cap (no aggregate RPCs).

---

## Storage buckets (Supabase Storage, all behind RLS)

| Bucket | Used for |
|---|---|
| `lead-photos` | Lead intake photos |
| `survey-media` | Survey site photos/videos |
| `job-media` | Job documentation photos/videos |
| `proposals` | Generated proposal PDFs |
| `invoices` | Generated invoice PDFs |
| `receipts` | Job expense receipt photos |

Images resized client-side to ≤1600px before upload via `resizeImage` from `lib/utils.ts` — returns `{ blob, ext, contentType }` (WebP when supported, JPEG fallback, PNG last resort). **Never hardcode `.webp` or `image/webp` from `resizeImage` output.**

---

## PDF generation

`@react-pdf/renderer` runs client-side (browser). Requires `wasm-unsafe-eval` in CSP (already set in middleware). PDFs are generated on demand, uploaded to Supabase Storage, and the URL persisted on the record.

---

## i18n

- Default locale: `id` (Indonesian). English (`en`) is fully translated.
- Locale resolved per-request from `imops-locale` cookie; toggled from TopBar.
- No URL prefix — app is auth-gated so locale doesn't need to be SEO-visible.

---

## Known gaps (not yet implemented)

- `/estimations/[id]` (edit existing) — only `/estimations/new` exists
- `next-pwa` installed but service worker + offline expense queue not wired
- Reports missing: avg discount, lost-reason breakdown, AR aging detail, fleet/crew utilization

---

## Active development context (as of 2026-08)

- **Configurable expense grace period** (migration `015`): `expense_grace_days` added to `system_settings` (default 7). `is_job_expenses_locked()` now honours a grace window — expenses remain editable for N days after full payment before locking. Surfaced in `ExpensePanel` via a `graceDays` prop passed from `expenses/page.tsx`; the grace-window banner uses ICU plural in English (`{days, plural, one {# day} other {# days}}`). **Apply migration `015` to Supabase before deploying.**

- **Configurable proposal validity period** (migration `014`): `proposal_valid_days` added to `system_settings` (default 14). Used in `src/lib/pdfSettings.ts` to compute the proposal expiry date printed on PDFs. **Apply migration `014` to Supabase before deploying.**

- **Image uploads: silent PNG fallback fixed** (2026-09-29, no migration): 287 of
  647 `lead-photos` objects were 3 MB PNGs named `.webp` — 855 MB of a 900 MB
  bucket. Cause: `canvas.toBlob(cb, "image/webp", q)` is spec-required to fall
  back to PNG when the browser can't encode the requested type (Safari < 16.4),
  and PNG ignores the quality arg; the upload paths then hardcoded `.webp` /
  `image/webp`. `resizeImage` now returns `{ blob, ext, contentType }` reflecting
  what was actually produced (WebP → JPEG fallback → honest label), and all five
  call sites use it instead of assuming. **Never hardcode an extension or content
  type from `resizeImage`.** Existing objects were repaired in place by
  `npm run storage:reencode` (`scripts/reencode-png-images.ts`, dry-run by
  default, backs up originals locally, verifies via the `/object/info` metadata
  endpoint because the CDN serves stale bytes for `max-age=3600` after an
  upsert). Bucket went 899 MB → 98 MB; all 647 objects are now real WebP.

- **Editable termin amount + post-issue adjustment guard** (migration `012`):
  fixes the case where a job-level discount applied *after* a termin was issued
  left the invoice stale (paid < frozen `total_amount` → stuck `partially_paid`).
  Two parts: (a) both `InvoiceTerminPanel` (termin rows) and `InvoiceTotalEditor`
  (the invoice detail total row — covers a master grand total left stale by a later
  adjustment AND a standalone/un-split invoice) now inline-edit `total_amount` via
  direct PostgREST `update`; migration `012` adds an `after_invoice_total_change`
  trigger so editing `total_amount` re-runs `recompute_invoice_paid` and re-derives
  status (previously only payment writes did — no recursion: recompute never sets
  `total_amount`). (b) `JobAdjustmentsPanel`
  shows a non-blocking warning (`panels.adjustments.issuedWarning`) when the job
  has open (unpaid, non-cancelled) leaf invoices, steering the operator to edit the
  termin instead of stacking a job adjustment. Job-level AR (`job_outstanding`,
  `jobs.revenue`) was already correct; this aligns the per-invoice/leaf layer.
  **Guard + audit** (migration `013`): a `before_invoice_total_valid` trigger floors
  edits at `total_amount >= paid_amount` and `> 0` (fires only on INSERT/UPDATE OF
  `total_amount`, so the payment path — which only writes `paid_amount` — and
  legitimate overpayments are untouched); both editors mirror the floor client-side
  for a friendly message and log every total change to `job_timeline`
  (`event_type = 'invoice_total_edited'`). Role-gating who may edit is deferred to
  `docs/rbac-plan.md`. Also: `src/lib/supabase/client.ts` now memoizes the browser
  client (one instance) to stop the noisy Web Lock `LockManager` auth warning.
  **Apply migrations `012` and `013` to Supabase before deploying.**

- **Evidence galleries support video** (migration `011`): lead photos, survey
  media, and job media now accept video alongside images. `lead_photos` gained a
  `media_type ('photo'|'video')` column; `job_media`'s check widened to
  `('photo'|'video'|'pdf')`; `survey_media` already allowed video. Uploads: images
  still go through `resizeImage`; videos through `prepareVideoUpload` (in
  `lib/utils.ts`) — under 50 MB uploads as-is (no re-encode), over 50 MB does a
  best-effort real-time downscale to 1080p via canvas + `MediaRecorder`, and
  throws `VideoTooLargeError` if it still can't fit. Display: shared `MediaThumb`
  (grid tiles) + `PhotoLightbox`'s `kind: 'video'` branch render native `<video>`.
  CSP gained a `media-src` directive (Supabase + blob:). **Apply migration `011`
  to Supabase before deploying.**

- **Lead addresses normalized to a child table** (migration `010`): unlimited
  pickups AND destinations per lead. Replaces the old flat `leads.pickup_address`
  / `destination_address` / `destination_address_2` (+ lat/lng) columns with
  `lead_addresses(lead_id, role 'pickup'|'destination', seq, address, lat, lng)`.
  Read via embed `leads(lead_addresses(role, seq, address, lat, lng))` + the
  `groupLeadAddresses` / `routePoints` helpers in `src/lib/leadAddresses.ts`;
  write via `replaceLeadAddresses` (delete-then-insert). `RouteLine` now takes
  `points: string[]`. Forms use `AddressListInput` (dynamic add/remove on top of
  `LocationInput`); detail views render each stop via `AddressLink`
  (`src/components/shared/`) — a Maps directions link when the stop has coords,
  plain text otherwise (raw lat/lng is never user-facing). `LocationInput` also
  supports free-typed addresses (not just Google suggestions), closes its
  autocomplete on blur, and resolves pasted `maps.app.goo.gl` share links
  server-side via `resolveMapUrl` (returns `{ lat, lng, address }` — address from
  the link's `q=`; the client then geocodes that address for an accurate pin,
  because the page-body coords are only the map viewport center and can be far from
  the actual place). **Search:** a denormalized
  `leads.addresses_text` (GIN trgm,
  trigger-maintained from `lead_addresses`) — list/card views that read the
  `leads_with_customer` view use `addresses_text` + `routePointsFromText`, since
  embedding a child table through a view isn't reliable. The old flat columns are
  dropped by migration `010`. **Apply migration `010` to Supabase before deploying.**

- **Job-expense lock fixed + hardened** (migration `009`): the pre-split lock used
  `invoices.some(status === 'paid')`, which fired on the first paid termin. Now the
  lock is job-level (see invariant 9) — master rolled-up total, or payments vs
  `jobs.revenue` when there's no invoice. Enforced both in the UI (`ExpensePanel`
  now hides the entry form and guards its mutation handlers) and via the
  `before_expense_lock_check` DB trigger so the lock holds even though expenses are
  written client-side (direct PostgREST, no server action). **Apply migration `009`
  to Supabase before deploying.**

- **Split invoices + job change-orders shipped** (migrations `006`/`007`): payable
  master + termin-children invoice model per job; `job_adjustments` with derived
  `jobs.revenue`; `JobInvoicesPanel`, `JobAdjustmentsPanel`, `AttachablePayments`
  components; smart-target `PaymentsPanel` (0/1/2+ leaves); master/leaf invoice
  detail split; leaf-only AR de-dup in views + RPCs. **Migrations must be applied
  to Supabase before deploying this code.** See `docs/split-invoices-and-change-orders-plan.md`.

- **Growth › SEO dashboard shipped** (`/growth/seo`): GSC integration, daily cron,
  backfill, KPI cards, keyword table, position trend chart (inline SVG), top
  queries/pages, opportunity engine, manual refresh. First service-role usage in
  the app. Remaining: deployment-gated (Vercel env + cron), and an eventual
  Settings UI to manage target keywords. See `docs/seo-dashboard-plan.md`.


- Phase 1 UX redesign complete: semantic token system, drag-to-advance pipeline, `/today` cockpit, mobile bottom-nav, AR aging in `/money`
- eSign flow live: proposals use eSign exclusively (no handwritten signature pad); public `/verify/[token]` route for recipient verification
- Revenue targets: monthly targets stored in `system_settings`, surfaced in `/today` and `/money`
- Job status is now derived (`deriveJobStatus`) from `move_date` — no stored status states
- Google Maps location input (`LocationInput`) on lead forms; coordinates stored in DB
- GCal retry button (`GCalRetryButton`) wired on job + survey detail pages
- Lead + proposal duplication buttons (`LeadDuplicateButton`, `ProposalDuplicateButton`) live on detail pages
- Remaining: reports metrics gaps, manual dark-mode QA pass
- Branding: "IM Operations" (not "Indo Mover")
