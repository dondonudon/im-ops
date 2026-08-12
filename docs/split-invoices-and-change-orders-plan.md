# Plan: Split invoices (master + termin children) + job change-orders

> **Status:** design complete, not yet built. This document is written to be executed by an
> agent with no prior context. Every file:line and SQL snippet below was verified against the
> repo on **2026-08-10** (schema = `supabase/migrations/001_consolidated_schema.sql`; app =
> current `main`). Re-verify line numbers before editing — they drift.

---

## 0. Goal (confirmed with product owner)

Two composable features:

1. **Structured invoice splitting — payable MASTER + termin CHILDREN.** A job may have one
   **master invoice** (the grand total; `parent_invoice_id IS NULL`) plus N **child invoices**
   (DP / Pelunasan / termin; `parent_invoice_id = master.id`). Master and children
   **intentionally overlap** (master total = Σ children). The master is a **real payable
   ledger record** whose `paid_amount` **rolls up** from its children — it is never paid
   directly once it has children. Splits are arbitrary N, user-defined amounts + labels.
2. **Job change-orders.** `jobs.revenue` becomes a **derived** total = `base_revenue + Σ
   adjustments`, so mid-job scope changes (e.g. +1M overtime on a 5M job) grow the
   revenue-of-record auditably. The **job is the revenue anchor, not the invoice** (cash jobs
   never get an invoice yet still earn revenue).

**Agreed behaviours:**
- Σ(children.total_amount) *should* equal the master total; a mismatch is **warn-but-allow**
  (handles staged billing / a termin not yet cut).
- Payments attach to **leaf** invoices (a child when children exist, else the master). A DP
  recorded **before any invoice exists** stays job-level (`payments.invoice_id = NULL`) and can
  be **reassigned** to a termin later — **reassignment is IN v1** (the DP-invoice flow needs it).
- Money is `BIGINT` IDR, no decimals (CLAUDE.md invariant). Never `FLOAT`/`DECIMAL`.

---

## 1. Verified current state (do not trust from memory — re-confirm)

### Schema — all in `supabase/migrations/001_consolidated_schema.sql`
| Object | Lines | Key facts |
|---|---|---|
| `invoices` table | 195–211 | `job_id UUID REFERENCES jobs(id) ON DELETE RESTRICT UNIQUE` (inline → constraint name **`invoices_job_id_key`**); `total_amount BIGINT NOT NULL`; `paid_amount BIGINT NOT NULL DEFAULT 0`; `status TEXT DEFAULT 'sent' CHECK (status IN ('sent','partially_paid','paid','overdue','cancelled'))`; `due_date DATE`, `notes`, `pdf_url`, `verification_token`, `created_at`. |
| `payments` table | 213–225 | `job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT`; `amount BIGINT NOT NULL CHECK (amount > 0)`; `payment_type TEXT CHECK IN ('down_payment','partial','final','refund')`; `method TEXT CHECK IN ('cash','transfer')`; `paid_at DATE NOT NULL DEFAULT CURRENT_DATE`. **No `invoice_id`.** |
| `jobs` table | 127–141 | `revenue BIGINT NOT NULL` (no default); `status TEXT DEFAULT 'scheduled' CHECK IN ('scheduled','cancelled')`. |
| `job_timeline` table | 227–234 | `job_id`, `occurred_at TIMESTAMPTZ DEFAULT now()`, `event_type TEXT NOT NULL`, `notes TEXT`, `logged_by UUID REFERENCES auth.users(id)`. |
| `update_invoice_status()` | 463–498 | Sums **all job payments** (`WHERE job_id = target_job_id`, refunds subtracted) and writes the **single** invoice for that job. Sets only `paid`/`partially_paid`/`sent` — never `overdue` (overdue is derived at read time). `SECURITY DEFINER`. |
| trigger `after_payment_insert` | 635–638 | `AFTER INSERT OR UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION update_invoice_status()`. (Name is misleading; covers all 3 events.) |
| `generate_invoice_number()` | 412–438 | `LOCK TABLE invoices`; monthly sequence → `INV/YYYY/{ROMAN_MONTH}/{NNN}`. Each invoice (master or child) will draw its own number. |
| view `job_profit_summary` | 269–282 | `cash_received = COALESCE(i.paid_amount,0)` via `LEFT JOIN invoices i ON i.job_id = j.id` → **double-counts** with master+children. |
| view `invoice_outstanding` | 284–297 | Per-invoice `effective_status` (derives `overdue`). AR builds on this. |
| view `job_outstanding` | 334–360 | `paid` from a `LATERAL` sum over `payments` (job-level, fine); but `invoice_overdue` from `LEFT JOIN invoices i ON i.job_id = j.id` → **fan-out** (job appears N times). |
| `get_ar_totals()` | 517–554 | Reads `invoice_outstanding WHERE effective_status != 'cancelled'`. Inherits any fix to that view. |
| `get_invoice_status_breakdown()` | 556–575 | Reads `invoices` directly, `WHERE status != 'cancelled'`. |
| RLS | 649–693 | Every table: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + a policy `authenticated_all_<tbl>` (`FOR ALL TO authenticated USING (true) WITH CHECK (true)`) created by a `DO`-loop over a `tables TEXT[]` array (672–677). |

Migration files present: `001`–`005`. **Next number is `006`.** Header style = boxed `-- ===`
banner; all DDL uses `IF NOT EXISTS`; note in-file that Supabase SQL Editor runs single-statement.

### App — writers of `jobs.revenue` (only two)
- `src/components/proposals/ProposalActionPanel.tsx:540–553` — job `.insert({...})`; sets
  `revenue: revenue` at **line 550** (`revenue` prop declared line 510). **Must become
  `base_revenue: revenue`** (drop the `revenue` key).
- `src/app/(dashboard)/jobs/[id]/edit/page.tsx:120–137` — `"use client"`; job `.update({...})`
  writes `revenue: revenueNum ?? 0` at **line 134**. Field is a `NumericInput` at **358–366**,
  form state `revenue` (init line 45, load line 99). **Must write `base_revenue`; relabel field.**

### App — invoice/payment consumers
| File:line | Now | Under multi-invoice |
|---|---|---|
| `jobs/[id]/page.tsx:107–111` | `.from("invoices").select("id, invoice_number, status, total_amount, paid_amount").eq("job_id", id).maybeSingle()` | **HARD BREAK** — `.maybeSingle()` throws on >1 row. |
| `jobs/[id]/page.tsx:112–116` | payments `.eq("job_id", id).order("paid_at")` | OK (job-level history). |
| `jobs/[id]/page.tsx:459–493` | Invoice card: renders single `invoice` or `<GenerateInvoiceButton jobId jobRevenue={job.revenue} />` (491) | Rework to list + master/children. |
| `jobs/[id]/page.tsx:495–515` | `<PaymentsPanel totalAmount={invoice?.total_amount ?? job.revenue} invoiceStatus={invoice?.status ?? null} .../>` (502/504) | Smart-target recorder (§5.3.1): auto-target 1 leaf, picker for 2+, job-level for 0. |
| `jobs/[id]/expenses/page.tsx:21` | `.from("invoices").select("status").eq("job_id", id).maybeSingle()` (lock at line 28 `invoice?.status === "paid"`) | **HARD BREAK** — list fetch + derive. |
| `invoices/[id]/page.tsx:18–30` | invoice `.select("*, jobs(..., payments(...)))").eq("id", id).single()` — payments come from **`jobs.payments`** (ALL job payments), filtered/sorted in JS at 91–93 | Load **this invoice's** payments (`invoice_id = id`) + children if master. |
| `invoices/[id]/page.tsx:214–228` | `<PaymentsPanel jobId={invoice.job_id} totalAmount={invoice.total_amount} .../>` | Pass `invoiceId={invoice.id}`; master view = read-only rollup. |
| `invoices/page.tsx:46–62` | list `.from("invoices").select("... jobs(job_number, proposals(leads(customers(name))))", {count})` | Works; add `label` + parent indicator. |
| `invoices/page.tsx:88–95` | columns: invoiceNumber, customer, total, paid, dueDate, status | Add label/role. |
| `PaymentsPanel.tsx:26–33` | header comment "Payments are FK'd to jobs (not invoices)" | Update comment. |
| `PaymentsPanel.tsx:34–57` | props — **no `invoiceId`** | Add optional `invoiceId?: string`. |
| `PaymentsPanel.tsx:97–108` | insert sets `job_id` only | Also set `invoice_id: invoiceId ?? null`. |
| `GenerateInvoiceButton.tsx:32–51` | RPC `generate_invoice_number` → insert `{job_id, invoice_number, total_amount: jobRevenue, paid_amount:0, status:"sent"}` | Reuse for master + children (add `parent_invoice_id`, `label`, custom `total_amount`). |
| `InvoicePDF.tsx:117–154` | props `invoice:{invoice_number,total_amount,notes,created_at}` — no `paid_amount`, no line items | Add optional `label`, `parentNumber`. |
| `money/page.tsx:64` | `rpc("get_ar_totals").single()` | Fixed via view. |
| `money/page.tsx:65` | `rpc("get_invoice_status_breakdown")` | Fixed via fn filter. |
| `money/page.tsx:74–80` | recent payments embed `jobs(job_number, invoices(invoice_number))` (to-many) | Repoint to payment's own `invoice_id → invoices(invoice_number,label)`. |
| `reports/page.tsx:85–90` + JS `204–221` | AR aging queries the **raw `invoices` table** (`.select("invoice_number,total_amount,paid_amount,due_date,status").in("status",['sent','partially_paid','overdue']).limit(500)`) and buckets by due_date in JS | **Not covered by the view fix** — will double-count master+children. Repoint to the leaf-filtered `invoice_outstanding` view (see §5.4). |
| `reports/page.tsx:132–136` | `job_profit_summary` (job-level revenue) | Fixed via view. |
| `today/page.tsx:100/102–107/113–117` | `get_ar_totals`, `invoice_outstanding`, `job_outstanding` | Fixed via views/fn. |
| `CommandPalette.tsx:675–680` | invoice search by number | OK. |

All **readers** of `jobs.revenue` (`customers/[id]:133`, `today:417/421`, `money:101`,
`jobs:232/…`, `jobs/[id]:160`, `reports:*`, `gcal/actions.ts:172`) are display/aggregation only
and unaffected — `revenue` stays populated (now by trigger).

### Conventions to match
- **UI kit** (`src/components/ui/index.ts`): `Button{variant,size,loading}`,
  `Field{label,htmlFor,required,hint,error}`, `Input`, `Select`, `Textarea`, `FormError`,
  `Money{value,tone}`, `Badge{tone: neutral|info|positive|pending|danger, dot}`, `Card`,
  `CardHeader{title,action}`, and table primitives **`Table, THead, TH, TBody, TR, TD`** (NOT
  `TableRow`/`TableCell`). `buttonStyles(...)` for link-as-button.
- **Currency input**: `src/components/shared/NumericInput.tsx` — `{ value:number,
  onChange:(v:number)=>void }`, renders id-ID separators, needs the full control `className`
  (the shared `controlBase` string from `src/components/ui/Form.tsx:3–4`). Form state stores the
  amount as a **string**; pass `value={Number(form.x)||0}`; guard `const n = Number(form.x); if
  (!n || n <= 0) …`.
- **Client write panel** (mirror `PaymentsPanel.tsx`): `"use client"`; `createClient` from
  `@/lib/supabase/client` **inside the handler**; `useState` for `saving`/`error`;
  `useTransition`; `.insert({...}).select("...").single()`; `if (insertErr) throw insertErr`;
  optimistic local state update; `startTransition(() => router.refresh())`; `catch (err:
  unknown) { setError(err instanceof Error ? err.message : "Error") }`; `finally {
  setSaving(false) }`. Submit `<Button loading={saving} disabled={saving || isPending}>`.
- **Timeline logging**: `const { data:{ user } } = await supabase.auth.getUser();` then
  `.from("job_timeline").insert({ job_id, event_type, notes, logged_by: user?.id ?? null })`
  (`occurred_at` defaults server-side).
- **i18n**: add keys to BOTH `src/messages/id.json` and `src/messages/en.json` (must stay
  key-identical). Namespaces: `money`, `pages.invoices` (+ `.invoiceDetail`), `forms.payment`,
  `panels.payments`, and a NEW `panels.adjustments`. lowerCamelCase keys; enum-like values use
  snake_case matching DB.
- **Types regen**: run `supabase gen types` after migrations (no npm script exists). View columns
  come back nullable — narrow at call sites.
- **Tests**: `vitest` (`vitest.config.ts`, node env, `@`→`./src`). `import { describe, expect,
  it } from "vitest";` Pure helpers only, in `src/lib/`, tested in `src/lib/__tests__/`.

---

## 2. Target data model

```
jobs
  base_revenue BIGINT NOT NULL DEFAULT 0     -- contracted amount (set by app)
  revenue      BIGINT NOT NULL               -- DERIVED = base_revenue + Σ adjustments (trigger)

job_adjustments (NEW)
  id, job_id→jobs (RESTRICT), amount BIGINT (signed), reason TEXT NOT NULL,
  adjusted_at DATE, created_by→auth.users, created_at

invoices
  + parent_invoice_id UUID→invoices (RESTRICT)  -- NULL = master or standalone
  + label TEXT                                  -- "DP", "Termin 2", "Pelunasan"
  (job_id UNIQUE dropped)

payments
  + invoice_id UUID→invoices (RESTRICT, nullable)  -- NULL = job-level DP, not yet on a termin
```

Invariants enforced by triggers/guards:
- `jobs.revenue` is always `base_revenue + Σ job_adjustments.amount`.
- A leaf invoice's `paid_amount = Σ its own payments` (refunds subtracted). A master's
  `paid_amount = Σ children.paid_amount + Σ its own direct payments` (the second term is normally
  0; it stays non-zero only for a standalone invoice that was split *after* taking payments — see
  §7 edge case — so money is never lost).
- Payments may only attach to a **leaf** invoice (DB guard rejects attaching to a master with
  children).

---

## 3. Migration `006_job_adjustments.sql` (full)

```sql
-- ============================================================
-- 006 — Job change-orders (derived job revenue)
-- ============================================================
-- jobs.revenue becomes DERIVED = base_revenue + Σ job_adjustments.amount, maintained
-- by triggers, so every existing reader of jobs.revenue is unaffected. Adjustments
-- capture mid-job scope changes (e.g. +1M overtime) auditably, without mutating the
-- base contracted amount. Supabase SQL Editor runs single-statement — run in order.

-- 1. base_revenue (backfill from current revenue, then lock down)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS base_revenue BIGINT;
UPDATE jobs SET base_revenue = revenue WHERE base_revenue IS NULL;
ALTER TABLE jobs ALTER COLUMN base_revenue SET DEFAULT 0;
ALTER TABLE jobs ALTER COLUMN base_revenue SET NOT NULL;

-- 2. job_adjustments (amount is SIGNED — no >0 check, unlike payments)
CREATE TABLE IF NOT EXISTS job_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  amount      BIGINT NOT NULL,
  reason      TEXT NOT NULL,
  adjusted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_adjustments_job_id ON job_adjustments (job_id);

-- 3. RLS (same single-org authenticated policy as every table)
ALTER TABLE job_adjustments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='job_adjustments'
      AND policyname='authenticated_all_job_adjustments'
  ) THEN
    CREATE POLICY "authenticated_all_job_adjustments"
      ON job_adjustments FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. recompute jobs.revenue when adjustments change
CREATE OR REPLACE FUNCTION recompute_job_revenue()
RETURNS TRIGGER AS $$
DECLARE target UUID;
BEGIN
  target := COALESCE(NEW.job_id, OLD.job_id);
  UPDATE jobs j
  SET revenue = j.base_revenue
      + COALESCE((SELECT SUM(amount) FROM job_adjustments WHERE job_id = target), 0)
  WHERE j.id = target;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS after_job_adjustment_change ON job_adjustments;
CREATE TRIGGER after_job_adjustment_change
  AFTER INSERT OR UPDATE OR DELETE ON job_adjustments
  FOR EACH ROW EXECUTE FUNCTION recompute_job_revenue();

-- 5. derive revenue on job INSERT and on base_revenue change (BEFORE → sets NEW.revenue).
--    Fires only on base_revenue writes, so the adjustments trigger (which writes revenue
--    directly) does NOT re-fire this → no loop. On INSERT, NEW.id already has its DEFAULT.
CREATE OR REPLACE FUNCTION set_job_revenue_from_base()
RETURNS TRIGGER AS $$
BEGIN
  NEW.revenue := NEW.base_revenue
    + COALESCE((SELECT SUM(amount) FROM job_adjustments WHERE job_id = NEW.id), 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS before_job_set_revenue ON jobs;
CREATE TRIGGER before_job_set_revenue
  BEFORE INSERT OR UPDATE OF base_revenue ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_job_revenue_from_base();
```

> **Sequencing note:** after this migration, the app’s two revenue writers (§5.1) MUST write
> `base_revenue`. Until they’re updated, a newly created job writes `revenue` directly, which the
> `BEFORE` trigger does not touch (it only fires on `base_revenue`) → `base_revenue` stays at its
> `DEFAULT 0` and the first adjustment recomputes `revenue = 0 + Σadj`, wiping the contracted
> amount. **Ship the migration and the writer fixes together.**

> **Trigger safety (verified 2026-08-12):** the whole schema has only two triggers —
> `after_payment_insert` (payments) and `trg_close_proposals_on_lead_lost` (leads). **There are NO
> triggers on `jobs`.** So `before_job_set_revenue` and the `recompute_job_revenue` `UPDATE jobs SET
> revenue …` cannot collide with or recurse through any existing trigger. Lead "converted" status is
> maintained in app code, not a DB trigger. If you add a `jobs` trigger later, re-check this.

---

## 4. Migration `007_split_invoices.sql` (full)

```sql
-- ============================================================
-- 007 — Split invoices (payable master + termin children)
-- ============================================================
-- A job may have one master invoice (grand total, parent_invoice_id IS NULL) plus N
-- child termin (parent_invoice_id = master.id). Payments attach to LEAF invoices;
-- master.paid_amount rolls up from children (+ any direct payments). Views/AR de-dup
-- so a master and its children are never counted together. Run each statement in order.

-- 1. allow many invoices per job (drop the one-per-job UNIQUE; keep FK + plain index)
--    Inline column UNIQUE → auto-named 'invoices_job_id_key'. Verify with \d invoices if it errors.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_job_id_key;

-- 2. hierarchy + label
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS label TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_parent_id ON invoices (parent_invoice_id) WHERE parent_invoice_id IS NOT NULL;

-- 2a. enforce AT MOST ONE top-level invoice (master or standalone) per job — the dropped
--     job_id UNIQUE otherwise leaves nothing stopping two masters. Satisfiable now (data is
--     strictly 1:1). Excludes 'cancelled' so a job can be re-invoiced after a future cancel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_toplevel_per_job
  ON invoices (job_id)
  WHERE parent_invoice_id IS NULL AND status <> 'cancelled';

-- 3. payments → invoice link (nullable; RESTRICT so recorded money can't be orphaned by a delete)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments (invoice_id) WHERE invoice_id IS NOT NULL;

-- 3a. backfill: each existing payment → its job's lone invoice (currently strictly 1:1)
UPDATE payments p
SET invoice_id = i.id
FROM invoices i
WHERE i.job_id = p.job_id AND p.invoice_id IS NULL;

-- 4. per-invoice paid/status recompute + one-level parent rollup (robust: master keeps its
--    own direct payments AND children's, so splitting a paid invoice never loses money)
CREATE OR REPLACE FUNCTION recompute_invoice_paid(inv_id UUID)
RETURNS VOID AS $$
DECLARE
  inv         invoices%ROWTYPE;
  child_paid  BIGINT;
  direct_paid BIGINT;
  new_paid    BIGINT;
BEGIN
  IF inv_id IS NULL THEN RETURN; END IF;
  SELECT * INTO inv FROM invoices WHERE id = inv_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(paid_amount), 0) INTO child_paid
  FROM invoices WHERE parent_invoice_id = inv_id;

  SELECT COALESCE(SUM(CASE WHEN payment_type = 'refund' THEN -amount ELSE amount END), 0)
  INTO direct_paid
  FROM payments WHERE invoice_id = inv_id;

  new_paid := child_paid + direct_paid;

  UPDATE invoices
  SET paid_amount = new_paid,
      status = CASE
        WHEN status = 'cancelled'          THEN 'cancelled'
        WHEN new_paid >= total_amount      THEN 'paid'
        WHEN new_paid > 0                  THEN 'partially_paid'
        ELSE 'sent'
      END
  WHERE id = inv_id;

  IF inv.parent_invoice_id IS NOT NULL THEN
    PERFORM recompute_invoice_paid(inv.parent_invoice_id);  -- depth 1 (no grandchildren)
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 5. rewrite the payment trigger fn to recompute the affected invoice(s). The existing
--    trigger 'after_payment_insert' (AFTER INS/UPD/DEL on payments) already calls this fn —
--    leave the CREATE TRIGGER alone.
CREATE OR REPLACE FUNCTION update_invoice_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recompute_invoice_paid(NEW.invoice_id);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM recompute_invoice_paid(NEW.invoice_id);
    IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      PERFORM recompute_invoice_paid(OLD.invoice_id);   -- reassignment: fix the old target too
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recompute_invoice_paid(OLD.invoice_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- 6. guard: a payment may only attach to a LEAF invoice (never a master that has children)
CREATE OR REPLACE FUNCTION assert_payment_on_leaf_invoice()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM invoices c WHERE c.parent_invoice_id = NEW.invoice_id) THEN
    RAISE EXCEPTION 'Payment cannot attach to master invoice % (it has children). Attach to a child termin.', NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS before_payment_leaf_check ON payments;
CREATE TRIGGER before_payment_leaf_check
  BEFORE INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION assert_payment_on_leaf_invoice();

-- 7. fix job_profit_summary: derive cash_received from PAYMENTS (not i.paid_amount) so a
--    master+children job counts each payment exactly once.
CREATE OR REPLACE VIEW job_profit_summary
WITH (security_invoker = true) AS
SELECT
  j.id AS job_id,
  j.job_number,
  j.revenue,
  j.status,
  COALESCE(SUM(e.amount), 0)::BIGINT AS actual_spend,
  (j.revenue - COALESCE(SUM(e.amount), 0))::BIGINT AS current_profit,
  COALESCE(pay.paid, 0)::BIGINT AS cash_received
FROM jobs j
LEFT JOIN expenses e ON e.job_id = j.id
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END) AS paid
  FROM payments p WHERE p.job_id = j.id
) pay ON true
GROUP BY j.id, pay.paid;

-- 8. fix job_outstanding: drop the fan-out LEFT JOIN invoices; compute invoice_overdue from
--    a leaf-only subquery so a multi-invoice job appears exactly once.
CREATE OR REPLACE VIEW job_outstanding
WITH (security_invoker = true) AS
SELECT
  j.id,
  j.job_number,
  j.move_date,
  j.revenue,
  c.name AS customer_name,
  COALESCE(pay.paid, 0)::BIGINT AS paid,
  (j.revenue - COALESCE(pay.paid, 0))::BIGINT AS outstanding,
  (COALESCE(pay.paid, 0) > 0) AS partial,
  COALESCE((
    SELECT bool_or(i.due_date < CURRENT_DATE AND i.status NOT IN ('paid','cancelled'))
    FROM invoices i
    WHERE i.job_id = j.id
      AND NOT EXISTS (SELECT 1 FROM invoices ch WHERE ch.parent_invoice_id = i.id)  -- leaves only
  ), false) AS invoice_overdue
FROM jobs j
LEFT JOIN proposals pr ON pr.id = j.proposal_id
LEFT JOIN leads     l  ON l.id  = pr.lead_id
LEFT JOIN customers c  ON c.id  = l.customer_id
LEFT JOIN LATERAL (
  SELECT SUM(CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END) AS paid
  FROM payments p WHERE p.job_id = j.id
) pay ON true
WHERE j.status = 'scheduled'
  AND (j.revenue - COALESCE(pay.paid, 0)) > 0;

-- 9. fix invoice_outstanding: exclude masters-that-have-children (leaves + standalone only) so
--    AR (get_ar_totals reads this) never counts a master on top of its termin.
CREATE OR REPLACE VIEW invoice_outstanding
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.invoice_number,
  i.total_amount,
  i.paid_amount AS paid,
  (i.total_amount - i.paid_amount) AS outstanding,
  i.due_date,
  CASE
    WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('paid','cancelled') THEN 'overdue'
    ELSE i.status
  END AS effective_status
FROM invoices i
WHERE NOT EXISTS (SELECT 1 FROM invoices ch WHERE ch.parent_invoice_id = i.id);

-- 10. fix get_invoice_status_breakdown: same leaf-only filter.
CREATE OR REPLACE FUNCTION get_invoice_status_breakdown()
RETURNS TABLE(status TEXT, inv_count BIGINT, total_amount BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  SELECT
    CASE
      WHEN due_date < CURRENT_DATE AND status NOT IN ('paid','cancelled') THEN 'overdue'
      ELSE status
    END AS status,
    COUNT(*) AS inv_count,
    SUM(total_amount)::BIGINT AS total_amount
  FROM invoices i
  WHERE status != 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM invoices ch WHERE ch.parent_invoice_id = i.id)
  GROUP BY 1;
$$;
```

> `get_ar_totals()` needs **no edit** — it reads `invoice_outstanding`, which is now leaf-filtered.

**Post-migration DB sanity (run in SQL editor):**
```sql
SELECT count(*) FROM jobs WHERE base_revenue <> revenue;                 -- expect 0
SELECT count(*) FROM payments p JOIN invoices i ON i.job_id = p.job_id
  WHERE p.invoice_id IS NULL;                                            -- expect 0 (all backfilled)
SELECT job_id FROM invoices WHERE parent_invoice_id IS NULL AND status <> 'cancelled'
  GROUP BY job_id HAVING count(*) > 1;                                   -- expect 0 rows (one top-level/job)
-- spot-check: no invoice's paid_amount/status changed vs a pre-migration snapshot
```

---

## 5. App changes

### 5.1 Revenue writers → `base_revenue` (do WITH migration 006)
- `ProposalActionPanel.tsx:550` — change `revenue: revenue,` to `base_revenue: revenue,`
  (remove the `revenue` key entirely; the trigger derives it).
- `jobs/[id]/edit/page.tsx:134` — change `revenue: revenueNum ?? 0,` to
  `base_revenue: revenueNum ?? 0,`. Load from `data.base_revenue` (line 99) instead of
  `data.revenue`. Relabel the field (line 359) to a new i18n key `forms.job.contractedAmount`
  ("Contracted amount" / "Jumlah kontrak"). Keep the `NumericInput` as-is.

### 5.2 Part-A adjustments UI
- New client component `src/components/jobs/JobAdjustmentsPanel.tsx` (mirror the PaymentsPanel
  template in §1 "Conventions"). Props: `{ jobId: string; baseRevenue: number; adjustments:
  Adjustment[] }`. Renders: contracted amount, each adjustment line (amount signed via `Money`
  tone, reason, date), derived total = `baseRevenue + Σ`, and an "Add charge/adjustment" form
  (`NumericInput` amount that accepts negatives — see note, `Textarea` reason required).
  - **NumericInput does not accept negatives** (it strips to a positive integer). For adjustments
    add a sign toggle (Select: "Charge (+)" / "Discount (−)") and store `amount = sign *
    magnitude`, OR extend `NumericInput` with an `allowNegative` prop. Prefer the sign toggle to
    avoid touching the shared input.
  - Insert into `job_adjustments` (`{ job_id, amount, reason, adjusted_at: todayInJakarta(),
    created_by: user?.id }`) — **pass `adjusted_at` from `todayInJakarta()`**, do NOT rely on the
    DB `DEFAULT CURRENT_DATE` (server is UTC; at 1am Jakarta it reads the previous day, per the
    CLAUDE.md timezone rule). Then log to `job_timeline` (`event_type: "revenue_adjusted"`,
    `notes: "<+/-amount>: <reason>"`), then `router.refresh()`.
  - Support **deleting** an adjustment (mistake correction) via a per-row delete → `.from(
    "job_adjustments").delete().eq("id", …)`; the `after_job_adjustment_change` trigger recomputes
    `jobs.revenue` automatically. (No edit-in-place needed for v1; delete + re-add.)
  - Negative amounts render as `-Rp 1.500.000` via `Money`/`formatRupiah` (minus leads the `Rp`).
    That's acceptable; no custom negative styling needed.
  - Type: `type Adjustment = { id: string; amount: number; reason: string; adjusted_at: string }`.
- `jobs/[id]/page.tsx`: fetch the job's `base_revenue` and `job_adjustments` (new query in the
  Phase-2 `Promise.all`), render `<JobAdjustmentsPanel/>` in a "Charges & adjustments" card. The
  profit calc at line 160 keeps using `job.revenue` (derived) — no change.

### 5.3 Split-invoice UI
- **New `src/components/invoices/JobInvoicesPanel.tsx`** (replaces the single-invoice card block
  at `jobs/[id]/page.tsx:459–493`). Props: `{ jobId: string; jobRevenue: number; invoices:
  InvoiceRow[] }` where `InvoiceRow = { id: string; invoice_number: string; label: string | null;
  status: string; total_amount: number; paid_amount: number; parent_invoice_id: string | null;
  due_date: string | null }` and `invoices` is the full list for the job. Behaviour:
  - No invoices → "Create grand-total invoice" button (calls `generate_invoice_number` RPC →
    insert master `{ job_id, invoice_number, total_amount: jobRevenue, paid_amount: 0, status:
    "sent", parent_invoice_id: null, label: null }`; redirect to `/invoices/{id}`).
  - Master present → render master row (number, grand total via `Money`, rolled-up paid, status
    `Badge`, link to detail) with children indented beneath (label, total, paid, status, link).
    "Add termin" form under the master: `NumericInput` amount + `Input` label + optional
    `due_date` → `generate_invoice_number` RPC → insert child `{ job_id, invoice_number,
    total_amount, parent_invoice_id: master.id, label, due_date, status: "sent" }`.
  - Show a soft warning `Badge tone="pending"` when `Σ children.total_amount !== master.total`
    (use the pure helper `splitSumStatus`, §6). Allow proceeding.
  - Refactor the RPC+insert out of `GenerateInvoiceButton.tsx` into a shared helper so both
    "create master" and "add termin" reuse it, or keep `GenerateInvoiceButton` for the master and
    add a sibling `AddTerminButton`. Either is fine; keep inserts identical in shape.
- `jobs/[id]/page.tsx:107–111`: replace the `.maybeSingle()` invoice fetch with a **list**:
  ```ts
  supabase
    .from("invoices")
    .select("id, invoice_number, label, status, total_amount, paid_amount, parent_invoice_id, due_date")
    .eq("job_id", id)
    .order("created_at", { ascending: true }),
  ```
  Pass the list to `<JobInvoicesPanel/>`. **The singular `invoice` variable is now gone** — remove
  every reference to it on this page (the old card at 459–493, and the `invoice?.total_amount` /
  `invoice?.status` props at 502/504). Derive what the payments panel needs from the list instead.
- `jobs/[id]/page.tsx:495–515` (`PaymentsPanel`): this stays the primary recorder and keeps
  showing **all** job payments (full history). It becomes a **smart-target** recorder (the agreed
  UX — see §5.3.1). Pass it the job's payable leaf invoices; it resolves the target itself. Keep
  per-termin recording on the invoice-detail page too (§5.3, leaf view).
- **`PaymentsPanel.tsx`** — extend to support an explicit or smart target (props 34–57):
  - Add `invoiceId?: string` — a **fixed** target (used by the invoice-detail leaf view). When
    set, no picker; the insert uses it.
  - Add `leafInvoices?: { id: string; invoice_number: string; label: string | null; total_amount:
    number }[]` — **selectable** targets (used by the job page). See §5.3.1 for the resolution
    logic. If both are passed, `invoiceId` wins.
  - In the insert (97–108) add `invoice_id: <resolved target id> ?? null`. `Payment` type gains
    `invoice_id: string | null`. Update the header comment (26–33): payments are job-level but may
    carry an optional `invoice_id` linking them to a specific termin.

#### 5.3.1 Smart-target resolution (job-page recorder)
Given `leafInvoices` (the job's billable leaves — masters-that-have-children are excluded via the
`billableLeaves` helper, §6):
- **0 leaves** → record job-level: `invoice_id = NULL` (the genuine pre-invoice DP). No picker.
- **exactly 1 leaf** → auto-target it: `invoice_id = that leaf.id`. No picker; render a small
  read-only line "Applies to: {label ?? invoice_number}" so the target is visible.
- **2+ leaves** → render an "Apply to" `Select` (`@/components/ui`) listing each leaf as
  `{label} — {invoice_number}` plus a trailing **"Job-level (no invoice)"** option. Default to the
  first unpaid leaf. The chosen value drives `invoice_id`.
- `totalAmount` (the paid/outstanding comparison target) should reflect the **selected** target:
  the targeted leaf's `total_amount`, or `job.revenue` for the job-level option. Drop the old
  `invoice?.total_amount ?? job.revenue` fallback.
- The DB leaf-only guard is a backstop: `billableLeaves` already excludes masters-with-children, so
  the picker never offers an invalid target — but if it somehow did, the insert fails loudly rather
  than mis-recording.
- **`invoices/[id]/page.tsx`** rework (18–30, 91–93, 214–228):
  - Fetch the invoice with its job/customer embed (drop the nested `payments` from `jobs(...)`).
    Add `parent_invoice_id, label` to the selected columns.
  - Fetch **children**: `.from("invoices").select("id, invoice_number, label, total_amount,
    paid_amount, status, due_date").eq("parent_invoice_id", id).order("created_at")`.
  - Fetch **this invoice's payments**: `.from("payments").select("...").eq("invoice_id",
    id).order("paid_at")`.
  - Fetch **unassigned job payments** (for reassignment): `.eq("job_id",
    invoice.job_id).is("invoice_id", null)`.
  - If `children.length > 0` → **master view**: render the children breakdown + rolled-up
    paid/total; do NOT render the record-payment form. Add a `readOnly?: boolean` prop to
    `PaymentsPanel` that hides the form and the "record payment" button (it already hides the form
    when `isFullyPaid`/`cancelled` at `PaymentsPanel.tsx:156` — extend that condition), and pass
    the master's children-derived payment history (or just a read-only list). Show the split-sum
    warning.
  - Else → **leaf view**: `<PaymentsPanel invoiceId={invoice.id} totalAmount={invoice.total_amount}
    invoiceNumber={invoice.invoice_number} .../>` + a "Attach existing payment" control listing the
    unassigned job payments (each → `UPDATE payments SET invoice_id = invoice.id WHERE id = …`,
    then refresh).
  - Show `label` in the header; link a child back to its master.
- **Payment receipt** (`PaymentReceiptPDF.tsx`): already per-payment with an optional
  `invoiceNumber` slot (reference is `{jobNumber}/{seq}`). No structural change needed — just make
  sure the **leaf** `PaymentsPanel` forwards the *termin's* `invoice_number` (via its existing
  `invoiceNumber` prop → `receiptProps.invoiceNumber`) so a termin receipt prints the correct
  invoice number. Job-level DP receipts keep `invoiceNumber` null (fine).
- **`InvoicePDF.tsx`**: add optional `label` and `parentNumber` to `InvoicePDFProps.invoice` and
  render near the invoice number (e.g. `No : {invoice_number}  ·  {label}`). Master PDF = full
  grand total; child PDF = termin amount + label + "Termin dari {parentNumber}". **Also thread the
  new fields through `InvoicePDFDownloadButton.tsx`** (it forwards props to `InvoicePDF`), and
  populate `label`/`parentNumber` from the invoice detail page's fetched row.
- **`invoices/page.tsx`**: add a label/role column (89–95) and show whether a row is a master or a
  child (e.g. `Badge` "Master"/"Termin", or indent children). List already lists per-invoice.
- **`jobs/[id]/expenses/page.tsx:21`**: replace the `.maybeSingle()` with a list fetch
  `.from("invoices").select("status, parent_invoice_id").eq("job_id", id)`; derive the lock as
  "any leaf invoice is `paid`" → e.g. `const anyPaid = invoices.some(i => i.status === "paid")`.
  Keep the existing lock message.

### 5.4 Consumer fixes

**a. Reports AR aging — `reports/page.tsx:85–90` + JS `204–221` (REQUIRED, was missed).** This
query hits the **raw `invoices` table**, so the leaf-filter added to `invoice_outstanding` (§4 step
9) does NOT reach it — with master+children it would double-count AR. Repoint it to the
leaf-filtered view:
```ts
// AR aging is always current state, not month-filtered
supabase
  .from("invoice_outstanding")
  .select("outstanding, due_date")
  .gt("outstanding", 0)
  .limit(500),
```
Then simplify the bucket JS (204–221) to read `inv.outstanding` directly (drop the
`total_amount - paid_amount` recompute; keep the `due_date` bucketing unchanged). The view already
excludes cancelled and masters-with-children. Keep the `.limit(500)` caveat in mind.

**b. Money recent-payments embed — `money/page.tsx:74–80`.** Embed currently reaches invoices
through the job (to-many, ambiguous). Repoint to the payment's own invoice:
```ts
.select("id, amount, paid_at, method, invoice_id, jobs(job_number), invoices(invoice_number, label)")
```
Render `payment.invoices?.invoice_number` (falling back to job number when `invoice_id` is null).
Verify the local `Payment` type / render around line 89.

### 5.5 i18n keys (add to BOTH `src/messages/id.json` and `src/messages/en.json`, key-identical)
Interpolation uses `{name}` placeholders. Suggested values (adjust `id` wording as the operator
prefers):

| Namespace.key | id (Indonesian) | en (English) |
|---|---|---|
| `forms.job.contractedAmount` | Jumlah kontrak | Contracted amount |
| `panels.adjustments.title` | Biaya & penyesuaian | Charges & adjustments |
| `panels.adjustments.contractedAmount` | Jumlah kontrak | Contracted amount |
| `panels.adjustments.currentTotal` | Total terkini | Current total |
| `panels.adjustments.add` | + Tambah biaya/penyesuaian | + Add charge/adjustment |
| `panels.adjustments.amount` | Jumlah | Amount |
| `panels.adjustments.kind` | Jenis | Type |
| `panels.adjustments.charge` | Biaya (+) | Charge (+) |
| `panels.adjustments.discount` | Diskon (−) | Discount (−) |
| `panels.adjustments.reason` | Alasan | Reason |
| `panels.adjustments.empty` | Belum ada penyesuaian. | No adjustments yet. |
| `panels.jobInvoices.title` | Faktur | Invoices |
| `panels.jobInvoices.createMaster` | Buat faktur total | Create grand-total invoice |
| `panels.jobInvoices.addTermin` | + Tambah termin | + Add termin |
| `panels.jobInvoices.master` | Master | Master |
| `panels.jobInvoices.termin` | Termin | Termin |
| `panels.jobInvoices.labelField` | Label | Label |
| `panels.jobInvoices.dueDate` | Jatuh tempo | Due date |
| `panels.jobInvoices.sumWarning` | Jumlah termin ({sum}) ≠ total master ({total}) | Termin total ({sum}) ≠ master total ({total}) |
| `panels.payments.applyTo` | Terapkan ke | Apply to |
| `panels.payments.jobLevel` | Tingkat pekerjaan (tanpa faktur) | Job-level (no invoice) |
| `panels.payments.appliesTo` | Diterapkan ke: {target} | Applies to: {target} |
| `panels.payments.attachExisting` | Lampirkan pembayaran | Attach existing payment |
| `panels.payments.attach` | Lampirkan | Attach |
| `pages.invoiceDetail.terminBreakdown` | Rincian termin | Termin breakdown |
| `pages.invoiceDetail.childOf` | Termin dari {number} | Termin of {number} |
| `pages.invoices.columns.label` | Label | Label |
| `entity.eventType.revenue_adjusted` | Penyesuaian pendapatan | Revenue adjusted |

---

## 6. Shared pure helpers + tests

Create `src/lib/invoices.ts` (pure, no I/O) so UI and tests share the math:
```ts
export function deriveJobRevenue(baseRevenue: number, adjustments: { amount: number }[]): number
export type SplitSum = "ok" | "under" | "over";
export function splitSumStatus(childrenTotals: number[], masterTotal: number): SplitSum
export type InvoiceStatus = "sent" | "partially_paid" | "paid";
export function deriveInvoiceStatus(paid: number, total: number, cancelled?: boolean): InvoiceStatus | "cancelled"
export function rollupMasterPaid(childrenPaid: number[], directPaid: number): number
// de-dup for display/AR: given a job's invoices, return billable LEAVES (drop masters w/ children)
export function billableLeaves<T extends { id: string; parent_invoice_id: string | null }>(invoices: T[]): T[]
```
Add `src/lib/__tests__/invoices.test.ts` mirroring `utils.test.ts` style (`import { describe,
expect, it } from "vitest"`), covering: derived revenue incl. **negative** adjustments;
`splitSumStatus` at/over/under; status derivation (refund subtracts; `paid >= total` → paid; `>0`
→ partially_paid; else sent; cancelled sticks); master rollup incl. a stray direct payment;
`billableLeaves` excludes a master that has children but keeps standalone + children.

---

## 7. Edge cases & decisions
- **Splitting an already-paid standalone invoice.** Adding a first child turns a standalone into a
  master. Its existing direct payments are preserved in the rollup (`recompute_invoice_paid`
  counts `direct_paid` too), so no money is lost. **UI should still warn** and offer to reassign
  those payments onto a termin for cleanliness, but it is not correctness-critical.
- **Adjustment changes revenue but master total is stale.** When an adjustment moves `job.revenue`
  5M→6M, the master's `total_amount` is NOT auto-updated (it may have been sent/printed). Surface
  the split-sum warning; the operator edits the master total and/or adds a termin. Do not
  auto-mutate a sent invoice.
- **Invoice numbering.** Master and each child each draw their own `INV/…/NNN` from
  `generate_invoice_number()`. Accepted for v1 (label disambiguates). Shared-number-with-suffix is
  a possible follow-up.
- **Deleting invoices.** `parent_invoice_id` and `payments.invoice_id` are both `ON DELETE
  RESTRICT`: a master with children can't be deleted (delete children first), and an invoice with
  payments can't be deleted (reassign first). UI must surface these as friendly errors.
- **Overdue** remains derived (never stored) — unchanged; leaf-filtered in the AR view/fn.
- **No invoice-cancel path exists today (verified).** Nothing in `src/` ever sets
  `invoices.status = 'cancelled'` — only jobs are cancellable (`JobCancelButton`). So the
  `'cancelled'` branch in `recompute_invoice_paid` and the `status <> 'cancelled'` clause in the
  top-level unique index are **defensive/future-proofing**; a master↔child cancel cascade is out of
  v1 scope. If you add invoice-cancel later, decide then whether cancelling a child re-opens the
  master's rollup and whether cancelling a master must cascade.
- **`job_profit_summary.cash_received` has no runtime reader (verified — only a generated type at
  `types.ts:1069`).** Repointing it to a payments-based sum is therefore zero-risk to the UI; the
  change is purely for correctness of the view itself.
- **Public `/verify/[token]` route is safe as-is (verified).** It resolves per-document via the
  `verify_document_by_token` RPC and renders no totals, so child-invoice tokens "just work." One
  DB-side check for the implementer: confirm `verify_document_by_token` (a Postgres function, not
  in `src/`) resolves any invoice row by token regardless of `parent_invoice_id` — it almost
  certainly does (token is unique per invoice), but eyeball it.
- **Verification tokens on children.** Each child invoice gets its own `verification_token`
  (`DEFAULT gen_random_uuid()`), so each termin is independently verifiable — no extra work.

---

## 8. Execution order (for the implementing agent)

Solo project: build the whole thing on `main` and land it as a **single commit** — no branches, no
staged PRs. The steps below are just a build order within that one commit, not separate deliveries.

1. Write **migration `006`** (§3) and **migration `007`** (§4).
2. Apply both to the Supabase DB **together with deploying the code** — never apply `006` to the DB
   while the old writer code (which still writes `revenue`) is live, or new jobs get
   `base_revenue = 0` (the §3 sequencing warning). In a single-commit solo flow this is automatic:
   apply the migrations at the same time you ship the commit. Run the §4 post-migration sanity
   queries; snapshot `paid_amount`/`status` before and confirm unchanged after.
3. `supabase gen types` → regenerate `src/lib/supabase/types.ts`. Narrow new nullable view columns
   at call sites as needed.
4. `src/lib/invoices.ts` + tests (§6).
5. §5.1 writer fixes; then UI: `JobAdjustmentsPanel`, `JobInvoicesPanel` / `AddTerminButton`,
   `PaymentsPanel` `invoiceId`/`leafInvoices`/`readOnly`, invoice detail rework, expenses fix,
   `InvoicePDF` + `InvoicePDFDownloadButton` label, invoice list label, reports + money fixes
   (§5.2–5.4).
6. i18n keys in both `id.json` + `en.json` (§5.5).
7. `npm run check:fix` → `tsc --noEmit` → `npm test` → `npm run build` (CI runs exactly this order),
   then commit to `main`.

## 9. Manual verification (via `/run`)
- **Create-path regression:** convert a fresh proposal → job; new job's contracted amount =
  `proposal.final_price` and `base_revenue = revenue`. Add a +1M adjustment → contracted amount is
  NOT wiped; job total shows 6M on job/today/money/reports.
- Create grand-total (master) invoice → add DP 1.8M + Pelunasan 4.2M children; sum-warning quiet at
  6M, warns if off.
- **Smart target:** on a job with ONE invoice, the job-page recorder shows "Applies to: …" and
  auto-targets it (no picker). After splitting into DP + Pelunasan, the recorder shows an "Apply to"
  picker with both termin + a "Job-level (no invoice)" option.
- Record a payment on the **DP child** (via the picker or its invoice page) → only DP flips
  partially_paid/paid; Pelunasan untouched; **master paid rolls up**; master shows no record-form.
  Job-level outstanding drops.
- Record a **job-level DP** (no invoice) on the job page → `invoice_id` NULL, shows in job history,
  counts in `job_outstanding`. Then create the DP invoice → **attach** the payment → DP + master
  reflect it.
- **Attempt to record a payment on a master that has children → blocked** by the DB guard (friendly
  UI error).
- **De-dup:** `/today` "Needs you" shows the job **once**; `money` AR + **`reports` AR aging**
  (now reading `invoice_outstanding`) count the termin, NOT the master on top;
  `job_profit_summary.cash_received` equals total job payments.
- **One-master guard:** attempt to create a second grand-total invoice for a job that already has
  one → blocked by `idx_invoices_one_toplevel_per_job` (surface as a friendly UI error).
- Open the job's **expenses page** on a multi-invoice job — loads (no `.maybeSingle()` error); lock
  engages when any leaf invoice is paid.
- Download master PDF (full grand total) and a child PDF (label + termin amount + master ref).

---

## 10. File manifest (hand-off checklist)

**Create:**
- [ ] `supabase/migrations/006_job_adjustments.sql` (§3)
- [ ] `supabase/migrations/007_split_invoices.sql` (§4)
- [ ] `src/lib/invoices.ts` (§6)
- [ ] `src/lib/__tests__/invoices.test.ts` (§6)
- [ ] `src/components/jobs/JobAdjustmentsPanel.tsx` (§5.2)
- [ ] `src/components/invoices/JobInvoicesPanel.tsx` (§5.3)
- [ ] *(optional)* `src/components/invoices/AddTerminButton.tsx` (§5.3 — or inline in JobInvoicesPanel)

**Modify:**
- [ ] `src/lib/supabase/types.ts` — regen via `supabase gen types` (§1 conventions)
- [ ] `src/components/proposals/ProposalActionPanel.tsx` — `revenue:` → `base_revenue:` (§5.1)
- [ ] `src/app/(dashboard)/jobs/[id]/edit/page.tsx` — write/load `base_revenue`, relabel (§5.1)
- [ ] `src/app/(dashboard)/jobs/[id]/page.tsx` — invoice list fetch, `JobInvoicesPanel`, `JobAdjustmentsPanel`, smart-target `PaymentsPanel`, remove singular `invoice` refs (§5.2/§5.3)
- [ ] `src/app/(dashboard)/jobs/[id]/expenses/page.tsx` — list fetch + derive lock (§5.3)
- [ ] `src/app/(dashboard)/invoices/[id]/page.tsx` — master/leaf views, per-invoice payments, reassignment (§5.3)
- [ ] `src/app/(dashboard)/invoices/page.tsx` — label/role column (§5.3)
- [ ] `src/components/invoices/PaymentsPanel.tsx` — `invoiceId` / `leafInvoices` / `readOnly` props + `invoice_id` on insert (§5.3, §5.3.1)
- [ ] `src/components/invoices/GenerateInvoiceButton.tsx` — reuse for master (+ shared create helper) (§5.3)
- [ ] `src/components/invoices/InvoicePDF.tsx` + `InvoicePDFDownloadButton.tsx` — `label`/`parentNumber` (§5.3)
- [ ] `src/app/(dashboard)/money/page.tsx` — recent-payments embed via `invoice_id` (§5.4b)
- [ ] `src/app/(dashboard)/reports/page.tsx` — AR aging reads `invoice_outstanding` (§5.4a)
- [ ] `src/messages/id.json` + `src/messages/en.json` — keys from §5.5

**Definition of done:** every §10 box checked; §4 post-migration sanity queries pass; §6 tests
green; `tsc --noEmit` + `biome check .` + `vitest run` + `next build` all pass; §9 manual scenarios
verified in the running app. Two things explicitly **out of v1 scope**: invoice-cancel (and its
master↔child cascade), and edit-in-place of an adjustment (delete + re-add instead).
