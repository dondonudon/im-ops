# CLAUDE.md — IM Ops Agent Handover

Agent-facing reference for this codebase. Read this before touching anything.

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
- Full DB types auto-generated into `src/lib/supabase/types.ts`
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
- `StatusChip` (in `src/components/shared/`) — status dot + label; uses `toneFor(entity, status)`
- `LocationInput` (in `src/components/shared/`) — address search + map pin via Google Maps; stores lat/lng; requires `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` env var (optional — input degrades gracefully without it)

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

---

## Key files

| File | Role |
|---|---|
| `src/middleware.ts` | Auth gate + CSP headers (nonce-based strict-dynamic in prod, wasm-unsafe-eval for react-pdf) |
| `src/lib/supabase/types.ts` | Full DB type definitions — regenerate after schema changes |
| `src/lib/supabase/client.ts` | Browser client (for Client Components) |
| `src/lib/supabase/server.ts` | Server client (for Server Components + Actions) |
| `src/lib/supabase/admin.ts` | Service-role client — **bypasses RLS**; `server-only`; SEO sync path only (see Growth/SEO) |
| `src/lib/supabase/queries.ts` | Shared query helpers used across Server Components + Actions |
| `src/lib/search-console/` | GSC client, two-dataset sync, dashboard queries, aggregation, opportunity engine (all `server-only` where they touch secrets) |
| `src/app/api/cron/seo-sync/route.ts` | Daily GSC sync cron (bearer `CRON_SECRET`); `/api/cron` is exempt in middleware |
| `vercel.json` | Vercel cron schedule (daily SEO sync) |
| `src/lib/pdfSettings.ts` | PDF document defaults (fonts, margins, signature/eSign settings) |
| `src/lib/estimation/engine.ts` | ENGINE_VERSION 2.5.1 — cost + margin calculation, tiered margin table |
| `src/lib/gcal/sync.ts` | Google Calendar push sync (never blocks) |
| `src/lib/invoices.ts` | Pure helpers: `deriveJobRevenue`, `splitSumStatus`, `deriveInvoiceStatus`, `rollupMasterPaid`, `billableLeaves` |
| `src/lib/utils.ts` | `formatRupiah`, `parseRupiah`, `formatDate`, `cn`, `resizeImage`, `sanitizeSearch` |
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

// Resize before upload (≤1600px WebP, ~300KB)
const resized = await resizeImage(file)

// Today's date in Jakarta time (use this — never new Date().toISOString().slice(0,10))
todayInJakarta()  // → "2026-07-31"
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
  script). Never from a user-facing Server Component or anything under
  `src/components/`. It's guarded by `import "server-only"`.
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
| `proposals` | Generated proposal PDFs |
| `invoices` | Generated invoice PDFs |
| `receipts` | Job expense receipt photos |

Images resized client-side to ≤1600px WebP before upload (`resizeImage` from `lib/utils.ts`).

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
