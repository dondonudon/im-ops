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
- Middleware (`src/middleware.ts`) gates every route except `/login`, `/auth`, `/privacy`, `/terms`
- OAuth callback is at `/auth/callback/route.ts` with safe redirect allowlist (13 routes)
- RLS is enabled on all tables — single-org policy, any authenticated user gets full access

### Data layer
- Supabase JS client: `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts` (server)
- Full DB types auto-generated into `src/lib/supabase/types.ts`
- All currency stored as `BIGINT` (IDR, no decimals). Never use `FLOAT` or `DECIMAL` for money.
- Migrations live in `supabase/migrations/` — 23 files, run in numeric order via Supabase SQL Editor

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

### Status colors
`toneFor(entity, status)` in `src/components/ui/status.ts` is the **single source of truth** for mapping any domain status to a semantic tone. Never hardcode status colors inline.

---

## Data model invariants — DO NOT BREAK

These are enforced at the DB level and in app logic:

1. **Lead status mirrors reality.** `converted` ⟺ a job exists; `proposal_sent` ⟺ at least one non-terminal proposal.
2. **Proposals lock on approval.** `final_price`, `proposal_number`, and the estimation snapshot become immutable once `status = 'approved'`.
3. **Job revenue locked at conversion.** Copied from `proposal.final_price` at the moment of job creation — never recalculated from proposal edits afterward.
4. **One job per proposal.** `jobs.proposal_id` has a unique constraint.
5. **Estimations store a `settings_snapshot`.** The JSONB snapshot captures `system_settings` at estimation time so historical pricing stays explainable.
6. **Invoice status starts at `sent`** (no draft state). Lifecycle: `sent` → `partially_paid` / `paid` / `overdue` / `cancelled`. The `update_invoice_status` trigger auto-advances status when payments are recorded.
7. **Calendar failures are non-fatal.** `lib/gcal/sync.ts` always returns `null` on failure; records are created without `gcal_event_id`. Never let a gcal error block a write.

---

## Key files

| File | Role |
|---|---|
| `src/middleware.ts` | Auth gate + CSP headers (nonce-based strict-dynamic in prod, wasm-unsafe-eval for react-pdf) |
| `src/lib/supabase/types.ts` | Full DB type definitions — regenerate after schema changes |
| `src/lib/supabase/client.ts` | Browser client (for Client Components) |
| `src/lib/supabase/server.ts` | Server client (for Server Components + Actions) |
| `src/lib/estimation/engine.ts` | ENGINE_VERSION 2.5.1 — cost + margin calculation, tiered margin table |
| `src/lib/gcal/sync.ts` | Google Calendar push sync (never blocks) |
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

// Tailwind merging
cn("base-class", condition && "conditional-class", "override")

// Sanitize before passing to PostgREST ilike/fts
sanitizeSearch(query)

// Resize before upload (≤1600px WebP, ~300KB)
const resized = await resizeImage(file)
```

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

Flat top-level nav: **Today · Pipeline · Jobs · Calendar · Money · Directory · Settings**

- `Sidebar` (desktop) + `BottomNav` (mobile, `md:hidden`) — both in `src/components/layout/`
- Sub-tabs (Pipeline, Money, Directory) handled by `SectionTabs` within each page
- `/today` is the operator triage cockpit — this is the post-login landing page
- `/dashboard` redirects to `/today` (legacy URL compatibility)

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

Tests live in `src/lib/__tests__/`. Current coverage: `utils.test.ts`, `customerDuplicates.test.ts`.

---

## Google Calendar integration

- Service account auth via `GCAL_SERVICE_ACCOUNT_KEY` env var (full JSON as single-line string)
- `gcal_calendar_id` must be set in `system_settings` table; calendar must be shared with service account email
- One-way push only — IM Ops is the source of truth; edits in GCal don't sync back
- Failure path: logs error, returns `null`, record saved without `gcal_event_id`

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

- `payments` is FK'd to `invoices.id` — down payments before invoice generation aren't supported
- No retry UI when Google Calendar push fails (`gcal_event_id IS NULL`)
- No proposal/lead duplication for re-quotes
- `/estimations/[id]` (edit existing) — only `/estimations/new` exists
- `next-pwa` installed but service worker + offline expense queue not wired
- Reports missing: avg discount, lost-reason breakdown, AR aging detail, fleet/crew utilization

---

## Active development context (as of 2026-07)

- Phase 1 UX redesign complete: semantic token system, drag-to-advance pipeline, `/today` cockpit, mobile bottom-nav, AR aging in `/money`
- Remaining: reports metrics gaps, manual dark-mode QA pass
- Branding: "IM Operations" (not "Indo Mover")
