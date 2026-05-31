# IM Ops — Full UX Redesign Plan

> Scope agreed with stakeholder: **Full UX rethink** (information architecture + interaction flows + visual language), **desktop and mobile both first-class**, direction proposed by the design lead, **plan approved before any code**.
> Status: **IN PROGRESS** — approved & building. Last updated: 2026-05-31.

---

## Progress snapshot — 2026-05-31

We deviated from strict phase order in one deliberate way: after the Phase 1 proof landed, we ran a **full-system visual migration** (every screen onto the kit/tokens) before building the remaining structural features. That front-loaded the "screen-by-screen" visual work from phases 4–6.

**✅ Done**
- **Design-system foundation** — semantic token system (light + dark, cobalt), `src/components/ui` kit: Button, Card, Badge (+ `toneFor`), Stat, Money, PageHeader, EmptyState, RouteLine, Field/Input/Select/Textarea/FormError, Table primitives.
- **`/today`** — redesigned triage cockpit (replaces old dashboard; `/dashboard` now redirects).
- **Font** — DM Sans wired correctly (serif bug was stale CSS); body weight + faint-text contrast tuned.
- **System-wide visual migration** — ALL ~68 screens/components on the kit + tokens. Zero legacy color classes remain in `src/`. StatusChip/Skeleton/Theme+Locale toggles/loading states converted.
- **App shell chrome** — sidebar + topbar reskinned to the light token chrome.
- **Pipeline board (`/pipeline`)** — the deal funnel as one board, **with drag-to-advance** through an invariant-enforcing server action.
- **Nav IA consolidation** — flat sidebar (**Today · Pipeline · Jobs · Calendar · Money · Directory · Settings**) + a `SectionTabs` secondary bar giving Pipeline (Board/Leads/Proposals), Money (Invoices/Reports) and Directory (Customers/Vendors/Crew) coherent sub-navigation. Routes stay backward-compatible.
- **Mobile field-mode bottom-tabs** — thumb-reachable bar (**Today · Jobs · ＋ · Money · Menu**), `md:hidden`, with a quick-add sheet (New lead / New customer / Search). FAB lifted clear of the bar.

- **Pipeline drag-to-advance** — works on **desktop AND touch** now (pointer-events engine: per-card drag handle, floating ghost, edge auto-scroll; tap still opens the lead, swipe still scrolls).
- **Quick lead capture** — global `QuickLeadModal` (top-bar "New lead" + mobile ＋ sheet); essentials only, advanced behind "Add details".
- **Perceived-latency pass** — optimistic nav feedback (clicked sidebar/tab/bottom-nav item highlights + spins instantly via `useNavFeedback`); prominent glowing progress bar; `loading` prop on the kit `Button` **applied across ~21 async action buttons**; **tailored `loading.tsx` skeletons for all 11 main routes**.
- **Reports** — expense-category labels now translate correctly.
- **Unified Deal detail** — the lead page is now the deal hub: a `DealTimeline` shows the full lifecycle (intake → survey → estimate & proposal → job) with inline status/price and drill-in links, so a deal is followed end-to-end on one page.
- **Legacy CSS removed** — the temporary `.dark .bg-white{…}` override block is **deleted**; native form controls now use a clean token-based base style. Dark mode is 100% token-driven.
- **Jobs List / Board view toggle** — `/jobs?view=board` shows jobs grouped into status columns (Scheduled / In progress / Completed / Closed / Cancelled) with per-column counts + revenue; List view unchanged. (Calendar stays its own top-level item per decision.)
- **Money hub (`/money`)** — unified "where's the cash" landing: KPI stats (outstanding / overdue / cash-in / net), **AR aging** buckets, recent payments, invoice-status breakdown. Now the Money landing (Overview · Invoices · Reports tabs); sidebar + bottom-nav point here.
- **⌘K command-bar promotion** — the palette now *acts*: an Actions layer (New lead / customer / vendor / crew + jump-to Today/Pipeline/Jobs/Calendar/Money/Settings) merged with search, fully keyboard-navigable; empty state is now an action launcher.
- **Polish pass** — `prefers-reduced-motion` honored globally; **pipeline cards keyboard-movable** (←/→ to advance stage, Enter to open); dead code removed (`DashboardTabBar`); **whole app is now 100% token-based — zero raw gray/slate/zinc or `dark:` color classes remain**.
- **Security & performance hardening** — fixed **PostgREST filter-injection** on the search inputs (shared `sanitizeSearch` in `lib/utils`, used by leads/customers lists + ⌘K) and an **open-redirect** in the OAuth callback (`next` now same-origin-validated); added **server-side pagination** (25/page, `count` + `.range()`, preserves filters) to all 7 list pages (leads, customers, jobs, vendors, crew, invoices, proposals).

**⬜ Remaining (optional)**
- **Reports metric gaps** — avg discount, vendor/crew utilization (data/reporting feature, not visual polish).
- **Manual dark-mode visual QA** — needs a human eye on a running build; the code is fully token-driven so it should be consistent.
- Formal right-rail action pattern (the status-driven action panels already live in the detail right rail).
- **Phase 7 polish (remaining)** — motion pass; a11y/keyboard DnD for the pipeline; dark-mode QA; reports metric gaps (avg discount, vendor/crew utilization).

See the updated status column in §8.

---

## 0. The problem with what exists today

The current app is a **competent generic admin template**, not a product designed around how a moving company actually works.

Concrete observations from the codebase:

- **Navigation mirrors the database, not the work.** The sidebar is grouped Pipeline / Operations / Resources / Finance — i.e. by table. The operator's real mental model is a single funnel that moves left to right: a lead becomes a survey becomes an estimate becomes a proposal becomes a job becomes an invoice. The UI makes them hop between separate list screens to follow one deal.
- **No design system.** Brand styling is hardcoded inline (`bg-brand-600`, `text-slate-800`, `bg-white`) across ~30 routes. There are no shared primitives (Button, Card, Badge, Table, Field, Sheet). Every screen reinvents spacing and color.
- **Dark mode is a hack.** `globals.css` overrides Tailwind utility classes (`.dark .bg-white { … }`) instead of using semantic tokens. This is brittle, leaks, and blocks any real theming.
- **Desktop and mobile are the same screen, shrunk.** A dispatcher at a desk and a crew lead in a truck have completely different jobs, but they get the same KPI-cards-over-tables layout. There's a mobile expense screen, but no coherent field experience.
- **Visual identity is anonymous.** Violet-on-grey with rounded cards — it could be any SaaS. Nothing says "moving / logistics / operations."

A reskin fixes none of this. This plan rethinks all four layers.

---

## 1. Design direction — **"Dispatch"**

A proposed identity and design language. Everything here is a starting proposal to react to, not a locked decision.

### 1.1 Concept

An **operational cockpit**, not a dashboard. The product's job is to tell whoever opens it *what needs to happen next* and let them do it in as few moves as possible. Calm canvas, confident accents, dense where it counts (tables, money), generous where it matters (field actions, status).

### 1.2 Visual language

| Token group | Direction | Why |
|---|---|---|
| **Neutrals** | True cool-neutral **zinc** scale (not slate-blue). | Calmer, more "tool-like" canvas; lets the accent and status colors carry meaning. |
| **Brand / primary action** | **Cobalt blue** (`#2563eb`-family). Decisive shift away from the current violet so the redesign reads as genuinely new, while staying trustworthy and high-contrast in both themes. | Violet→cobalt is the single clearest signal that this is a redesign, not a retheme. |
| **Semantic — money/positive** | **Emerald** (paid, profit, won). | Money is the point of the app; it deserves its own consistent color. |
| **Semantic — pending/attention** | **Amber** (awaiting action, draft, survey due). | |
| **Semantic — danger/overdue** | **Rose** (overdue, lost, cancelled). | |
| **Surfaces** | Light app shell with a **soft-neutral chrome** (not the heavy dark-navy sidebar). True dark mode as a first-class peer, built on tokens. | The dark navy makes the app feel like a 2019 admin panel. |
| **Type** | Keep Geist. Establish a real scale: display / h1 / h2 / body / label / mono (for IDs + currency). Currency and IDs always `tabular-nums`. | |
| **Shape & depth** | Slightly tighter radii (xl→lg as default), flatter cards, depth via subtle borders + one elevation level — not the current double box-shadow. | Reads as faster and more modern. |
| **Motion** | Purposeful only: optimistic state changes, sheet/drawer transitions, status pulses. No decorative animation. | |
| **Identity moments** | Logistics character comes from *layout and iconography* (route lines pickup→destination, timeline rails, dispatch board), not a gimmick color. | |

> Alternatives if cobalt doesn't land: a refined **near-black + single warm accent** (amber "in-motion"), or a **deep teal** primary. I'll mock the dashboard in the chosen direction before going wide (see Phase 1).

### 1.3 Principles

1. **Next-action first.** Every screen answers "what should I do now?" before "here is all the data."
2. **The funnel is the product.** Navigation and the home screen are organized around the deal lifecycle, not tables.
3. **Two front doors.** A desktop **Office cockpit** and a mobile **Field mode** — same data, different jobs, different layouts.
4. **One token system, one component kit.** Nothing styled inline. Theming is free.
5. **Status is a first-class citizen.** Consistent status language (color + label + dot) everywhere a record appears.

---

## 2. Information architecture — old → new

### 2.1 Current nav (by table)
```
Dashboard
Pipeline:   Leads · Proposals
Operations: Jobs · Calendar
Resources:  Customers · Vendors · Crew
Finance:    Invoices · Reports
Settings
```

### 2.2 Approved nav (by workflow)
```
Today          ← operator home: what's happening now + what needs me
Pipeline       ← the funnel as ONE board: Lead → Survey → Estimate → Proposal → Won
Jobs           ← active & scheduled operations (List / Board views)
Calendar       ← kept top-level (per stakeholder decision)
Money          ← Invoices · Payments · Reports unified
Directory      ← Customers · Vendors · Crew (tabbed)
Settings
```

> **Decisions locked (2026-05-31):** consolidate Leads+Proposals→Pipeline, Invoices+Reports→Money, Customers/Vendors/Crew→Directory — **but Calendar stays a top-level item** (not folded into Jobs). Brand = **cobalt blue**. Field mode = **viewport-based** (phone-sized → field layout, no role/manual toggle). Light shell default with first-class dark.

### 2.3 What this changes

- **Leads + Proposals collapse into "Pipeline."** They are stages of one funnel, not two destinations. A deal is followed end-to-end on a kanban board; clicking a card opens the full deal context (lead info, survey, estimate, proposal, negotiation history) without leaving the funnel.
- **Calendar stops being a top-level silo.** It becomes a *view* of Jobs (List / Board / Calendar toggle), because a calendar with nothing to schedule is useless on its own.
- **Reports + Invoices + Payments unify into "Money."** They answer one question — "where's the cash?" — and are currently split across two nav items.
- **Customers / Vendors / Crew become "Directory"** (a tabbed reference area) — they're lookups, not daily destinations, so they shouldn't occupy three top-level slots.
- **"Today" replaces "Dashboard."** Not a vanity-metrics page — a triage surface: today's moves, surveys due, proposals awaiting send, invoices overdue, calendar-sync failures. Role-aware.

Route paths can stay backward-compatible (`/leads`, `/proposals` still resolve) so the backend and deep links don't break — the *navigation and screens* change, not the URL contract, except for net-new screens (`/today`, `/pipeline`).

---

## 3. App shell — two front doors

### 3.1 Desktop — "Office cockpit"
- **Slimmer icon+label sidebar** on the new neutral chrome (collapsible, as today, but token-driven).
- **Command bar** stays (⌘K) and gets promoted: it becomes the primary way to *act* ("create lead", "log expense for #JOB-…", "go to invoice"), not just search.
- **Context rail (right)** on detail screens: the status-driven action panel (currently `LeadActionPanel`, `ProposalActionPanel`, etc.) moves into a consistent right rail so "what can I do with this record" is always in the same place.

### 3.2 Mobile — "Field mode"
- **Bottom tab bar** (Today · Jobs · + · Money · Menu) replacing the hamburger drawer for primary nav. Thumb-reachable.
- **Field-optimized screens:** today's assigned moves, big-tap expense logging (already partially exists in `ExpensePanel`/`expenseQueue`), timeline event logging, one-tap WhatsApp/call/navigate.
- **The "+" is contextual** (log expense / new lead / add photo) — replaces the current single-purpose FAB.
- Field mode is a *layout + navigation* variant gated on viewport/role, sharing all data and components with the cockpit.

---

## 4. Design system foundation (the part that makes everything else possible)

This is built **first** because every screen depends on it.

### 4.1 Semantic token layer
Replace the current scattered `--background/--foreground/--card/--sidebar` + utility-override approach with a full semantic token set, defined once for light and dark:
```
--color-bg, --color-bg-subtle, --color-surface, --color-surface-raised
--color-border, --color-border-strong
--color-text, --color-text-muted, --color-text-faint
--color-primary, --color-primary-hover, --color-primary-fg
--color-success / -warning / -danger (+ -bg, -fg variants)
--radius-*, --shadow-*, --space scale
```
Wire these into `tailwind.config.ts` as named colors (`bg-surface`, `text-muted`, `border`, `bg-primary`…). **Dark mode then needs zero per-utility overrides** — flip the token values under `.dark` and everything follows. This deletes the entire override block in `globals.css`.

### 4.2 Component kit (`src/components/ui/`)
Build the primitives every screen reuses:
`Button` · `IconButton` · `Card` · `Badge`/`StatusChip` (consolidate the existing status helpers) · `Table` (+ responsive card-list fallback for mobile) · `Field`/`Input`/`Select`/`Textarea` · `Sheet`/`Drawer` · `Dialog` · `Tabs` · `EmptyState` · `Avatar` · `Money` (formats + colors currency consistently) · `RouteLine` (pickup→destination) · `Timeline` · `KpiStat` · `PageHeader`.

These replace the inline-Tailwind repetition. Existing PDF components, Supabase calls, and server-component data fetching are **untouched** — this is purely the presentation layer.

### 4.3 Status system
One source of truth for every status (lead/proposal/job/invoice/payment): label (i18n), color token, dot. Currently spread across `StatusChip`, `EntityStatusChip`, and inline `cfg` maps in `dashboard/page.tsx` — consolidate.

---

## 5. Screen-by-screen redesign

| Screen | Today | Redesign |
|---|---|---|
| **/today** (was /dashboard) | KPI cards + tables + tabs (Overview/Dispatch/Financials) | Triage surface: "Needs you" action queue, today's moves strip, live money line, sync-failure alerts. Role-aware (office vs field). |
| **/pipeline** (new; absorbs /leads + /proposals) | Two separate filterable lists | Kanban board across funnel stages with drag-to-advance; card → deal detail (lead + survey + estimate + proposal + negotiation in one context). List view available for power users. |
| **/leads/[id], /proposals/[id]** | Detail pages with bespoke action panels | Unified **Deal detail** with the status-driven action panel in the standard right rail; consistent timeline + documents. |
| **/jobs** | List | List / **Board** / **Calendar** view toggle in one screen (absorbs /calendar). |
| **/jobs/[id]** | Job hub (overview, assignments, expenses, timeline, invoice) | Same powerful hub, rebuilt on the kit: clear phase header, live profit, assignments, expense log, timeline, invoice handoff. Field-mode variant for crew. |
| **/calendar** | Standalone FullCalendar | Becomes the Calendar *view* of Jobs (kept as a route alias). |
| **/money** (new; Invoices + Payments + Reports) | Split across /invoices + /reports | One area: AR aging + cash-in, invoice list/detail, payments, the report summaries. |
| **/invoices, /invoices/[id]** | List + detail | Rebuilt on kit under Money; payment recording as a Sheet, PDF unchanged. |
| **/reports** | Minimal summary | Becomes Money's analytics tab; structured for the gaps noted in README (avg discount, lost-reason, AR aging, utilization) — layout ready even if some metrics land later. |
| **/directory** (Customers/Vendors/Crew) | 3 list areas | Tabbed reference area; detail pages rebuilt on kit, vendor/crew reliability & availability surfaced. |
| **/estimations/new, /[id]** | Form + live breakdown | Rebuilt on Field/Input kit; live cost+price breakdown as a sticky summary. (Also closes README gap: edit existing estimation.) |
| **/surveys/[id]** | Detail + media | Rebuilt on kit; media gallery + lightbox standardized. |
| **/settings** | system_settings editor | Rebuilt on kit; grouped sections. |
| **/login** | OAuth entry | Reskinned to new identity. |

---

## 6. New / improved interaction patterns

1. **Drag-to-advance pipeline** — move a deal between stages on the board; the underlying status transition + side effects (the spec's action map) fire with optimistic UI.
2. **Command-driven actions** — ⌘K (desktop) and the contextual "+" (mobile) become the fastest path to *do* things, not just navigate.
3. **Standard right-rail action panel** — every record's available next-actions live in the same place, driven by status (reuses existing `*ActionPanel` logic).
4. **One-tap field actions** — call / WhatsApp / navigate-to-address / log-expense / mark-phase, large tap targets, offline-queued (builds on `expenseQueue`).
5. **Consistent money & status rendering** via `Money` and `StatusChip` everywhere.
6. **Calendar-sync resilience surfaced** — failed GCal pushes (`gcal_event_id IS NULL`) appear in Today's "Needs you" with a retry (closes README gap).

---

## 7. Technical approach (clean, incremental, backend-safe)

- **Presentation-only.** No changes to Supabase schema, queries, server actions, PDF generation, auth, or i18n keys (we add keys, don't break them). This is a UI-layer rebuild.
- **Token migration is the unlock.** Define semantic tokens → map Tailwind → delete the `.dark` override block. Do this once, early.
- **Strangler pattern.** Build the `ui/` kit, then migrate screen-by-screen behind the new shell. The app stays runnable at every step; no big-bang branch that's broken for weeks.
- **i18n preserved.** `next-intl` keys are reused; new screens add new keys in `en.json`/`id.json`.
- **Accessibility kept/raised.** The current code has good focus-visible discipline — the kit bakes that in (focus rings, ARIA, contrast AA on tokens).

---

## 8. Execution phases & sequencing

| Phase | Deliverable | Status |
|---|---|---|
| **1. Direction proof** | Token system + core kit (Button/Card/Badge/Table/Field) + **`/today` redesigned end-to-end**, light + dark, desktop + mobile. | ✅ **Done** |
| **2. Shell** | Desktop cockpit chrome ✅ · flat nav + SectionTabs ✅ · mobile field-mode bottom-tabs ✅ · ⌘K command-bar promotion ⬜ · right-rail pattern ⬜ | 🟡 **Mostly done** |
| **3. Pipeline** | Funnel board ✅ + drag-to-advance (desktop + touch) ✅ · unified Deal detail ⬜ | 🟡 **Mostly done** |
| **4. Jobs + Calendar** | Screens migrated visually ✅ · List/Board/Calendar view toggle ⬜ · field-mode job/expense/timeline ⬜ | 🟡 **Partial** (visual only) |
| **5. Money** | Invoices/reports migrated visually ✅ · unified "Money" area ⬜ | 🟡 **Partial** (visual only) |
| **6. Directory + Settings + Estimation + Survey + Login** | All remaining screens on the kit. | ✅ **Done** (visual); Directory nav grouping ⬜ |
| **7. Polish** | Remove legacy dark-override block · motion · a11y/keyboard DnD · dark-mode QA · reports metric gaps. | ⬜ **Not started** |

Each phase ends with the app fully working and a screenshot walkthrough.

### Suggested next order
1. **Finish nav IA consolidation** (Money + Directory groups) — small, makes the structure match the vision.
2. **Phase 2 — mobile field-mode bottom-tabs + ⌘K command-bar promotion** (the "both devices first-class" promise).
3. **Pipeline mobile touch-drag** + unified Deal detail.
4. **Phase 4/5 features** — Jobs view toggle, Money area.
5. **Phase 7 polish** — delete the TEMPORARY override block first (now safe), then motion/a11y/QA.

---

## 9. Open decisions for you

1. **Brand color:** Cobalt (proposed) vs. near-black+amber vs. deep teal. I'll mock `/today` in cobalt first regardless; easy to repaint via tokens.
2. **Nav consolidation:** OK to merge Leads+Proposals → Pipeline, Invoices+Reports → Money, Customers/Vendors/Crew → Directory? (Routes stay backward-compatible.)
3. **"Today" vs "Dashboard":** comfortable renaming the home to an action-triage surface?
4. **Field mode trigger:** viewport-based (phone = field mode) — or also a manual toggle / role flag?
5. **Light vs dark default chrome:** proposed light shell with first-class dark. Confirm light as default.

Once you green-light §8 Phase 1 (and answer §9), I build the token system + kit + the redesigned `/today` and show it to you running, before touching anything else.
