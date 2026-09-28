# IM Ops — Architecture Diagrams

Mermaid-compatible. Render in GitHub, VS Code (Mermaid Preview), or any compatible viewer.

---

## 4. Middleware & Auth Flow

### Request gate (every HTTP request)

```mermaid
flowchart TD
  REQ([Incoming request]) --> MATCHER{Matches middleware?\nexclude: _next/static\n_next/image · favicon\nmanifest · icons}
  MATCHER -- no --> BYPASS([Pass through])
  MATCHER -- yes --> HEADERS[Attach security headers to response\nX-Frame-Options · X-Content-Type-Options\nReferrer-Policy · Permissions-Policy\nCSP nonce · HSTS in prod]
  HEADERS --> PUBLIC{Public route?\n/ · /login · /auth/*\n/privacy · /terms\n/verify/* · /api/cron/*}
  PUBLIC -- yes --> ALLOW([Return response])
  PUBLIC -- no --> SESSION[Refresh Supabase session\nsupabase.auth.getUser]
  SESSION --> AUTH{Authenticated?}
  AUTH -- yes --> ALLOW
  AUTH -- no --> REDIR([Redirect → /login])
```

> `/api/cron/*` is exempt from the session gate — Vercel Cron has no user session. The route handler enforces its own `CRON_SECRET` bearer check instead.
> CSP uses `'unsafe-inline' + 'unsafe-eval'` in development (for React Fast Refresh) and a nonce-based `'strict-dynamic'` policy in production. `'wasm-unsafe-eval'` is always included for `@react-pdf/renderer`.

---

### Google OAuth login sequence

```mermaid
sequenceDiagram
  actor Op as Operator
  participant App as IM Ops (Next.js)
  participant SB as Supabase Auth
  participant G as Google OAuth

  Op->>App: GET /login
  App-->>Op: Login page (Sign in with Google button)
  Op->>App: Click sign-in
  App->>SB: signInWithOAuth({ provider: "google" })
  SB-->>Op: Redirect → Google consent screen
  Op->>G: Grant access
  G-->>SB: Auth code callback
  SB->>G: Exchange code for tokens
  G-->>SB: Access + ID tokens
  SB-->>App: GET /auth/callback?code=…
  App->>SB: exchangeCodeForSession(code)
  SB-->>App: Session cookies set
  App-->>Op: Redirect → /today (safe allowlist)
```

> The redirect target on callback is validated against a 14-route allowlist in `/auth/callback/route.ts`. Unknown targets fall back to `/today`.

---

## 5. Expense Lock Decision Tree

```mermaid
flowchart TD
  START([Job expenses page loaded]) --> CANCEL{job.status\n= cancelled?}
  CANCEL -- yes --> LOCKED_CANCEL[🔒 Locked\nReason: job cancelled]

  CANCEL -- no --> HAS_INV{Active master\ninvoice exists?}

  HAS_INV -- yes --> INV_PAID{master.paid_amount\n≥ master.total_amount\nAND total_amount > 0?}
  INV_PAID -- no --> OPEN_INV([✅ Open — normal editing])

  HAS_INV -- no --> NO_INV_PAID{totalPaid\n≥ job.revenue\nAND revenue > 0?}
  NO_INV_PAID -- no --> OPEN_NO_INV([✅ Open — no invoice yet])

  INV_PAID -- yes --> GRACE_INV{Days since latest\npayment ≤ expense_grace_days?}
  NO_INV_PAID -- yes --> GRACE_NO_INV{Days since latest\npayment ≤ expense_grace_days?}

  GRACE_INV -- yes --> BANNER_INV[✅ Open with grace banner\nShows close date]
  GRACE_NO_INV -- yes --> BANNER_NO_INV[✅ Open with grace banner\nShows close date]

  GRACE_INV -- no --> LOCKED_INV[🔒 Locked\nReason: invoice fully paid]
  GRACE_NO_INV -- no --> LOCKED_FULL[🔒 Locked\nReason: fully collected]
```

> **Two enforcement points must stay in sync:**
> 1. UI — `expenses/page.tsx` derives `lockReason` / `graceEndsAt` and passes to `ExpensePanel`, which hides the form and guards its mutation handlers
> 2. DB — `before_expense_lock_check` trigger → `is_job_expenses_locked()` function (migration `009`) blocks INSERT/UPDATE/DELETE even for direct PostgREST writes
>
> `expense_grace_days` comes from `system_settings` (default 7). Payment dates are converted to Jakarta timezone before comparison.

---

## 6. Data-Fetch Architecture (RSC Pattern)

```mermaid
flowchart TD
  subgraph SERVER["Server (Vercel Edge / Node)"]
    SC[Server Component\npage.tsx]
    SA[Server Action\n'use server']
    QH[Query helpers\ngetSystemSettings · getActiveFleet · getActiveCrew\nReact cache — deduped per render pass]
    SBS[Supabase server client\ncreateClient — cookie-based auth · RLS enforced]
    ADMIN[Supabase admin client\nadmin.ts — bypasses RLS\nSEO sync + storage scripts only]
  end

  subgraph CLIENT["Browser"]
    CC[Client Component\n'use client']
    SBC[Supabase browser client\ncreateBrowserClient — memoised singleton]
    HOOK[useReceiptUrls\nSigns private storage URLs\non demand · cached 60 s margin]
  end

  SC -->|fetch on render| QH
  QH --> SBS
  SC -->|pass data as props| CC
  CC -->|form submit / mutation| SA
  SA --> SBS
  CC -->|interactive read/write\ndirect PostgREST| SBC
  CC --> HOOK
  HOOK --> SBC
  SBS --> ADMIN
```

**Rules:**
- Data fetches default to Server Components — never fetch in a client component unless the data is interactive (e.g., live mutation feedback)
- `getSystemSettings()` / `getActiveFleet()` / `getActiveCrew()` in `src/lib/supabase/queries.ts` wrap with `React.cache()` so multiple Server Components on the same page share one query
- Server Actions (`src/app/actions/`) handle form submissions and server-only work (PDF asset resolution, map URL resolution, locale switching)
- Client-side direct PostgREST is used for expense entry and other write paths that don't need Server Action overhead — the DB trigger is the safety net
- Private bucket reads (receipts) are signed on-demand via `useReceiptUrls` + `batchSignedUrls`; public bucket reads (proposals, invoices) use plain public URLs

---

## 7. Proposal PDF & eSign Verification Flow

```mermaid
sequenceDiagram
  actor Op as Operator
  actor Cl as Client
  participant UI as Browser (Client Component)
  participant SA as getPdfAssets\n(Server Action)
  participant PDF as @react-pdf/renderer\n(client-side WASM)
  participant SB as Supabase
  participant VFY as /verify/[token]\n(public route)

  Note over Op,SB: Proposal detail page load (Server Component)
  Op->>SB: Fetch proposal incl. verification_token
  SB-->>UI: Proposal data + token passed as props

  Note over Op,UI: Operator clicks Download PDF
  Op->>UI: Click download
  UI->>SA: getPdfAssets(logoUrl, verificationToken)
  SA->>SA: resolveLogoDataUrl — fetch logo, encode base64
  SA->>SA: QRCode.toDataURL — generate QR pointing to /verify/{token}
  SA-->>UI: { logoDataUrl, verificationQrUrl, verificationUrl }

  UI->>PDF: Render ProposalPDF with all assets
  PDF->>PDF: renderPdfToFit — retry at smaller scales until 1 page
  PDF-->>UI: PDF Blob

  UI->>Op: Browser downloads PDF file

  Note over Op,Cl: Operator sends PDF to client (email / WhatsApp)

  Cl->>Cl: Open PDF, scan QR code
  Cl->>VFY: GET /verify/{token}  ← no auth required
  VFY->>SB: RPC verify_document_by_token(token)
  SB-->>VFY: { doc_type, doc_number, issued_at, signatory_name, company_name }
  VFY-->>Cl: Verified ✅ card  or  Not found ✗
```

> **Key points:**
> - PDF generation is entirely client-side (WASM via `@react-pdf/renderer`); this is why `'wasm-unsafe-eval'` is in the CSP
> - The QR code is generated server-side in the Server Action so the `qrcode` library doesn't ship to the browser bundle
> - `verification_token` is a pre-generated UUID stored on the proposal record; it never expires
> - `/verify/[token]` is a public route (no auth) — it's in the middleware allowlist
> - The same eSign pattern applies to invoices and payment receipts (each has its own `verification_token`)

## 1. Entity Lifecycle

### Pipeline

```mermaid
flowchart LR
  L[Lead] -->|book survey| S[Survey]
  L -->|skip survey| E[Estimation]
  S -->|survey done| E
  E -->|generate| P[Proposal]
  P -->|client approves| J[Job]
  J -->|generate| I[Invoice]
  I -->|split into termin| T[Termin children]
  I -->|record payment| Py[Payment]
  T -->|record payment| Py
```

---

### Lead status machine

```mermaid
stateDiagram-v2
  direction LR
  [*] --> new

  new --> survey_scheduled : book survey
  survey_scheduled --> survey_done : survey completed
  survey_done --> estimating : estimation started
  estimating --> proposal_sent : proposal created
  new --> estimating : skip survey

  proposal_sent --> converted : job created
  converted --> [*]

  new --> closed_lost
  survey_scheduled --> closed_lost
  survey_done --> closed_lost
  estimating --> closed_lost
  proposal_sent --> closed_lost
  closed_lost --> [*]
```

> `converted` ⟺ a job exists. `proposal_sent` ⟺ at least one non-terminal proposal. Both are kept in sync by app logic — not triggers.

---

### Proposal status machine

```mermaid
stateDiagram-v2
  direction LR
  [*] --> draft

  draft --> sent : send to client
  sent --> negotiating : client counters
  negotiating --> sent : revised proposal issued

  sent --> approved : client accepts
  negotiating --> approved : client accepts

  sent --> lost : client declines
  negotiating --> lost

  sent --> expired : validity period elapsed (proposal_valid_days)
  negotiating --> expired

  approved --> [*]
  lost --> [*]
  expired --> [*]
```

> Once `approved`: `final_price`, `proposal_number`, and the estimation snapshot are **immutable**.

---

### Invoice status machine

```mermaid
stateDiagram-v2
  direction LR
  [*] --> sent : invoice generated (no draft state)

  sent --> partially_paid : partial payment recorded
  partially_paid --> paid : balance cleared
  sent --> paid : full payment in one step

  sent --> overdue : past due date
  partially_paid --> overdue

  sent --> cancelled
  partially_paid --> cancelled
  overdue --> cancelled

  paid --> [*]
  cancelled --> [*]
```

> Status is auto-advanced by the `update_invoice_status` trigger when payments are recorded. On a child invoice the trigger also rolls up `paid_amount` and status to the master.

---

### Job status (derived — not stored)

```mermaid
stateDiagram-v2
  direction LR
  [*] --> upcoming : move_date in the future
  upcoming --> today : move_date is today (Jakarta)
  today --> done : move_date passed
  upcoming --> cancelled : dbStatus = cancelled
  today --> cancelled
```

> `deriveJobStatus(moveDate, dbStatus)` computes this on every read. There is no `status` column on `jobs`.

---

## 2. Invoice & Payment Model

```mermaid
erDiagram
  jobs {
    bigint base_revenue "copied from proposal at conversion — never changes"
    bigint revenue "base_revenue + sum(job_adjustments.amount) — trigger-derived"
  }
  invoices {
    uuid parent_invoice_id "NULL = master invoice   SET = termin child"
    bigint total_amount "editable; floor is paid_amount and must be > 0"
    bigint paid_amount "rollup trigger (master) or direct from payments (leaf)"
    string status "sent | partially_paid | paid | overdue | cancelled"
  }
  payments {
    bigint amount
    uuid invoice_id "always a leaf invoice — never the master when children exist"
  }
  job_adjustments {
    bigint amount "positive = extra charge   negative = discount"
    string reason
  }

  jobs ||--o| invoices : "one active master\n(partial unique index)"
  invoices ||--o{ invoices : "master → termin children\n(parent_invoice_id)"
  invoices ||--o{ payments : "leaf invoices only"
  jobs ||--o{ job_adjustments : "change orders"
```

**Key rules:**
- One active master per job enforced by: `UNIQUE (job_id) WHERE parent_invoice_id IS NULL AND status <> 'cancelled'`
- Payments always attach to **leaf** invoices (termin children if any exist, else the master itself)
- Master `paid_amount` is trigger-rolled-up from children — never written directly
- Editing `total_amount` re-runs `recompute_invoice_paid` and re-derives status (migration `012`)
- AR views and RPCs use leaf-only filters to avoid double-counting master + children

---

## 3. System Context (C4 Level 1)

```mermaid
C4Context
  title System Context — IM Operations

  Person(op, "Operator", "Internal staff, single org, Google-authenticated")

  System(app, "IM Operations", "Next.js 14 on Vercel\nlead → estimation → proposal → job → invoice → payment")

  SystemDb_Ext(sb, "Supabase", "Postgres DB\nStorage (6 buckets)\nAuth (Google OAuth)")
  System_Ext(gcal, "Google Calendar", "Job + survey scheduling\none-way push only")
  System_Ext(gsc, "Google Search Console", "SEO metrics\nread-only, daily cron")
  System_Ext(gmaps, "Google Maps Platform", "Address autocomplete\n+ geocoding (optional)")
  System_Ext(vercel, "Vercel", "Hosting + edge middleware\n+ daily cron trigger")

  Rel(op, app, "Uses", "HTTPS / browser")
  Rel(app, sb, "Reads + writes (RLS enforced)", "Supabase JS client")
  Rel(app, gcal, "Pushes job + survey events", "Service account key\n(GCAL_SERVICE_ACCOUNT_KEY)")
  Rel(app, gsc, "Pulls daily search metrics", "Service account key\n(GSC_SERVICE_ACCOUNT_KEY)")
  Rel(app, gmaps, "Geocodes + autocompletes addresses", "API key\n(NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)")
  Rel(vercel, app, "Triggers /api/cron/seo-sync daily", "Bearer CRON_SECRET")
```

**Auth detail:** Google OAuth is brokered by Supabase Auth — the app never calls Google OAuth directly. Middleware gates every route except `/login`, `/auth`, `/privacy`, `/terms`, `/verify`. `/verify/[token]` is a public eSign verification route.
