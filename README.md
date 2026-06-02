# IM Ops

Internal operational platform for moving/logistics coordination. Captures leads from first contact, runs them through estimation and proposal negotiation, converts approved proposals into scheduled jobs, tracks expenses + live profit during execution, and closes the loop with invoicing and payments.

Built around workflows, not modules. **Current UI/UX + design system: `imops_redesign_plan_1.md`.** The original blueprints (`imops_implementation_spec_1.md`, `imops_detailed_plan_1.md`) document the data model + workflows; their UI/IA sections are superseded by the redesign.

## Stack

| Layer        | Choice |
|--------------|--------|
| Framework    | Next.js 14 (App Router) + React 18 + TypeScript |
| Styling      | Tailwind CSS + custom brand tokens, dark mode via `class` strategy |
| Backend / DB | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Auth         | Supabase Auth — Google OAuth only |
| PDF          | `@react-pdf/renderer` (client-side proposal + invoice PDFs) |
| Calendar     | Google Calendar API push (one-way sync) |
| State        | Zustand + React Server Components |
| PWA          | `next-pwa` (configured in `package.json`; runtime wiring pending) |

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` from the example and fill in the values:
   ```bash
   cp .env.local.example .env.local
   ```

   Required:
   - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key

   Optional (Google Calendar push sync):
   - `GCAL_CLIENT_ID`, `GCAL_CLIENT_SECRET`, `GCAL_REFRESH_TOKEN`
   - Plus `gcal_calendar_id` in the `system_settings` table

3. Apply the database migrations in order via the Supabase SQL Editor:
   ```
   supabase/migrations/001_initial_schema.sql        ← all 17 tables, RLS, views, functions, seed settings
   supabase/migrations/002_generate_job_number.sql   ← atomic job number generation (generate_job_number RPC)
   supabase/migrations/003_performance_indexes.sql   ← performance indexes for all high-frequency query paths
   ```

4. In Supabase Auth, enable the **Google** provider and add `http://localhost:3000/auth/callback` (and your prod URL) as redirect URLs.

5. Run the dev server:
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command         | What it does |
|-----------------|--------------|
| `npm run dev`   | Next.js dev server on :3000 |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint`  | ESLint (`next lint`) |

## Routes

> UI/UX is organized around a flat workflow nav — **Today · Pipeline · Jobs · Calendar · Money · Directory · Settings** — with sub-tabs grouping the underlying routes. See `imops_redesign_plan_1.md` for the design system + IA. Routes stay backward-compatible (the URLs below still resolve).

```
/login                          Google OAuth entry
/today                          Operator triage cockpit (replaces /dashboard, which redirects here)

/pipeline                       Deal funnel board (drag-to-advance) — groups Leads + Proposals

/leads                          List of all leads
/leads/new                      Create lead  (also: global Quick-Lead modal via the "+ New lead" button)
/leads/[id]                     Deal hub — lifecycle timeline + status-driven action panel
/leads/[id]/edit

/surveys/[id]                   Survey detail + media upload

/estimations/new?proposal_id=…  Estimation form + live breakdown

/proposals                      Proposal list
/proposals/[id]                 Detail + negotiation history + actions

/jobs                           Job list / Board view toggle (?view=board)
/jobs/[id]                      Job hub (overview, assignments, expenses, timeline, invoice)
/jobs/[id]/edit
/jobs/[id]/assignments          Crew + fleet assignment
/jobs/[id]/expenses             Mobile-optimized quick expense entry

/calendar                       FullCalendar — surveys + jobs

/money                          "Where's the cash" hub — AR aging, payments, invoice breakdown

/customers                      Customer list   (Directory tab)
/customers/[id]                 Customer history (leads, jobs)
/customers/[id]/edit
/customers/new

/fleet  /fleet/[id]  /fleet/[id]/edit  /fleet/new   (Directory tab — formerly "vendors")
/crew   /crew/[id]   /crew/[id]/edit   /crew/new     (Directory tab)

/invoices                       Invoice list   (Money tab)
/invoices/[id]                  Detail + payment recording + PDF download

/reports                        Sales / operational / financial summary   (Money tab)
/settings                       system_settings editor (pricing, margins, etc.)
```

## Repo layout

```
src/
├── app/
│   ├── (dashboard)/            All authenticated routes
│   ├── auth/callback/          Supabase OAuth callback handler
│   ├── login/                  Public login page
│   ├── layout.tsx              Root layout + dark-mode bootstrap
│   └── globals.css             Tailwind layers + brand tokens
├── components/
│   ├── calendar/               FullCalendar + mobile variant
│   ├── crew/  customers/  fleet/
│   ├── dashboard/
│   ├── estimation/             EstimationForm
│   ├── invoices/               InvoicePDF, PaymentsPanel, GenerateInvoiceButton
│   ├── jobs/                   ExpensePanel, AssignmentsPanel, JobMarkDoneButton
│   ├── layout/                 Sidebar, TopBar, ThemeToggle, DashboardShell
│   ├── leads/                  LeadActionPanel, LeadPhotoGallery
│   ├── proposals/              ProposalPDF, NegotiationHistory, ProposalActionPanel
│   ├── settings/
│   ├── shared/                 StatusChip, WhatsAppButton, PhotoLightbox
│   └── surveys/                SurveyDetailClient
├── lib/
│   ├── estimation/engine.ts    Cost + suggested price calculation
│   ├── gcal/sync.ts            Google Calendar push (never blocks core ops)
│   ├── pdfSettings.ts          PDF document defaults
│   ├── supabase/               client.ts, server.ts, types.ts
│   └── utils.ts                formatRupiah, formatDate, resizeImage…
└── middleware.ts               Auth gate

supabase/migrations/            See "Quick start" step 3
```

## Workflow overview

```
Lead Intake  →  Survey (optional)  →  Estimation  →  Proposal
                                                       │
                          ┌────── Negotiate ──────────┘
                          │
                      Approved
                          │
                          ▼
                  Convert to Job
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
        Schedule     Assign Crew    Push to
        (move_date)  + Fleet         Google Calendar
                          │
                          ▼
                   Execute the move
                   - Log expenses (mobile)
                   - Live profit panel
                   - Timeline events
                          │
                          ▼
                  Complete → Generate Invoice → Record Payments → Close
```

The full action map (every button, what it requires, what it writes) lives in `imops_implementation_spec_1.md` section 12.

## Data model — key invariants

- **Lead status mirrors reality.** `converted` ⇔ a job exists; `proposal_sent` ⇔ at least one non-terminal proposal.
- **Proposal locks on approval.** `final_price`, `proposal_number`, and the estimation snapshot become immutable.
- **Job revenue is locked at conversion.** Copied from `proposal.final_price` — subsequent proposal edits don't move it.
- **One job per proposal** (unique constraint on `jobs.proposal_id`).
- **Estimations store a `settings_snapshot`** so historical pricing stays explainable even after `system_settings` changes.
- **Calendar failures never block core ops.** `lib/gcal/sync.ts` returns `null` on failure; the record is created without a `gcal_event_id`.

## Integrations

- **Google Calendar** — one-way push for surveys + jobs (color-coded). OAuth via refresh token stored as env vars. Editing or deleting in GCal does not sync back; IM Ops is the operational truth.
- **WhatsApp** — deeplinks only (`wa.me/…?text=…`). No WhatsApp Business API. The operator taps a button, the OS opens WhatsApp with a pre-filled message, and the operator sends it from their own account.
- **PDF** — `@react-pdf/renderer` for both proposals and invoices. Generated client-side, uploaded to Supabase Storage, URL persisted on the record.
- **Storage buckets** — `lead-photos`, `survey-media`, `proposals`, `invoices` (all behind RLS; see migration 002).

## Conventions

- Server Components by default; `"use client"` only where interaction or browser APIs are needed.
- Currency stored as `BIGINT` (IDR, no decimals). Formatted via `formatRupiah` in `lib/utils.ts`.
- Photos resized client-side to 1600px WebP before upload (`resizeImage` in `lib/utils.ts`).
- Status badges go through `StatusChip` + per-domain variant helpers (`leadStatusVariant`, `jobStatusVariant`, …).
- All tables have RLS enabled; the single-org policy grants full access to any authenticated user.

## Known gaps vs. spec

These are tracked but not yet implemented:

- `payments` is FK'd to `invoices.id` instead of `jobs.id` — down payments before invoice generation aren't supported yet.
- No retry button when Google Calendar push fails (`gcal_event_id IS NULL`).
- No proposal/lead duplication for re-quotes.
- `/estimations/[id]` (edit existing estimation) — only the `new` route exists.
- `next-pwa` is installed but the service worker + offline expense queue aren't wired.
- Reports are minimal — missing avg discount, lost-reason breakdown, AR aging, fleet/crew utilization.
