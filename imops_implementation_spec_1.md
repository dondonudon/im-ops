# IM Ops — Implementation Spec

> ⚠️ **Original blueprint.** The data model, workflows and action map below remain
> current (note: the `vendors` table/concept is now **`fleet`**). The UI / screen /
> IA descriptions are **superseded by the redesign** — see `imops_redesign_plan_1.md`.

> Built around workflows, not modules. Every action is specified: what triggers it, what it writes, what it unlocks next.
> Last updated: May 2026

---

## How to Read This Document

Each workflow section follows this pattern:

```
USER ACTION
  → What the UI shows / enables
  → What DB operations execute (in order)
  → What state changes on which records
  → What becomes available next
```

This is the connective tissue. Build the modules; use this to wire them together.

---

## Table of Contents

1. [Screen Inventory](#1-screen-inventory)
2. [Database Schema with Relationships](#2-database-schema-with-relationships)
3. [Workflow 1: Lead Intake](#3-workflow-1-lead-intake)
4. [Workflow 2: Survey (Optional Path)](#4-workflow-2-survey-optional-path)
5. [Workflow 3: Estimation](#5-workflow-3-estimation)
6. [Workflow 4: Proposal & Negotiation](#6-workflow-4-proposal--negotiation)
7. [Workflow 5: Job Creation & Scheduling](#7-workflow-5-job-creation--scheduling)
8. [Workflow 6: Job Execution & Expenses](#8-workflow-6-job-execution--expenses)
9. [Workflow 7: Invoice & Payment](#9-workflow-7-invoice--payment)
10. [Cross-Module State Rules](#10-cross-module-state-rules)
11. [Supabase Functions & Triggers](#11-supabase-functions--triggers)
12. [UI Action Map](#12-ui-action-map)
13. [Component Tree](#13-component-tree)

---

## 1. Screen Inventory

Every screen in the app and what it owns:

```
/login                          ← Google OAuth entry

/dashboard                      ← Summary: active jobs, open proposals, unpaid invoices

/leads                      ← List of all leads
/leads/new                  ← Create lead form
/leads/[id]                 ← Lead detail + action panel

/surveys/[id]                   ← Survey detail (reached from lead detail)

/estimations/[id]               ← Estimation calculator (reached from lead or proposal)

/proposals                      ← List of all proposals
/proposals/[id]                 ← Proposal detail + negotiation history + actions

/jobs                           ← List of all jobs
/jobs/[id]                      ← Job detail hub
/jobs/[id]/expenses             ← Quick expense entry (mobile-optimized)
/jobs/[id]/timeline             ← Chronological job log
/jobs/[id]/assignments          ← Crew + fleet assignment

/calendar                       ← FullCalendar: surveys + jobs

/customers                      ← Customer list
/customers/[id]                 ← Customer history (leads, jobs, invoices)

/fleet                        ← Fleet list + reliability
/crew                           ← Crew list + availability

/invoices                       ← Invoice list
/invoices/[id]                  ← Invoice detail + payment log

/reports                        ← Sales / operational / financial
/settings                       ← system_settings editor
```

---

## 2. Database Schema with Relationships

All foreign keys and cascade rules explicit.

```sql
-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  type         TEXT DEFAULT 'individual' CHECK (type IN ('individual','corporate')),
  company_name TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- LEADS
-- status drives what actions are available on /leads/[id]
-- ============================================================
CREATE TABLE leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID REFERENCES customers(id) ON DELETE RESTRICT,
  pickup_address      TEXT,
  destination_address TEXT,
  preferred_date      DATE,
  lead_type        TEXT CHECK (lead_type IN ('whatsapp','onsite','returning','corporate')),
  origin_channel      TEXT CHECK (origin_channel IN ('whatsapp','call','referral','walkin')),
  status              TEXT DEFAULT 'new' CHECK (status IN (
                        'new',
                        'survey_scheduled',
                        'survey_done',
                        'estimating',
                        'proposal_sent',
                        'converted',
                        'closed_lost'
                      )),
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- LEAD PHOTOS
-- separate table so photos can be added incrementally
-- ============================================================
CREATE TABLE lead_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id   UUID REFERENCES leads(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption      TEXT,
  uploaded_by  UUID REFERENCES auth.users(id),
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SURVEYS
-- one survey per lead (max). survey_id stored on lead.
-- ============================================================
CREATE TABLE surveys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID REFERENCES leads(id) ON DELETE RESTRICT UNIQUE,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  conducted_at    TIMESTAMPTZ,
  surveyor_id     UUID REFERENCES auth.users(id),
  access_notes    TEXT,
  special_items   JSONB DEFAULT '[]',
  notes           TEXT,
  gcal_event_id   TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SURVEY MEDIA
-- ============================================================
CREATE TABLE survey_media (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID REFERENCES surveys(id) ON DELETE CASCADE,
  media_type   TEXT CHECK (media_type IN ('photo','video')),
  storage_path TEXT NOT NULL,
  caption      TEXT,
  uploaded_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PROPOSALS
-- ============================================================
CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID REFERENCES leads(id) ON DELETE RESTRICT,
  proposal_number TEXT UNIQUE NOT NULL,
  service_type    TEXT DEFAULT 'DOM',
  status          TEXT DEFAULT 'draft' CHECK (status IN (
                    'draft','sent','negotiating','approved','lost','expired'
                  )),
  final_price     BIGINT,
  closed_reason   TEXT,
  approved_at     TIMESTAMPTZ,
  pdf_url         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ESTIMATIONS
-- linked to a proposal. one estimation per proposal (can be revised).
-- full snapshot stored so calculations are always explainable.
-- ============================================================
CREATE TABLE estimations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID REFERENCES proposals(id) ON DELETE CASCADE UNIQUE,
  engine_version    TEXT NOT NULL,
  inputs            JSONB NOT NULL,
  settings_snapshot JSONB NOT NULL,
  outputs           JSONB NOT NULL,
  overrides         JSONB,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PROPOSAL REVISIONS
-- every price change logged here (initial + each counter-offer)
-- ============================================================
CREATE TABLE proposal_revisions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    UUID REFERENCES proposals(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  price          BIGINT NOT NULL,
  changed_by     TEXT NOT NULL, -- 'operator' | 'customer'
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- JOBS
-- created from an approved proposal. proposal_id is immutable after creation.
-- ============================================================
CREATE TABLE jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID REFERENCES proposals(id) ON DELETE RESTRICT UNIQUE,
  job_number    TEXT UNIQUE NOT NULL,
  status        TEXT DEFAULT 'scheduled' CHECK (status IN (
                  'scheduled','in_progress','completed','closed','cancelled'
                )),
  move_date     DATE NOT NULL,
  revenue       BIGINT NOT NULL, -- copied from proposal.final_price at conversion
  gcal_event_id TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- FLEET / CREW
-- ============================================================
CREATE TABLE fleet (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  phone            TEXT,
  vehicle_types    TEXT[] DEFAULT '{}',
  service_areas    TEXT[] DEFAULT '{}',
  rate_assumptions JSONB DEFAULT '{}',
  notes            TEXT,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE crew (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  phone               TEXT,
  skills              TEXT[] DEFAULT '{}',
  daily_rate          BIGINT,
  availability_status TEXT DEFAULT 'available',
  notes               TEXT,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- JOB ASSIGNMENTS
-- polymorphic: resource_type + resource_id points to fleet or crew
-- ============================================================
CREATE TABLE job_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID REFERENCES jobs(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('fleet','crew')),
  resource_id   UUID NOT NULL,
  role          TEXT,
  agreed_rate   BIGINT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID REFERENCES jobs(id) ON DELETE RESTRICT,
  amount       BIGINT NOT NULL,
  category     TEXT NOT NULL CHECK (category IN (
                 'vehicle_rental','crew_payment','packing_materials',
                 'food','toll','parking','miscellaneous'
               )),
  subcategory  TEXT,
  note         TEXT,
  photo_url    TEXT,
  expense_time TIMESTAMPTZ DEFAULT now(),
  logged_by    UUID REFERENCES auth.users(id),
  logged_at    TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- PAYMENTS (from customer)
-- ============================================================
CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID REFERENCES jobs(id) ON DELETE RESTRICT,
  amount       BIGINT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN (
                 'down_payment','partial','final','refund'
               )),
  method       TEXT CHECK (method IN ('cash','transfer','qris')),
  reference_no TEXT,
  proof_url    TEXT,
  received_at  TIMESTAMPTZ DEFAULT now(),
  note         TEXT,
  recorded_by  UUID REFERENCES auth.users(id)
);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         UUID REFERENCES jobs(id) ON DELETE RESTRICT UNIQUE,
  invoice_number TEXT UNIQUE NOT NULL,
  issued_at      TIMESTAMPTZ DEFAULT now(),
  due_at         TIMESTAMPTZ,
  total_amount   BIGINT NOT NULL,
  status         TEXT DEFAULT 'unpaid' CHECK (status IN (
                   'unpaid','partial','paid','overdue'
                 )),
  pdf_url        TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- JOB TIMELINE
-- ============================================================
CREATE TABLE job_timeline (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID REFERENCES jobs(id) ON DELETE CASCADE,
  event_time   TIMESTAMPTZ DEFAULT now(),
  event_type   TEXT NOT NULL,
  note         TEXT,
  logged_by    UUID REFERENCES auth.users(id)
);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================
CREATE TABLE system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  category   TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Live profit per active job
CREATE VIEW job_profit_summary AS
SELECT
  j.id AS job_id,
  j.job_number,
  j.revenue,
  j.status,
  COALESCE(SUM(e.amount), 0) AS actual_spend,
  j.revenue - COALESCE(SUM(e.amount), 0) AS current_profit,
  COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type != 'refund'), 0)
    - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'refund'), 0)
    AS cash_received
FROM jobs j
LEFT JOIN expenses e ON e.job_id = j.id
LEFT JOIN payments p ON p.job_id = j.id
GROUP BY j.id;

-- Outstanding invoices
CREATE VIEW invoice_outstanding AS
SELECT
  i.id,
  i.invoice_number,
  i.total_amount,
  COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type != 'refund'), 0) AS paid,
  i.total_amount - COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type != 'refund'), 0) AS outstanding,
  i.due_at,
  CASE
    WHEN i.due_at < now() AND i.status != 'paid' THEN 'overdue'
    ELSE i.status
  END AS effective_status
FROM invoices i
LEFT JOIN payments p ON p.job_id = i.job_id
GROUP BY i.id;
```

---

## 3. Workflow 1: Lead Intake

### Screen: `/leads/new`

**User fills form and saves:**

```
FORM FIELDS:
  Customer:          [search existing] OR [+ New Customer]
  Pickup address:    text
  Destination:       text
  Preferred date:    date picker (optional)
  Lead type:      [WhatsApp] [Onsite] [Returning] [Corporate]
  Origin channel:    [WhatsApp] [Call] [Referral] [Walk-in]
  Notes:             textarea

SAVE ACTION:
  1. INSERT into customers (if new customer selected)
  2. INSERT into leads { customer_id, status: 'new', ...fields }
  3. redirect → /leads/[new_id]
```

---

### Screen: `/leads/[id]`

This is the control center for an lead. The action panel on the right changes based on `leads.status`.

```
PAGE LAYOUT:
  LEFT:   Lead details (address, customer, notes)
          Photo gallery (upload + view)
  RIGHT:  Action Panel (status-driven — see below)
          Activity log (status changes, photos added)
```

**Action Panel by Status:**

```
STATUS: new
  ┌─────────────────────────────────────────┐
  │  [+ Upload Photos]                      │
  │  [Schedule Survey]   [Skip → Estimate]  │
  └─────────────────────────────────────────┘

STATUS: survey_scheduled
  ┌─────────────────────────────────────────┐
  │  Survey: [date] at [time]               │
  │  [View Survey]   [Mark Survey Done]     │
  └─────────────────────────────────────────┘

STATUS: survey_done
  ┌─────────────────────────────────────────┐
  │  Survey completed [date]                │
  │  [Create Estimation →]                  │
  └─────────────────────────────────────────┘

STATUS: estimating
  ┌─────────────────────────────────────────┐
  │  Estimation in progress                 │
  │  [Open Estimation →]                    │
  └─────────────────────────────────────────┘

STATUS: proposal_sent
  ┌─────────────────────────────────────────┐
  │  Proposal: [number]   [View →]          │
  └─────────────────────────────────────────┘

STATUS: converted
  ┌─────────────────────────────────────────┐
  │  Job: [job_number]   [View Job →]       │
  └─────────────────────────────────────────┘
```

---

**Button: "Schedule Survey"**

```
MODAL opens:
  Date + time picker
  Surveyor (dropdown: auth users)
  Notes

ON CONFIRM:
  1. INSERT into surveys {
       lead_id,
       scheduled_at,
       surveyor_id,
       notes
     }
  2. UPDATE leads SET status = 'survey_scheduled'
     WHERE id = lead_id
  3. CALL gcal.createEvent({
       type: 'survey',
       title: `[SURVEY] ${customer.name}`,
       start: scheduled_at,
       end: scheduled_at + 1hr,
       description: lead notes
     })
  4. UPDATE surveys SET gcal_event_id = returned_event_id
  5. Action panel refreshes → shows "View Survey" + "Mark Survey Done"
```

---

**Button: "Skip → Estimate"**

```
ON CLICK:
  1. INSERT into proposals {
       lead_id,
       proposal_number: generateNumber(),   ← see numbering logic
       status: 'draft',
       created_by
     }
  2. UPDATE leads SET status = 'estimating'
  3. redirect → /estimations/new?proposal_id=[new_proposal_id]
```

---

**Button: "Mark Survey Done"**

```
ON CLICK:
  1. UPDATE surveys SET conducted_at = now()
  2. UPDATE leads SET status = 'survey_done'
  3. UPDATE gcal event: append "[DONE]" to title (optional)
  4. Action panel refreshes → shows "Create Estimation →"
```

---

**Button: "Create Estimation →"** (after survey done)

```
ON CLICK:
  1. INSERT into proposals {
       lead_id,
       proposal_number: generateNumber(),
       status: 'draft',
       created_by
     }
  2. UPDATE leads SET status = 'estimating'
  3. redirect → /estimations/new?proposal_id=[new_proposal_id]
```

---

## 4. Workflow 2: Survey (Optional Path)

### Screen: `/surveys/[id]`

Reached by clicking "View Survey" on lead detail.

```
PAGE LAYOUT:
  Survey date + surveyor
  Access notes (textarea, editable)
  Special items (dynamic list: add/remove items with type + qty + note)
  Media gallery (upload photos + videos)
  General notes

ACTIONS:
  [+ Add Photo/Video]   → uploads to survey_media, storage_path saved
  [Mark as Done]        → same as "Mark Survey Done" on lead page
  [Back to Lead]     → /leads/[lead_id]
```

**Photo Upload Flow:**

```
User selects photo from device
  → client-side resize to max 1600px, convert to WebP
  → upload to Supabase Storage: surveys/{survey_id}/{uuid}.webp
  → INSERT into survey_media { survey_id, media_type:'photo', storage_path }
  → photo appears in gallery immediately (optimistic UI)
```

---

## 5. Workflow 3: Estimation

### Screen: `/estimations/new?proposal_id=[id]`

### Screen: `/estimations/[id]` (edit existing)

```
PAGE LAYOUT:
  LEFT:   Estimation input form
  RIGHT:  Live breakdown panel (recalculates on every input change)
          Manual override section
          Save button
```

**Form Inputs:**

```
Vehicle type:     [Pickup] [Box Truck] [Container]
Distance (km):    number input
Manpower (qty):   number input
Packing service:  toggle
Toll estimate:    number input (optional)
Special items:    list (from survey if survey exists, or manual)
```

**Live Calculation (client-side, no API call):**

```typescript
// Runs on every form change
function calculate(inputs: EstimationInputs, settings: SystemSettings): EstimationOutputs {
  const vehicle_cost = settings[`vehicle_rate_${inputs.vehicle_type}`]
  const crew_cost = inputs.manpower_qty * settings.crew_day_rate
  const packing_cost = inputs.packing_service ? calculatePacking(inputs, settings) : 0
  const toll_cost = inputs.toll_estimate ?? 0

  const total_cost = vehicle_cost + crew_cost + packing_cost + toll_cost
  const margin = settings.default_margin_pct / 100
  const suggested_price = Math.ceil(total_cost / (1 - margin))

  return {
    vehicle_cost, crew_cost, packing_cost, toll_cost,
    total_cost, suggested_price,
    margin_amount: suggested_price - total_cost,
    margin_pct: settings.default_margin_pct
  }
}
```

**Manual Override section** (shown below the breakdown):

```
Override selling price: [________] (replaces suggested_price)
Override margin %:      [________] (recalculates price)
Override reason:        [________] (required if override used)
```

**Save Estimation:**

```
ON SAVE:
  1. Fetch current system_settings (all keys) → settings_snapshot
  2. UPSERT into estimations {
       proposal_id,
       engine_version: '2.0',
       inputs: { ...form values },
       settings_snapshot: { ...settings at this moment },
       outputs: { ...calculated values },
       overrides: { final_price, reason } if overridden else null
     }
  3. UPDATE proposals SET
       final_price = overrides?.final_price ?? outputs.suggested_price
     WHERE id = proposal_id
  4. redirect → /proposals/[proposal_id]
```

> The settings snapshot is critical. It means that in 6 months, when a crew day rate has changed, the original calculation is still explainable.

---

## 6. Workflow 4: Proposal & Negotiation

### Screen: `/proposals/[id]`

```
PAGE LAYOUT:
  Header:     Proposal number, status badge, customer name
  Section 1:  Estimation breakdown (read-only, from estimation snapshot)
  Section 2:  Negotiation history (revision list)
  Section 3:  Action panel (status-driven)
  Footer:     PDF preview link / regenerate PDF
```

**Action Panel by Status:**

```
STATUS: draft
  [Edit Estimation]  [Generate PDF]  [Mark as Sent]

STATUS: sent
  [Record Counter-Offer]  [Mark Approved]  [Mark Lost]

STATUS: negotiating
  [Record Counter-Offer]  [Mark Approved]  [Mark Lost]

STATUS: approved
  [Convert to Job →]  (proposal locked, read-only)

STATUS: lost / expired
  [Duplicate Proposal]  (for re-quote)
```

---

**Button: "Mark as Sent"**

```
ON CLICK:
  1. UPDATE proposals SET status = 'sent'
  2. INSERT into proposal_revisions {
       proposal_id,
       version_number: 1,
       price: proposals.final_price,
       changed_by: 'operator',
       note: 'Initial quote sent'
     }
  3. UPDATE leads SET status = 'proposal_sent'
     WHERE id = proposal.lead_id
  4. Show WhatsApp send button with pre-filled message deeplink
```

---

**Button: "Record Counter-Offer"**

```
MODAL opens:
  Who proposed:  [Customer] [Operator]
  New price:     number input
  Note:          text

ON CONFIRM:
  1. SELECT MAX(version_number) from proposal_revisions WHERE proposal_id = x
  2. INSERT into proposal_revisions {
       version_number: max + 1,
       price: new_price,
       changed_by: selection,
       note
     }
  3. UPDATE proposals SET
       status = 'negotiating',
       final_price = new_price
  4. Revision list refreshes
```

---

**Button: "Mark Approved"**

```
ON CLICK:
  1. UPDATE proposals SET
       status = 'approved',
       approved_at = now()
  2. INSERT into proposal_revisions {
       version_number: max + 1,
       price: proposals.final_price,
       changed_by: 'operator',
       note: 'Final agreed price'
     }
  3. Action panel changes → shows "Convert to Job →" button only
```

---

**Button: "Mark Lost"**

```
MODAL opens:
  Reason: [Price too high] [Went with competitor] [No response] [Other]
  Note:   text (required if Other)

ON CONFIRM:
  1. UPDATE proposals SET status = 'lost', closed_reason = reason
  2. UPDATE leads SET status = 'closed_lost'
     WHERE id = proposal.lead_id
```

---

**Button: "Convert to Job →"**

This is the critical cross-module transition.

```
ON CLICK:
  CONFIRM DIALOG: "Create job for [customer name] on [preferred date]?"

  Date picker: move_date (pre-filled from lead.preferred_date if set)

ON CONFIRM:
  1. Generate job_number (e.g. JOB-2026-0089)

  2. INSERT into jobs {
       proposal_id: proposal.id,
       job_number,
       status: 'scheduled',
       move_date: selected date,
       revenue: proposal.final_price,   ← locked at conversion moment
       created_by
     }

  3. UPDATE proposals SET status = 'approved'  (already approved, no change needed)

  4. UPDATE leads SET status = 'converted'
     WHERE id = proposal.lead_id

  5. CALL gcal.createEvent({
       type: 'job',
       title: `[JOB] ${customer.name} — ${pickup} → ${destination}`,
       start: move_date + 'T08:00',
       end: move_date + 'T18:00',
       description: `Job: ${job_number}\nProposal: ${proposal_number}\nRevenue: ${revenue}`
     })

  6. UPDATE jobs SET gcal_event_id = returned_event_id

  7. redirect → /jobs/[new_job_id]
```

---

## 7. Workflow 5: Job Creation & Scheduling

### Screen: `/jobs/[id]`

The job hub. Everything about this job lives here.

```
PAGE LAYOUT:
  Header:   Job number, status badge, move date, customer name
  Tabs:
    [Overview]      Job summary, proposal link, revenue, profit snapshot
    [Assignments]   Crew + fleet assignment
    [Expenses]      Expense list + quick entry button
    [Timeline]      Chronological log
    [Payments]      Customer payment log
    [Invoice]       Invoice status (generated after completion)
```

**Overview Tab:**

```
Shows:
  Move date           [edit button]
  Pickup → Destination
  Revenue (from proposal, locked)
  Estimated cost (from estimation snapshot)
  Current spend (live, sum of expenses)
  Current profit (live)
  Profit safety status (green / yellow / red)

  Links:
    → View Proposal
    → View Estimation
    → View Customer

Actions (by status):
  scheduled:    [Start Job]  [Cancel Job]
  in_progress:  [Complete Job]
  completed:    [Generate Invoice]  [Close Job]
  closed:       (read-only)
```

---

**Button: "Start Job"**

```
ON CLICK:
  1. UPDATE jobs SET status = 'in_progress'
  2. INSERT into job_timeline {
       job_id, event_type: 'job_started', note: 'Job marked as in progress'
     }
  3. Tab bar: Expenses tab gets pulsing indicator (active job)
```

---

**Button: "Complete Job"**

```
ON CLICK:
  1. CHECK: Are there any pending expense entries? (warn only, don't block)
  2. UPDATE jobs SET status = 'completed'
  3. INSERT into job_timeline { event_type: 'job_completed' }
  4. Action panel shows [Generate Invoice]
```

---

**Button: "Generate Invoice"**

```
ON CLICK:
  1. CHECK: Invoice doesn't already exist for this job
  2. Generate invoice_number using configured format
  3. INSERT into invoices {
       job_id,
       invoice_number,
       issued_at: now(),
       due_at: now() + system_settings['invoice_due_days'],
       total_amount: job.revenue,
       status: 'unpaid'
     }
  4. Generate PDF (react-pdf or puppeteer)
  5. Upload PDF to Supabase Storage: invoices/{invoice_id}/invoice.pdf
  6. UPDATE invoices SET pdf_url = storage_url
  7. Navigate to Invoice tab
```

---

### Assignments Tab: `/jobs/[id]/assignments`

```
PAGE LAYOUT:
  Fleet section:
    List of assigned fleet (vehicle type, agreed rate)
    [+ Add Fleet] button

  Crew section:
    List of assigned crew (name, role, agreed rate)
    [+ Add Crew] button
```

**Add Fleet:**

```
MODAL opens:
  Search fleet (by name, vehicle type, area)
  Select fleet
  Vehicle type: dropdown (from fleet.vehicle_types)
  Agreed rate: number (pre-filled from fleet.rate_assumptions)
  Role: text (optional)

  Overlap check: query job_assignments for this date, warn if fleet already assigned
    → "⚠ Fleet X has another job on this date. Proceed anyway?"

ON CONFIRM:
  INSERT into job_assignments {
    job_id,
    resource_type: 'fleet',
    resource_id: fleet.id,
    role,
    agreed_rate
  }
```

**Add Crew:**

```
Same pattern as fleet.
Overlap check same pattern.

INSERT into job_assignments {
  job_id,
  resource_type: 'crew',
  resource_id: crew.id,
  role,
  agreed_rate
}
```

---

## 8. Workflow 6: Job Execution & Expenses

### Screen: `/jobs/[id]/expenses`

Mobile-optimized. Large touch targets. Minimal steps.

```
PAGE LAYOUT:
  Live profit panel (top, always visible):
    Revenue:         Rp 4.250.000
    Spent:           Rp 700.000    (green)
    Forecast:        Rp 500.000    (grey)
    Predicted profit: Rp 3.050.000 (green / yellow / red)
    Buffer:          Rp 2.550.000

  Expense list (chronological, today's first)

  FAB button: [+ Add Expense]   ← large, bottom-right, always visible
```

**"+ Add Expense" FAB:**

```
BOTTOM SHEET opens (mobile-native feel):

  Step 1: Amount
    Large numeric input, full width
    Keyboard auto-opens

  Step 2: Category (shown below amount, tap to select)
    [Vehicle] [Crew] [Food] [Toll] [Parking] [Packing] [Other]
    One tap selects — no confirm needed

  Step 3: Optional note (small text input, below category)

  Step 4: Optional photo (camera icon)

  [SAVE] button — large, full width

ON SAVE:
  1. INSERT into expenses {
       job_id,
       amount,
       category,
       note,
       photo_url (if taken),
       logged_by,
       expense_time: now()
     }
  2. Bottom sheet closes
  3. Live profit panel recalculates immediately (optimistic update)
  4. Expense appears at top of list

TARGET: under 5 seconds for amount + category entry
```

---

**Live Profit Calculation:**

```typescript
function calculateLiveProfit(job: Job, expenses: Expense[], estimation: Estimation) {
  const revenue = job.revenue
  const actual_spend = expenses.reduce((sum, e) => sum + e.amount, 0)

  // Forecast: what's left from the original estimate
  const original_estimated_cost = estimation.outputs.total_cost
  const forecast_remaining = Math.max(0, original_estimated_cost - actual_spend)

  const predicted_profit = revenue - actual_spend - forecast_remaining

  const min_target = Number(system_settings['min_target_profit'])
  const buffer = predicted_profit - min_target

  return {
    revenue,
    actual_spend,
    forecast_remaining,
    predicted_profit,
    buffer,
    alert: buffer < 0 ? 'danger' : buffer < min_target * 0.5 ? 'warning' : 'safe'
  }
}
```

**Alert Display:**

```
buffer > min_target × 0.5   → green  "On track"
buffer > 0                  → yellow "⚠ Profit margin thinning"
buffer ≤ 0                  → red    "⛔ Below minimum target"
predicted_profit ≤ 0        → black  "💀 Job is loss-making"
```

---

### Timeline Tab: `/jobs/[id]/timeline`

```
PAGE LAYOUT:
  Chronological list of timeline events (newest last)
  [+ Log Event] button

Event types with labels:
  job_started         "Job started"
  loading_start       "Loading started"
  loading_done        "Loading done"
  transit_start       "In transit"
  transit_done        "Arrived at destination"
  unloading_start     "Unloading started"
  unloading_done      "Unloading complete"
  overtime_approved   "Overtime approved"
  overnight_approved  "Extended to overnight"
  crew_added          "Additional crew added"
  custom              "[operator note]"
  job_completed       "Job completed"

ADD EVENT MODAL:
  Event type: dropdown
  Note: text
  Time: datetime (defaults to now)

ON SAVE:
  INSERT into job_timeline { job_id, event_type, note, event_time, logged_by }
```

---

## 9. Workflow 7: Invoice & Payment

### Screen: `/invoices/[id]`

```
PAGE LAYOUT:
  Invoice header (number, dates, status badge)
  Bill to (customer)
  Job reference (link)
  Amount breakdown
  Payment history table
  Outstanding balance (large, prominent)
  [+ Record Payment] button
  [Download PDF] button
  [Send via WhatsApp] deeplink button
```

**Record Payment:**

```
MODAL opens:
  Payment type:   [Down Payment] [Partial] [Final] [Refund]
  Amount:         number input (pre-filled with outstanding for Final)
  Method:         [Cash] [Transfer] [QRIS]
  Reference no:   text (optional, for transfer)
  Received at:    datetime (defaults to now)
  Proof photo:    camera/upload (optional)

ON SAVE:
  1. INSERT into payments { job_id, amount, payment_type, method, ... }

  2. Recalculate invoice status:
       total_paid = SUM(payments.amount WHERE type != 'refund')
                  - SUM(payments.amount WHERE type = 'refund')
       if total_paid >= invoice.total_amount → status = 'paid'
       else if total_paid > 0 → status = 'partial'
       else → status = 'unpaid'

  3. UPDATE invoices SET status = new_status

  4. If status = 'paid':
       Prompt: "Mark job as Closed?"
       If yes → UPDATE jobs SET status = 'closed'
```

---

## 10. Cross-Module State Rules

These are the rules that keep the system consistent. Enforce them at the application layer (not just UI).

```
RULE 1: Lead status must match reality
  lead.status = 'converted'   → exactly one job exists for this lead's proposals
  lead.status = 'closed_lost' → all proposals for this lead are 'lost' or 'expired'
  lead.status = 'proposal_sent' → at least one proposal with status in ['sent','negotiating','approved']

RULE 2: Proposal is locked once approved
  proposal.status = 'approved'   → final_price is immutable
                                 → estimation is immutable
                                 → proposal_number is immutable

RULE 3: Job revenue is locked at conversion
  jobs.revenue = proposal.final_price at the moment of conversion
  Subsequent proposal edits do NOT affect job.revenue

RULE 4: One job per proposal
  UNIQUE constraint on jobs.proposal_id
  Cannot create second job from same proposal

RULE 5: Expenses only on active jobs
  Only allow INSERT into expenses WHERE job.status IN ('in_progress', 'scheduled')
  Completed/closed jobs: expenses are read-only

RULE 6: Invoice generated once
  UNIQUE constraint on invoices.job_id
  "Generate Invoice" button hidden once invoice exists

RULE 7: Calendar events must have gcal_event_id
  If gcal sync fails → still create the survey/job record
  Store gcal_event_id = null, show retry button
  Never block core operation on calendar failure
```

---

## 11. Supabase Functions & Triggers

### Auto-generate proposal number

```sql
CREATE OR REPLACE FUNCTION generate_proposal_number(service_type TEXT)
RETURNS TEXT AS $$
DECLARE
  seq INTEGER;
  month_roman TEXT;
  year_val TEXT;
  roman_months TEXT[] := ARRAY['I','II','III','IV','V','VI',
                               'VII','VIII','IX','X','XI','XII'];
BEGIN
  -- Get next sequence for this year
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(proposal_number, '/', 1) AS INTEGER)
  ), 0) + 1
  INTO seq
  FROM proposals
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());

  month_roman := roman_months[EXTRACT(MONTH FROM now())];
  year_val := TO_CHAR(now(), 'YYYY');

  RETURN seq || '/' || service_type || '-IM/' || month_roman || '/' || year_val;
END;
$$ LANGUAGE plpgsql;
```

### Auto-update invoice status when payment inserted

```sql
CREATE OR REPLACE FUNCTION update_invoice_status()
RETURNS TRIGGER AS $$
DECLARE
  total_paid BIGINT;
  invoice_total BIGINT;
BEGIN
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE payment_type != 'refund'), 0)
    - COALESCE(SUM(amount) FILTER (WHERE payment_type = 'refund'), 0)
  INTO total_paid
  FROM payments
  WHERE job_id = NEW.job_id;

  SELECT total_amount INTO invoice_total
  FROM invoices WHERE job_id = NEW.job_id;

  IF invoice_total IS NULL THEN
    RETURN NEW; -- no invoice yet, skip
  END IF;

  UPDATE invoices SET status =
    CASE
      WHEN total_paid >= invoice_total THEN 'paid'
      WHEN total_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END
  WHERE job_id = NEW.job_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_payment_insert
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_invoice_status();
```

### Warn on resource double-booking (not block)

```sql
-- Returns overlapping assignments for a resource on a given date
-- Use this in application layer to show warning, not enforce constraint
CREATE OR REPLACE FUNCTION check_resource_overlap(
  p_resource_type TEXT,
  p_resource_id UUID,
  p_move_date DATE
)
RETURNS TABLE(job_id UUID, job_number TEXT, move_date DATE) AS $$
BEGIN
  RETURN QUERY
  SELECT j.id, j.job_number, j.move_date
  FROM job_assignments ja
  JOIN jobs j ON j.id = ja.job_id
  WHERE ja.resource_type = p_resource_type
    AND ja.resource_id = p_resource_id
    AND j.move_date = p_move_date
    AND j.status NOT IN ('cancelled','closed');
END;
$$ LANGUAGE plpgsql;
```

---

## 12. UI Action Map

Every button in the app, what it does, and what it requires.

| Screen                | Button               | Requires                       | Action                                         | Result                             |
| --------------------- | -------------------- | ------------------------------ | ---------------------------------------------- | ---------------------------------- |
| `/leads/new`          | Save                 | valid form                     | INSERT lead + customer                         | → `/leads/[id]`                    |
| `/leads/[id]`         | Upload Photo         | lead exists                    | INSERT lead_photos                             | Photo appears in gallery           |
| `/leads/[id]`         | Schedule Survey      | status = new                   | INSERT survey, UPDATE lead status, push GCal   | status → survey_scheduled          |
| `/leads/[id]`         | Skip → Estimate      | status = new                   | INSERT proposal, UPDATE lead status            | → `/estimations/new?proposal_id=x` |
| `/leads/[id]`         | Mark Survey Done     | status = survey_scheduled      | UPDATE survey + lead                           | status → survey_done               |
| `/leads/[id]`         | Create Estimation    | status = survey_done           | INSERT proposal, UPDATE lead                   | → `/estimations/new?proposal_id=x` |
| `/surveys/[id]`       | Mark as Done         | survey exists                  | UPDATE survey + lead                           | Back to lead, status → survey_done |
| `/estimations/new`    | Save                 | form valid                     | UPSERT estimation, UPDATE proposal.final_price | → `/proposals/[id]`                |
| `/proposals/[id]`     | Generate PDF         | estimation exists              | render PDF, upload, UPDATE proposals.pdf_url   | PDF link appears                   |
| `/proposals/[id]`     | Mark as Sent         | status = draft, PDF exists     | UPDATE status, INSERT revision v1, UPDATE lead | status → sent                      |
| `/proposals/[id]`     | Record Counter-Offer | status = sent/negotiating      | INSERT revision, UPDATE price + status         | Revision appears                   |
| `/proposals/[id]`     | Mark Approved        | status = sent/negotiating      | UPDATE status + approved_at                    | → shows Convert to Job button      |
| `/proposals/[id]`     | Mark Lost            | status = sent/negotiating      | UPDATE status + closed_reason, UPDATE lead     | status → lost                      |
| `/proposals/[id]`     | Convert to Job       | status = approved              | INSERT job, UPDATE lead, push GCal             | → `/jobs/[id]`                     |
| `/jobs/[id]`          | Start Job            | status = scheduled             | UPDATE status, INSERT timeline                 | status → in_progress               |
| `/jobs/[id]`          | Add Fleet           | job exists                     | check overlap, INSERT job_assignment           | Assignment appears                 |
| `/jobs/[id]`          | Add Crew             | job exists                     | check overlap, INSERT job_assignment           | Assignment appears                 |
| `/jobs/[id]/expenses` | + Add Expense        | job status = in_progress       | INSERT expense                                 | Live profit recalculates           |
| `/jobs/[id]`          | Complete Job         | status = in_progress           | UPDATE status, INSERT timeline                 | status → completed                 |
| `/jobs/[id]`          | Generate Invoice     | status = completed, no invoice | INSERT invoice, generate PDF                   | → Invoice tab                      |
| `/invoices/[id]`      | Record Payment       | invoice exists                 | INSERT payment, UPDATE invoice status          | Outstanding recalculates           |

---

## 13. Component Tree

How components compose. Each component owns one responsibility.

```
app/leads/[id]/page.tsx
  └── LeadDetailPage
        ├── LeadHeader          (number, status badge, customer link)
        ├── LeadDetailsCard     (addresses, dates, notes — editable)
        ├── PhotoGallery           (upload + display lead_photos)
        ├── LeadActionPanel     (status-driven, see section 3)
        │     ├── ScheduleSurveyButton   → opens ScheduleSurveyModal
        │     ├── SkipToEstimateButton   → fires action + redirect
        │     ├── MarkSurveyDoneButton
        │     └── CreateEstimationButton → fires action + redirect
        └── ActivityLog            (status changes + uploads, read-only)

app/estimations/new/page.tsx
  └── EstimationPage
        ├── EstimationForm         (all inputs)
        ├── EstimationBreakdown    (live, recalcs on input change)
        │     └── BreakdownTable
        ├── ManualOverrideSection  (optional price/margin override)
        └── SaveEstimationButton   → UPSERT + redirect

app/proposals/[id]/page.tsx
  └── ProposalDetailPage
        ├── ProposalHeader         (number, status badge)
        ├── EstimationSummary      (read-only snapshot from estimations table)
        ├── NegotiationHistory     (revision list from proposal_revisions)
        ├── ProposalActionPanel    (status-driven)
        │     ├── GeneratePDFButton
        │     ├── MarkSentButton
        │     ├── CounterOfferButton   → opens CounterOfferModal
        │     ├── MarkApprovedButton
        │     ├── MarkLostButton       → opens LostReasonModal
        │     └── ConvertToJobButton   → opens ConvertToJobModal → redirect
        └── WhatsAppActions        (deeplinks per template)

app/jobs/[id]/page.tsx
  └── JobDetailPage
        ├── JobHeader              (job number, status, move date, customer)
        ├── JobTabs
        │     ├── OverviewTab
        │     │     ├── JobSummaryCard    (revenue, links to proposal)
        │     │     ├── LiveProfitPanel   (real-time calc, alert badge)
        │     │     └── JobStatusActions (Start / Complete / Generate Invoice)
        │     ├── AssignmentsTab
        │     │     ├── FleetAssignmentList
        │     │     ├── AddFleetButton  → AddFleetModal (overlap check)
        │     │     ├── CrewAssignmentList
        │     │     └── AddCrewButton    → AddCrewModal (overlap check)
        │     ├── ExpensesTab          (→ /jobs/[id]/expenses)
        │     ├── TimelineTab          (→ /jobs/[id]/timeline)
        │     ├── PaymentsTab
        │     │     ├── PaymentList
        │     │     └── AddPaymentButton → AddPaymentModal
        │     └── InvoiceTab
        │           ├── InvoiceCard (if exists)
        │           └── GenerateInvoiceButton (if not exists)

app/jobs/[id]/expenses/page.tsx
  └── ExpensesPage
        ├── LiveProfitPanel        (always visible, top)
        ├── ExpenseList            (chronological)
        └── AddExpenseFAB          → QuickExpenseBottomSheet
              ├── AmountInput      (large, auto-focus)
              ├── CategoryChips    (tap to select)
              ├── NoteInput        (optional)
              ├── PhotoCapture     (optional)
              └── SaveButton
```

---

## Proposal Number Generation (Application Layer)

```typescript
// lib/proposals/generateNumber.ts

async function generateProposalNumber(
  supabase: SupabaseClient,
  serviceType: string = 'DOM'
): Promise<string> {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const romanMonths = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII']
  const monthRoman = romanMonths[currentMonth - 1]

  // Get highest sequence number this year
  const { data } = await supabase
    .from('proposals')
    .select('proposal_number')
    .ilike('proposal_number', `%/${currentYear}`)
    .order('created_at', { ascending: false })
    .limit(1)

  let nextSeq = 1
  if (data && data.length > 0) {
    const lastNumber = data[0].proposal_number
    const lastSeq = parseInt(lastNumber.split('/')[0])
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1
  }

  return `${nextSeq}/${serviceType}-IM/${monthRoman}/${currentYear}`
}
```

---

## Google Calendar Push (Application Layer)

```typescript
// lib/gcal/sync.ts

async function pushCalendarEvent(params: {
  type: 'survey' | 'job'
  title: string
  startISO: string
  endISO: string
  description: string
}): Promise<string | null> {
  const calendarId = await getSetting('gcal_calendar_id')
  const accessToken = await getGCalAccessToken()

  const colorId = params.type === 'survey' ? '1' : '2' // blue : green

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: params.title,
          description: params.description,
          start: { dateTime: params.startISO, timeZone: 'Asia/Jakarta' },
          end: { dateTime: params.endISO, timeZone: 'Asia/Jakarta' },
          colorId
        })
      }
    )
    const data = await res.json()
    return data.id ?? null
  } catch {
    // IMPORTANT: never throw here — calendar failure must not block job/survey creation
    console.error('GCal push failed', params)
    return null
  }
}
```

> If `pushCalendarEvent` returns `null`, store `gcal_event_id = null` on the record and show a "Sync to Calendar" retry button on the detail page. Never block the user's core action on a calendar failure.

---

*IM Ops Implementation Spec — May 2026*
*This document specifies actions, not just data structures.*
