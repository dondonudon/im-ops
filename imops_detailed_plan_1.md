# IM Ops — Detailed System Plan

> Internal operational platform for moving/logistics coordination.
> Last updated: May 2026

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Core Data Model (ERD)](#2-core-data-model-erd)
3. [Core Operational Flow](#3-core-operational-flow)
4. [Module Specifications](#4-module-specifications)
   - 4.1 Lead 
   - 4.2 Survey System
   - 4.3 Estimation Engine
   - 4.4 Proposal System
   - 4.5 Operational Scheduling
   - 4.6 Resource Management
   - 4.7 Expense Tracking
   - 4.8 Customer Payment Tracking
   - 4.9 Invoice System
   - 4.10 Reporting & Analytics
5. [Integration Specifications](#5-integration-specifications)
6. [Database Schema](#6-database-schema)
7. [Technical Architecture](#7-technical-architecture)
8. [Execution Roadmap](#8-execution-roadmap)
9. [MVP Scope](#9-mvp-scope)
10. [Future AI Opportunities](#10-future-ai-opportunities)

---

## 1. System Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         IM Ops — System Layers                        │
├──────────────────────────────────────────────────────────────────────┤
│  CLIENT LAYER                                                         │
│  ┌─────────────────────────┐   ┌──────────────────────────────────┐  │
│  │  Web App (Next.js)       │   │  Mobile Browser (PWA)            │  │
│  │  ops.yourdomain.com      │   │  Crew / Field operators          │  │
│  └────────────┬────────────┘   └──────────────┬───────────────────┘  │
│               │                               │                       │
├───────────────┼───────────────────────────────┼───────────────────────┤
│  APPLICATION LAYER                            │                       │
│  ┌────────────▼───────────────────────────────▼───────────────────┐  │
│  │  Next.js App Router (React + TypeScript)                        │  │
│  │  ┌──────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────────┐ │  │
│  │  │  Leads│ │ Proposals │ │  Jobs/Sched  │ │  Expense Entry│ │  │
│  │  └──────────┘ └───────────┘ └─────────────┘ └───────────────┘ │  │
│  │  ┌──────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────────┐ │  │
│  │  │ Customers │ │  Invoices │ │  Resources   │ │  Reports      │ │  │
│  │  └──────────┘ └───────────┘ └─────────────┘ └───────────────┘ │  │
│  └───────────────────────┬────────────────────────────────────────┘  │
│                           │                                           │
├───────────────────────────┼───────────────────────────────────────────┤
│  DATA / SERVICES LAYER    │                                           │
│  ┌────────────────────────▼───────────────────────────────────────┐  │
│  │  Supabase                                                       │  │
│  │  ┌────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────┐  │  │
│  │  │ PostgreSQL  │ │ Supabase Auth│ │ Storage  │ │ Realtime   │  │  │
│  │  │ (main DB)   │ │ (Google SSO) │ │ (photos) │ │ (live UI)  │  │  │
│  │  └────────────┘ └──────────────┘ └──────────┘ └────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
├───────────────────────────────────────────────────────────────────────┤
│  EXTERNAL INTEGRATIONS                                                 │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │  Google Calendar  │   │  WhatsApp        │   │  PDF Generation  │  │
│  │  (OAuth + API)    │   │  (wa.me deeplink) │   │  (puppeteer/     │  │
│  │  Push-only sync   │   │  Manual workflow  │   │   react-pdf)     │  │
│  └──────────────────┘   └──────────────────┘   └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Data Model (ERD)

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│  customers  │         │  leads   │         │   surveys    │
│─────────────│         │──────────────│         │──────────────│
│ id (PK)     │◄──┐     │ id (PK)      │◄────────│ id (PK)      │
│ name        │   └─────│ customer_id  │    1    │ lead_id   │
│ phone       │         │ pickup_addr  │         │ scheduled_at │
│ email       │         │ dest_addr    │         │ conducted_at │
│ type        │         │ notes        │         │ notes        │
│ company     │         │ status       │         │ photos[]     │
│ created_at  │         │ origin       │ has 0-1 │ videos[]     │
└─────────────┘         │ created_at   │◄──┐     │ access_notes │
                        └──────┬───────┘   │     │ special_items│
                               │ has many  │     └──────────────┘
                               ▼           │
                        ┌──────────────┐   │     ┌──────────────┐
                        │  proposals   │   │     │  estimations │
                        │──────────────│   │     │──────────────│
                        │ id (PK)      │◄──┘     │ id (PK)      │
                        │ lead_id   │◄────────│ proposal_id  │
                        │ number       │  has 1  │ vehicle_type │
                        │ version      │         │ distance_km  │
                        │ status       │         │ manpower_qty │
                        │ final_price  │         │ packing      │
                        │ approved_at  │         │ toll_est     │
                        │ created_at   │         │ raw_inputs   │◄─ JSON snapshot
                        └──────┬───────┘         │ raw_outputs  │◄─ JSON snapshot
                               │                 │ engine_ver   │
                               │ converts to     │ created_at   │
                               ▼                 └──────────────┘
                        ┌──────────────┐
              ┌─────────│    jobs      │─────────┐
              │         │──────────────│         │
              │         │ id (PK)      │         │
              │         │ proposal_id  │         │
              │         │ status       │         │
              │         │ move_date    │         │
              │         │ gcal_event_id│         │
              │         │ revenue      │         │
              │         │ created_at   │         │
              │         └──────┬───────┘         │
              │                │                 │
              ▼                ▼                 ▼
┌─────────────────┐   ┌──────────────┐   ┌──────────────┐
│  job_assignments│   │   expenses   │   │   payments   │
│─────────────────│   │──────────────│   │──────────────│
│ id (PK)         │   │ id (PK)      │   │ id (PK)      │
│ job_id          │   │ job_id       │   │ job_id       │
│ resource_type   │   │ amount       │   │ amount       │
│ (vendor/crew)   │   │ category     │   │ type (dp/    │
│ resource_id     │   │ note         │   │  partial/    │
│ role            │   │ photo_url    │   │  final)      │
│ rate            │   │ logged_by    │   │ method       │
│ created_at      │   │ logged_at    │   │ received_at  │
└─────────────────┘   └──────────────┘   └──────────────┘
       │
       ├─────────────────┐
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│   vendors   │   │    crew     │
│─────────────│   │─────────────│
│ id (PK)     │   │ id (PK)     │
│ name        │   │ name        │
│ phone       │   │ phone       │
│ vehicle_type│   │ skill_tags  │
│ area_notes  │   │ availability│
│ rate_assumed│   │ notes       │
│ punctuality │   │ punctuality │
│ reliability │   │ reliability │
│ created_at  │   │ created_at  │
└─────────────┘   └─────────────┘
```

**Key Relationship Notes:**

- One `lead` → many `proposals` (renegotiation, re-quote)
- One `proposal` → zero or one `job` (not all proposals convert)
- One `job` → many `expenses` (progressive logging)
- One `job` → many `payments` (DP, partial, final)
- One `job` → many `job_assignments` (crew + vendors)
- `estimations` stores a full JSON snapshot so historical pricing is always explainable

---

## 3. Core Operational Flow

### 3.1 End-to-End Master Flow

```
┌────────────────────────────────────────────────────────┐
│                    LEAD PHASE                        │
│                                                        │
│  Customer Contact (WhatsApp / Call / Walk-in)         │
│         ↓                                              │
│  Create Lead Record                                 │
│  (customer info, pickup, destination, notes)          │
│         ↓                                              │
│  Attach Photos / Media                                 │
│         ↓                                              │
│  ┌──────────────────────────────────────────────┐      │
│  │  Survey Needed?                               │      │
│  │  ├─ NO  → proceed to Estimation              │      │
│  │  └─ YES → Schedule Survey                    │      │
│  │              ↓                               │      │
│  │         Create Calendar Event (Google Cal)   │      │
│  │              ↓                               │      │
│  │         Conduct Survey (on-site)             │      │
│  │              ↓                               │      │
│  │         Upload Survey Photos/Notes           │      │
│  │              ↓                               │      │
│  │         Proceed to Estimation                │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────┐
│                  ESTIMATION PHASE                       │
│                                                        │
│  Open Estimation Engine (MarginCalc)                  │
│         ↓                                              │
│  Input: vehicle, distance, manpower,                  │
│         packing, toll, special services                │
│         ↓                                              │
│  Engine calculates cost + suggested price             │
│         ↓                                              │
│  Operator review + manual override (optional)         │
│         ↓                                              │
│  Save Estimation Snapshot (inputs + outputs + version)│
└────────────────────────────────────────────────────────┘
         ↓
┌────────────────────────────────────────────────────────┐
│                  PROPOSAL PHASE                         │
│                                                        │
│  Generate Proposal (auto-numbered)                    │
│         ↓                                              │
│  Generate Proposal PDF                                 │
│         ↓                                              │
│  Send to Customer (WhatsApp deeplink)                 │
│         ↓                                              │
│  ┌──────────────────────────────────────────────┐      │
│  │           NEGOTIATION LOOP                   │      │
│  │  Customer Response                           │      │
│  │  ├─ ACCEPTED   → proceed to Job Creation    │      │
│  │  ├─ COUNTER    → log revision, re-quote     │      │
│  │  ├─ NO REPLY   → mark Expired (auto/manual) │      │
│  │  └─ REJECTED   → mark Closed Lost + reason  │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────┘
         ↓ (Accepted)
┌────────────────────────────────────────────────────────┐
│                    JOB PHASE                            │
│                                                        │
│  Convert Proposal → Job                               │
│         ↓                                              │
│  Optional: Collect Down Payment                       │
│         ↓                                              │
│  Create Job Calendar Event (Google Cal)               │
│         ↓                                              │
│  Assign Vendor(s) + Crew                              │
│         ↓                                              │
│  ──────────── EXECUTION DAY ──────────────            │
│         ↓                                              │
│  Log Expenses (quick entry, mobile)                   │
│  Monitor Live Profit Dashboard                        │
│         ↓                                              │
│  ──────────── JOB COMPLETE ───────────────            │
│         ↓                                              │
│  Generate Invoice                                     │
│         ↓                                              │
│  Collect Final Payment                                │
│         ↓                                              │
│  Mark Job Closed                                      │
└────────────────────────────────────────────────────────┘
```

---

### 3.2 Proposal Status State Machine

```
            ┌───────────────┐
            │     DRAFT     │  ← Created from estimation
            └───────┬───────┘
                    │ operator sends to customer
                    ▼
            ┌───────────────┐
            │     SENT      │  ← PDF sent via WhatsApp
            └───────┬───────┘
                    │ customer responds
                    ▼
            ┌───────────────┐
            │  NEGOTIATING  │  ← Counter-offers logged here
            └───────┬───────┘
           ┌────────┼────────┐
           ▼        ▼        ▼
      ┌─────────┐ ┌──────┐ ┌─────────┐
      │APPROVED │ │LOST  │ │EXPIRED  │
      │→ Job    │ │+reason│ │(no resp)│
      └─────────┘ └──────┘ └─────────┘
```

**State Transition Rules:**

- `DRAFT → SENT`: Triggered manually by operator
- `SENT → NEGOTIATING`: Customer responds with counter-offer
- `NEGOTIATING → APPROVED`: Operator marks as agreed
- `NEGOTIATING → LOST`: Operator marks as rejected (requires reason field)
- `SENT/NEGOTIATING → EXPIRED`: Manual or after configurable TTL (e.g. 7 days no response)
- `APPROVED → JOB`: Proposal converts to Job (one-way, irreversible)

---

### 3.3 Job Status State Machine

```
         ┌──────────────────┐
         │    SCHEDULED     │  ← Created from approved proposal
         └────────┬─────────┘
                  │ on move day
                  ▼
         ┌──────────────────┐
         │   IN_PROGRESS    │  ← Expenses logged here
         └────────┬─────────┘
                  │ loading/unloading done
                  ▼
         ┌──────────────────┐
         │    COMPLETED     │  ← Invoice generated
         └────────┬─────────┘
                  │ payment received
                  ▼
         ┌──────────────────┐
         │     CLOSED       │  ← Final state
         └──────────────────┘

         (any state → CANCELLED)
```

---

### 3.4 Quick Expense Entry Flow (Mobile)

```
Operator on field
      ↓
Open IM Ops (mobile browser)
      ↓
Navigate to Active Job
      ↓
Tap "+ Add Expense"
      ↓
┌─────────────────────────────────┐
│  1. Enter amount (numeric pad)  │  ← Large number input
│  2. Select category (chips):    │
│     [Vehicle] [Crew] [Food]     │
│     [Toll] [Parking] [Misc]     │
│  3. Optional: type short note   │
│  4. Optional: attach photo      │
│  5. Tap SAVE                    │
└─────────────────────────────────┘
      ↓
Expense logged + timestamp
      ↓
Live profit dashboard auto-updates
      ↓
Alert fires if buffer threshold crossed
```

**Target: under 5 seconds for standard entry (no photo)**

---

### 3.5 Live Profit Calculation Logic

```
Revenue (from approved proposal final_price)
  - Expenses Logged So Far          = Actual Spend
  - Forecast Remaining Cost         = (Original Estimated Cost - Actual Spend)
                                      capped at 0 if overspent
  ──────────────────────────────────────────────────────
  Predicted Profit                  = Revenue - Actual Spend - Forecast Remaining

  Buffer Remaining                  = Predicted Profit - Minimum Target Profit
```

**Example:**

| Metric                  | Value        |
| ----------------------- | ------------ |
| Revenue                 | Rp 4.250.000 |
| Actual Spend (so far)   | Rp 700.000   |
| Forecast Remaining Cost | Rp 500.000   |
| Predicted Profit        | Rp 3.050.000 |
| Minimum Target Profit   | Rp 500.000   |
| Safe Remaining Buffer   | Rp 2.550.000 |

**Alert Conditions:**

- 🟡 Warning: `Predicted Profit < Minimum Target Profit × 1.5`
- 🔴 Danger: `Predicted Profit < Minimum Target Profit`
- ⚫ Critical: `Predicted Profit ≤ 0`

---

## 4. Module Specifications

### 4.1 Lead Management

**Purpose:** First contact capture. Everything begins here.

**Lead Status Flow:**

```
NEW → PHOTO_RECEIVED → SURVEY_SCHEDULED → SURVEY_DONE → ESTIMATING → PROPOSAL_SENT → CONVERTED / CLOSED
```

**Fields:**
| Field | Type | Notes |
|---|---|---|
| customer_id | FK | Link or create new |
| lead_type | enum | whatsapp, onsite_request, returning, corporate |
| pickup_address | text | Full address |
| destination_address | text | Full address |
| move_date_preferred | date | Optional |
| notes | text | Freeform |
| origin_channel | enum | whatsapp, call, referral, walkin |
| status | enum | See flow above |
| photos | storage[] | Uploaded by operator |

**Key Actions:**

- Create lead from WhatsApp conversation
- Attach photos from phone camera
- Convert lead to survey or direct to estimation
- Duplicate lead for re-quote

---

### 4.2 Survey System

**Purpose:** Optional onsite visit for complex moves.

**Survey Trigger Criteria (guidance, not enforced):**

- Item count > operator threshold
- Special items (piano, safe, server rack)
- Multi-floor, no elevator
- Long-distance / interprovincial move

**Survey Record:**
| Field | Type | Notes |
|---|---|---|
| lead_id | FK | Parent lead |
| scheduled_at | timestamp | — |
| conducted_at | timestamp | Filled after survey |
| surveyor_id | FK (user) | Who conducted |
| photos | storage[] | Room-by-room photos |
| videos | storage[] | Optional walkthrough |
| access_notes | text | Elevator, stairs, parking |
| special_items | jsonb | `[{type, qty, notes}]` |
| gcal_event_id | text | Google Calendar sync |

---

### 4.3 Estimation Engine

**Purpose:** Generate cost and selling price from operational inputs.

**Reference Implementation:** [MarginCalc](https://github.com/dondonudon/MarginCalc)

**Architecture:**

```
┌──────────────────────────────────────────────────────┐
│               Estimation Engine v2                    │
│                                                      │
│  Inputs (UI Form)                                    │
│  ┌──────────────────────────────────────────────┐    │
│  │ vehicle_type    distance_km   manpower_qty   │    │
│  │ packing_service toll_estimate special_items  │    │
│  └────────────────────────┬─────────────────────┘    │
│                           │                          │
│  System Settings (DB)     │                          │
│  ┌──────────────────┐     │                          │
│  │ crew_day_rate    │─────►  Calculator Core         │
│  │ overtime_rate    │         (ported from           │
│  │ overnight_fee    │          MarginCalc)            │
│  │ vehicle_rates{} │              │                  │
│  │ packing_rates{} │              ▼                  │
│  │ default_margin  │     Estimated Cost              │
│  └──────────────────┘     Suggested Price            │
│                           Margin Breakdown           │
│                           Explainability Table       │
│                                │                     │
│  Manual Override              │                     │
│  ┌──────────────────┐         ▼                     │
│  │ override_cost    │   Save Snapshot               │
│  │ override_price   │   (inputs + outputs + ver)    │
│  │ override_margin  │                               │
│  └──────────────────┘                               │
└──────────────────────────────────────────────────────┘
```

**Configurable Settings Table (`system_settings`):**

| key                            | category | description                          | example |
| ------------------------------ | -------- | ------------------------------------ | ------- |
| `crew_day_rate`                | crew     | Default crew cost per person per day | 175000  |
| `crew_overtime_rate`           | crew     | Additional per hour overtime         | 25000   |
| `overnight_fee`                | crew     | Fee if job runs overnight            | 100000  |
| `default_margin_pct`           | pricing  | Default margin percentage            | 30      |
| `vehicle_rate_pickup`          | vehicle  | Pickup truck daily rate              | 500000  |
| `vehicle_rate_box_truck`       | vehicle  | Box truck daily rate                 | 800000  |
| `vehicle_rate_container`       | vehicle  | Container truck daily rate           | 1500000 |
| `packing_bubble_per_roll`      | packing  | Bubble wrap per roll                 | 50000   |
| `packing_stretchfilm_per_roll` | packing  | Stretch film per roll                | 35000   |
| `min_target_profit`            | safety   | Minimum acceptable profit            | 500000  |

**Estimation Snapshot (stored as JSONB):**

```json
{
  "version": "2.1.0",
  "inputs": {
    "vehicle_type": "box_truck",
    "distance_km": 25,
    "manpower_qty": 4,
    "packing_service": true,
    "toll_estimate": 200000
  },
  "settings_snapshot": {
    "crew_day_rate": 175000,
    "vehicle_rate_box_truck": 800000
  },
  "outputs": {
    "estimated_cost": 1700000,
    "suggested_price": 2380000,
    "margin_pct": 30,
    "breakdown": {
      "vehicle": 800000,
      "crew": 700000,
      "toll": 200000
    }
  },
  "overrides": {
    "final_price": 2250000,
    "override_reason": "returning customer"
  }
}
```

---

### 4.4 Proposal System

**Purpose:** The primary business document. Sent to customer for approval.

**Proposal Number Format:**

```
{SEQ}/{SERVICE_TYPE}-IM/{MONTH_ROMAN}/{YEAR}

Example: 367/DOM-IM/V/2026

Segments:
  367   → auto-incremented sequence (per year or global, configurable)
  DOM   → service type code (DOM = Domestic, INT = International, etc.)
  IM    → company identifier
  V     → Roman numeral month (I–XII)
  2026  → 4-digit year
```

**Negotiation Tracking:**
| Version | Amount | Date | Changed By | Note |
|---|---|---|---|---|
| 1 | Rp 4.500.000 | 2026-05-10 | operator | Initial quote |
| 2 | Rp 4.000.000 | 2026-05-11 | customer | Counter-offer |
| 3 | Rp 4.250.000 | 2026-05-11 | operator | Final agreed |

Each revision stored as a row in `proposal_revisions`:

```
proposal_revisions
  id, proposal_id, version_number, price, changed_by, note, created_at
```

**WhatsApp Actions (deeplink, not API):**

```
wa.me/{customer_phone}?text={encoded_message}

Standard message templates:
  - Send proposal summary
  - Follow-up nudge
  - Payment reminder
  - Job day confirmation
```

> ⚠️ This is manual workflow — operator taps link, sends from their own WhatsApp. No automation, no WhatsApp Business API required.

**PDF Generation:**

- Library: `@react-pdf/renderer` or Puppeteer (headless Chrome)
- Template: Company letterhead, itemized breakdown, terms
- Stored in Supabase Storage after generation
- Download link embedded in proposal record

---

### 4.5 Operational Scheduling

**Architecture:**

```
┌────────────────────────────────────────────────────────┐
│                  HYBRID CALENDAR DESIGN                 │
│                                                        │
│  Google Calendar (Source of Truth for Events)         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  • Survey events                                  │ │
│  │  • Job events                                     │ │
│  │  • Reminders / notifications                      │ │
│  │  • Visible to operator on personal phone          │ │
│  └────────────────────────┬──────────────────────────┘ │
│                           │ Push sync (one-way)        │
│                           ▼                            │
│  IM Ops Internal UI (Read + Navigate)                 │
│  ┌───────────────────────────────────────────────────┐ │
│  │  FullCalendar component                           │ │
│  │  • Color-coded: Survey=Blue, Job=Green            │ │
│  │  • Click event → open job/survey record           │ │
│  │  • Overlap warnings (visual only, not blocking)   │ │
│  │  • Month / Week / Day views                       │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

**Google Calendar Sync Specification:**

| Action               | Direction       | Behavior                                       |
| -------------------- | --------------- | ---------------------------------------------- |
| Create survey/job    | IM Ops → GCal   | Push event to configured calendar              |
| Reschedule in IM Ops | IM Ops → GCal   | Update event datetime                          |
| Cancel job           | IM Ops → GCal   | Update event title + color to CANCELLED (gray) |
| Delete in GCal       | Not synced back | GCal-side deletion does NOT affect IM Ops      |
| Edit in GCal         | Not synced back | IM Ops is the operational truth                |

> Rationale: One-way sync avoids conflict resolution complexity. GCal is for visibility and reminders only.

**Scheduling Overlap Logic:**

- System checks vendor and crew assignments for date conflicts
- Shows warning badge: "Vendor X already assigned on this date"
- Does NOT block saving — operator decides

---

### 4.6 Resource Management

**Vendor Record:**
| Field | Notes |
|---|---|
| name | Company or individual name |
| phone | Contact number |
| vehicle_types | Array: `[pickup, box_truck, container]` |
| service_areas | Array of covered cities/areas |
| rate_assumptions | JSONB: `{box_truck_daily: 800000, ...}` |
| reliability_score | 1–5, computed from history |
| cancellation_count | Auto-tracked |
| notes | Freeform operational notes |

**Crew Record:**
| Field | Notes |
|---|---|
| name | Full name |
| phone | Contact number |
| skills | Array: `[packing, driving, heavy_lift, rigging]` |
| daily_rate | Default day rate |
| availability_status | available / unavailable / unknown |
| reliability_score | 1–5, computed from history |
| overtime_frequency | Computed |
| notes | Freeform |

**Reliability Scoring (auto-computed):**

```
vendor_reliability_score =
  (on_time_jobs / total_jobs) × 3
  + (1 - cancellation_rate) × 2
  → normalized to 1–5
```

---

### 4.7 Expense Tracking System

**Expense Categories:**

| Category            | Subcategories                              |
| ------------------- | ------------------------------------------ |
| `vehicle_rental`    | — (fuel included in vendor rate)           |
| `crew_payment`      | basic, overtime, transport_home            |
| `packing_materials` | bubble_wrap, stretch_film, cardboard, tape |
| `food`              | crew meals                                 |
| `toll`              | —                                          |
| `parking`           | —                                          |
| `miscellaneous`     | unexpected items                           |

**Expense Record:**
| Field | Type | Notes |
|---|---|---|
| job_id | FK | Parent job |
| amount | integer | In IDR (no decimals) |
| category | enum | From list above |
| subcategory | text | Optional further detail |
| note | text | Optional short description |
| photo_url | text | Receipt / proof photo |
| logged_by | FK (user) | Operator who logged it |
| logged_at | timestamp | Auto-set |
| expense_time | timestamp | Optional: actual time expense occurred |

**Operational Timeline (job_timeline):**

```
job_timeline
  id, job_id, event_time, event_type, note, logged_by
```

| event_type           | Example note                      |
| -------------------- | --------------------------------- |
| `loading_start`      | "Loading started, 4 crew on site" |
| `loading_done`       | —                                 |
| `transit_start`      | "Departed from Kemang"            |
| `transit_done`       | "Arrived at Pondok Indah"         |
| `unloading_start`    | —                                 |
| `overtime_approved`  | "Customer approved 2hr OT"        |
| `overnight_approved` | "Job extended to next day"        |
| `unloading_done`     | —                                 |
| `custom`             | Freeform operator note            |

---

### 4.8 Customer Payment Tracking

**Payment Types:**

| type           | Description                     |
| -------------- | ------------------------------- |
| `down_payment` | Pre-job advance. Optional.      |
| `partial`      | Mid-job or partial clearance    |
| `final`        | Remaining balance               |
| `refund`       | Job cancellation or overpayment |

**Payment Status per Job:**

```
UNPAID → PARTIALLY_PAID → FULLY_PAID
                       → OVERPAID (if refund needed)
```

**Payment Record:**
| Field | Notes |
|---|---|
| job_id | FK |
| amount | Amount received |
| payment_type | enum above |
| method | cash / transfer / qris |
| reference_no | Bank transfer ref (optional) |
| received_at | Timestamp |
| proof_url | Screenshot / receipt photo |
| note | Optional |

---

### 4.9 Invoice System

**Invoice Generation Trigger:** Job status moves to `COMPLETED`

**Invoice Record:**
| Field | Notes |
|---|---|
| job_id | FK (one-to-one) |
| invoice_number | Auto-generated, configurable format |
| issued_at | Date of generation |
| due_at | Configurable days after issue |
| total_amount | From job revenue |
| paid_amount | Sum of payments |
| outstanding | `total - paid` |
| status | unpaid / partial / paid / overdue |
| pdf_url | Generated PDF in Supabase Storage |

---

### 4.10 Reporting & Analytics

**Sales Reports:**
| Metric | Calculation |
|---|---|
| Proposal conversion rate | `approved / total_proposals × 100` |
| Average discount | `(initial_price - final_price) / initial_price × 100` |
| Lost reason breakdown | Count by `closed_reason` field |
| Avg time to close | `approved_at - created_at` |

**Operational Reports:**
| Metric | Calculation |
|---|---|
| Estimated vs actual cost | `actual_expenses / estimated_cost × 100` |
| Over-budget jobs | Jobs where `actual > estimated × 1.1` |
| Vendor utilization | Jobs per vendor in period |
| Crew utilization | Days worked per crew member |

**Financial Reports:**
| Metric | Notes |
|---|---|
| Revenue by period | Sum of `jobs.revenue` by month |
| Gross profit by period | `revenue - total_expenses` |
| Outstanding AR | Sum of `invoices.outstanding` where status ≠ paid |
| Profit per route | Group by pickup area + destination area |

---

## 5. Integration Specifications

### 5.1 Google Calendar Integration

**Setup Requirements:**

- Google Cloud project with Calendar API enabled
- OAuth 2.0 credentials stored in Supabase secrets
- Target calendar ID configurable in `system_settings`

**Event Creation Payload:**

```javascript
// Survey event
{
  summary: `[SURVEY] ${customer.name} — ${lead.pickup_address}`,
  start: { dateTime: survey.scheduled_at },
  end: { dateTime: survey.scheduled_at + 1hr },
  description: `Lead #${lead.id}\n${lead.notes}`,
  colorId: "1" // Blue
}

// Job event
{
  summary: `[JOB] ${customer.name} — ${pickup} → ${destination}`,
  start: { dateTime: job.move_date + "T08:00" },
  end: { dateTime: job.move_date + "T18:00" },
  description: `Job #${job.id}\nProposal: ${proposal.number}\nCrew: ...\nVendor: ...`,
  colorId: "2" // Green
}
```

**Stored on record:** `gcal_event_id` — used for updates and cancellations.

---

### 5.2 WhatsApp Integration (Deeplink Only)

No API integration. All WhatsApp actions are operator-initiated deeplinks.

**Message Templates:**

```javascript
// Proposal send
`wa.me/${phone}?text=Halo ${name}, berikut proposal pindahan dari IM Moving:%0A%0ANo. Proposal: ${proposalNo}%0ATotal: Rp ${price}%0A%0ASilakan dicek dan konfirmasi. Terima kasih.`

// Follow-up
`wa.me/${phone}?text=Halo ${name}, apakah ada pertanyaan terkait proposal ${proposalNo}? Kami siap membantu.`

// Payment reminder
`wa.me/${phone}?text=Halo ${name}, mengingatkan pembayaran untuk pekerjaan ${jobNo}. Sisa: Rp ${outstanding}.`

// Job day confirmation
`wa.me/${phone}?text=Halo ${name}, konfirmasi jadwal pindahan besok ${date} pukul 08:00. Tim kami siap.`
```

Operator taps button in IM Ops → phone opens WhatsApp with pre-filled message → operator sends.

---

### 5.3 PDF Generation

**Recommended:** `@react-pdf/renderer` (client-side, no server dependency)

**Proposal PDF Sections:**

1. Company letterhead (logo, address, contacts)
2. Proposal number + date + validity period
3. Customer information
4. Pickup → Destination
5. Itemized cost breakdown table
6. Total price (highlighted)
7. Terms & conditions
8. Signature area

**Invoice PDF Sections:**

1. Invoice number + issued date + due date
2. Bill to (customer info)
3. Job reference
4. Line items: service description + amount
5. Payment history table
6. Outstanding balance
7. Bank transfer details / QRIS

---

## 6. Database Schema

### Core Tables (PostgreSQL / Supabase)

```sql
-- CUSTOMERS
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  type TEXT DEFAULT 'individual', -- individual | corporate
  company_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- LEADS
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  pickup_address TEXT,
  destination_address TEXT,
  preferred_date DATE,
  lead_type TEXT, -- whatsapp | onsite | returning | corporate
  origin_channel TEXT, -- whatsapp | call | referral | walkin
  status TEXT DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SURVEYS
CREATE TABLE surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  scheduled_at TIMESTAMPTZ,
  conducted_at TIMESTAMPTZ,
  surveyor_id UUID REFERENCES auth.users(id),
  access_notes TEXT,
  special_items JSONB DEFAULT '[]',
  gcal_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ESTIMATIONS
CREATE TABLE estimations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id),
  engine_version TEXT,
  inputs JSONB NOT NULL,
  settings_snapshot JSONB NOT NULL,
  outputs JSONB NOT NULL,
  overrides JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PROPOSALS
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  proposal_number TEXT UNIQUE NOT NULL,
  service_type TEXT DEFAULT 'DOM',
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft', -- draft|sent|negotiating|approved|lost|expired
  initial_price BIGINT,
  final_price BIGINT,
  closed_reason TEXT,
  approved_at TIMESTAMPTZ,
  pdf_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PROPOSAL REVISIONS
CREATE TABLE proposal_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id),
  version_number INTEGER NOT NULL,
  price BIGINT NOT NULL,
  changed_by TEXT, -- 'operator' | 'customer'
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- JOBS
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id),
  job_number TEXT UNIQUE,
  status TEXT DEFAULT 'scheduled', -- scheduled|in_progress|completed|closed|cancelled
  move_date DATE NOT NULL,
  revenue BIGINT NOT NULL,
  gcal_event_id TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- VENDORS
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  vehicle_types TEXT[] DEFAULT '{}',
  service_areas TEXT[] DEFAULT '{}',
  rate_assumptions JSONB DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CREW
CREATE TABLE crew (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  skills TEXT[] DEFAULT '{}',
  daily_rate BIGINT,
  availability_status TEXT DEFAULT 'available',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- JOB ASSIGNMENTS
CREATE TABLE job_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  resource_type TEXT NOT NULL, -- 'vendor' | 'crew'
  resource_id UUID NOT NULL, -- references vendors.id or crew.id
  role TEXT,
  agreed_rate BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- EXPENSES
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  amount BIGINT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  note TEXT,
  photo_url TEXT,
  expense_time TIMESTAMPTZ,
  logged_by UUID REFERENCES auth.users(id),
  logged_at TIMESTAMPTZ DEFAULT now()
);

-- PAYMENTS
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  amount BIGINT NOT NULL,
  payment_type TEXT NOT NULL, -- down_payment|partial|final|refund
  method TEXT, -- cash|transfer|qris
  reference_no TEXT,
  proof_url TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  note TEXT,
  recorded_by UUID REFERENCES auth.users(id)
);

-- INVOICES
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) UNIQUE,
  invoice_number TEXT UNIQUE NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now(),
  due_at TIMESTAMPTZ,
  total_amount BIGINT NOT NULL,
  status TEXT DEFAULT 'unpaid', -- unpaid|partial|paid|overdue
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SYSTEM SETTINGS
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  category TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- JOB TIMELINE
CREATE TABLE job_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id),
  event_time TIMESTAMPTZ DEFAULT now(),
  event_type TEXT NOT NULL,
  note TEXT,
  logged_by UUID REFERENCES auth.users(id)
);
```

---

## 7. Technical Architecture

### 7.1 Stack Summary

| Layer        | Technology                             | Reason                                  |
| ------------ | -------------------------------------- | --------------------------------------- |
| Frontend     | Next.js 14 (App Router) + TypeScript   | SSR + RSC for fast mobile loads         |
| Styling      | Tailwind CSS                           | Utility-first, fast to build            |
| State        | Zustand                                | Lightweight, no Redux boilerplate       |
| Calendar UI  | FullCalendar                           | Mature, supports Google Calendar events |
| i18n         | next-intl                              | EN + ID support                         |
| Backend / DB | Supabase + PostgreSQL                  | Auth, storage, realtime built-in        |
| Auth         | Supabase Auth (Google OAuth only)      | Single sign-on, low maintenance         |
| PDF          | @react-pdf/renderer                    | Client-side, no server                  |
| Storage      | Supabase Storage                       | Photo uploads, PDF storage              |
| Deployment   | Vercel (frontend) + Supabase (backend) | Zero-ops, free tier viable              |

### 7.2 Component Architecture

```
app/
├── (auth)/
│   └── login/
├── (dashboard)/
│   ├── layout.tsx          ← Nav + sidebar
│   ├── page.tsx            ← Dashboard home
│   ├── leads/
│   │   ├── page.tsx        ← List
│   │   ├── [id]/page.tsx   ← Detail
│   │   └── new/page.tsx    ← Create
│   ├── proposals/
│   ├── jobs/
│   │   └── [id]/
│   │       ├── page.tsx           ← Job detail
│   │       ├── expenses/page.tsx  ← Quick expense entry
│   │       └── timeline/page.tsx  ← Operational log
│   ├── calendar/           ← FullCalendar view
│   ├── vendors/
│   ├── crew/
│   ├── invoices/
│   ├── reports/
│   └── settings/           ← system_settings editor
│
components/
├── estimation/
│   ├── EstimationForm.tsx
│   └── EstimationBreakdown.tsx
├── expense/
│   └── QuickExpenseEntry.tsx   ← Mobile-optimized
├── profit/
│   └── LiveProfitPanel.tsx     ← Realtime updates
├── proposal/
│   ├── ProposalPDF.tsx
│   └── NegotiationHistory.tsx
└── shared/
    ├── StatusChip.tsx
    └── WhatsAppButton.tsx

lib/
├── estimation/
│   └── engine.ts           ← MarginCalc port
├── gcal/
│   └── sync.ts             ← Google Calendar push
├── pdf/
│   └── generators/
└── supabase/
    ├── client.ts
    └── server.ts
```

### 7.3 Offline / Connectivity Strategy

Moving operations happen in areas with poor signal (basements, elevators, rural routes).

**Recommendation for MVP:**

- Use `localStorage` + service worker queue for expense entries
- Queue: `{expense_data, job_id, timestamp}[]`
- Auto-sync when connection restored
- Show "pending sync" badge on offline entries

**Implementation:** Next.js PWA (`next-pwa` package) with cache-first for app shell, network-first for data.

### 7.4 Image Optimization (Free Tier Sustainability)

Before upload to Supabase Storage:

```javascript
// Client-side image resize before upload
const resizeImage = async (file: File): Promise<Blob> => {
  const img = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const MAX_WIDTH = 1600;
  const scale = Math.min(1, MAX_WIDTH / img.width);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise(res => canvas.toBlob(res as any, 'image/webp', 0.82));
};
```

---

## 8. Execution Roadmap

### Phase 1 — Foundation (Weeks 1–3)

**Goal:** Auth, navigation, data structure, lead management working end-to-end.

| Feature                   | Notes                                 |
| ------------------------- | ------------------------------------- |
| Google Auth via Supabase  | Single user login                     |
| Navigation shell + layout | Mobile-first responsive               |
| i18n setup (EN + ID)      | next-intl                             |
| Light/dark theme          | Tailwind + CSS vars                   |
| Customer CRUD             | Create, search, view                  |
| Lead CRUD                 | Create, photo upload, status tracking |
| Global search             | Customers + leads + proposals         |
| Supabase schema init      | All tables from Section 6             |

**Milestone:** Can create a customer and log an lead with photos.

---

### Phase 2 — Estimation Engine (Weeks 4–5)

**Goal:** MarginCalc ported, configurable, snapshot-saving.

| Feature                       | Notes                             |
| ----------------------------- | --------------------------------- |
| Port MarginCalc to TypeScript | Preserve all business logic       |
| `system_settings` UI          | Admin can edit pricing rules      |
| Estimation form               | Inputs from section 4.3           |
| Breakdown table               | Explainable output                |
| Manual override               | Price + margin                    |
| Snapshot storage              | JSON saved to `estimations` table |

**Milestone:** Can produce a fully explainable estimate from an lead.

---

### Phase 3 — Proposal Workflow (Weeks 6–8)

**Goal:** Proposals created, sent, negotiated, closed.

| Feature                           | Notes                  |
| --------------------------------- | ---------------------- |
| Proposal creation from estimation | Auto-number generation |
| Proposal PDF generation           | @react-pdf/renderer    |
| WhatsApp deeplink buttons         | Per template type      |
| Negotiation tracking UI           | Version history        |
| Status transitions                | State machine from 3.2 |
| Proposal duplication              | Clone for re-quote     |
| Proposal → Job conversion         | On approval            |

**Milestone:** Full quote-to-approval workflow operational.

---

### Phase 4 — Scheduling & Resources (Weeks 9–11)

**Goal:** Jobs coordinated, crew and vendors assigned, calendar visible.

| Feature                    | Notes                            |
| -------------------------- | -------------------------------- |
| Vendor CRUD                | With vehicle types, areas, rates |
| Crew CRUD                  | With skills, availability        |
| Job creation from proposal | With calendar event push         |
| Google Calendar push sync  | One-way, configurable calendar   |
| FullCalendar UI            | Month/week/day, color-coded      |
| Crew + vendor assignment   | With overlap warnings            |
| Operational timeline       | Chronological job log            |

**Milestone:** Job scheduled, crew/vendor assigned, visible on calendar.

---

### Phase 5 — Expense & Profitability (Weeks 12–14)

**Goal:** Live profit visible during job execution.

| Feature                      | Notes                           |
| ---------------------------- | ------------------------------- |
| Quick expense entry (mobile) | <5s target, large touch targets |
| Live profit dashboard        | Real-time recalculation         |
| Profit alerts                | Yellow/red/critical thresholds  |
| Customer payment tracking    | DP, partial, final, refund      |
| Invoice generation           | PDF + payment tracking          |
| Offline expense queue        | Service worker + localStorage   |

**Milestone:** Operator on field can log expense in under 5 seconds and see live profit.

---

### Phase 6 — Optimization & Reporting (Weeks 15–17)

**Goal:** Business intelligence, operational efficiency, polish.

| Feature                        | Notes                                       |
| ------------------------------ | ------------------------------------------- |
| Sales reports                  | Conversion rate, discount avg, lost reasons |
| Operational reports            | Estimated vs actual, utilization            |
| Financial reports              | Revenue, profit, AR aging                   |
| Advanced filtering             | Date range, status, crew, vendor            |
| Vendor/crew reliability scores | Auto-computed from history                  |
| Survey system (full)           | If not done in Phase 1                      |

---

## 9. MVP Scope

### Version 1 — Must Have

| Feature                            | Phase |
| ---------------------------------- | ----- |
| Customer lead management           | 1     |
| Photo upload (lead + survey)       | 1     |
| MarginCalc estimation engine       | 2     |
| Configurable pricing rules         | 2     |
| Estimation snapshot storage        | 2     |
| Proposal generation + PDF          | 3     |
| Proposal numbering                 | 3     |
| Negotiation tracking               | 3     |
| WhatsApp quick actions (deeplinks) | 3     |
| Proposal → Job conversion          | 3     |
| Vendor + crew management           | 4     |
| Google Calendar push sync          | 4     |
| FullCalendar operational view      | 4     |
| Crew + vendor assignment           | 4     |
| Quick expense entry (mobile)       | 5     |
| Live profit monitoring             | 5     |
| Customer payment tracking          | 5     |
| Invoice generation                 | 5     |
| Global search                      | 1     |
| Mobile-first UI                    | All   |

### Version 2 — Nice to Have

- Customer portal (read-only: view proposal + invoice)
- Digital signatures on proposals
- Vendor performance dashboard
- Crew attendance + payroll summary
- Packing material inventory tracking

### Version 3 — Advanced

- AI volume estimation from room photos
- AI cost prediction from historical jobs
- AI risk detection (underquoted, low-margin)
- GPS tracking integration

---

## 10. Future AI Opportunities

Because IM Ops accumulates rich operational data over time, AI features become increasingly viable.

**Data Assets Built by IM Ops:**

| Asset                          | Volume Over Time  | AI Application          |
| ------------------------------ | ----------------- | ----------------------- |
| Room photos                    | Thousands of jobs | Volume estimation model |
| Estimation snapshots           | Per proposal      | Cost prediction model   |
| Actual vs estimated deltas     | Per job           | Accuracy improvement    |
| Route + cost history           | Per job           | Route cost model        |
| Crew assignment + job outcomes | Per job           | Crew efficiency model   |

**AI Feature Roadmap:**

### AI Volume Estimation

- Input: photos uploaded at lead / survey stage
- Output: estimated cubic meters, recommended vehicle type, recommended manpower
- Implementation: fine-tuned vision model on moving-specific data

### AI Cost Prediction

- Input: pickup area, destination, volume estimate, special items, date
- Output: predicted total cost range based on historical similar jobs
- Implementation: regression model on `estimations` + `expenses` history

### AI Risk Detection

- Flags: underquoted proposals, historically expensive routes, jobs with overtime risk
- Implementation: anomaly detection on historical estimation-vs-actual data

### AI Volume Assessment (Long-term)

- Customer uploads room photos via web form
- System auto-generates preliminary estimate before operator review
- Dramatically reduces manual estimation time for standard moves

---

*IM Ops — Built for operational agility, not ERP rigidity.*
*Version 2.0 — May 2026*
