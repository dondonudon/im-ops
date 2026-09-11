# RBAC Implementation Plan

## Context
IM Ops currently has a flat auth model: any Google OAuth user sees and can mutate everything.
The org needs three distinct roles — **dev** (full access + RBAC admin), **admin** (full access minus RBAC), **crew** (scoped to their assigned jobs, no pricing or customer PII; read-only except they may upload job photos).
This is the single biggest structural change to the codebase; touches the DB schema, all RLS policies, middleware, navigation, data layer, and adds a new UI surface.

---

## Key Decisions (confirmed with user)
- Crew authenticate via Google OAuth (same as staff)
- Crew may **upload photos** to jobs they're assigned to (their only write capability)
- Field filtering via Postgres views (not app-layer)
- RBAC menu capabilities: assign roles, link crew records, invite users, audit log
- `pending_invites` is a whitelist — unknown Google accounts are rejected at the auth callback

---

## Design decisions in this revision (read before implementing)

This plan was revised to close correctness/security holes found in review. The important ones:

1. **Role is resolved via a `SECURITY DEFINER` DB lookup, not a raw table read in policies.** Keeps a single source of truth (`user_profiles.role`) and avoids RLS recursion. We deliberately did **not** move role into the JWT: for a single small org the extra machinery (app_metadata sync / access-token hook, existing-user claim backfill, role-change staleness) isn't worth it. JWT-carried role is documented as optional future work at the end.
2. **Crew never gets base-table access to anything containing money or PII.** `jobs` (has `revenue`) and `customers` (has `phone`) are **staff-only at the table level**. Crew reads them exclusively through a **self-scoped, security-definer view** that projects only safe columns. This is the "field filtering via views" decision, done so a crew user cannot bypass the view by querying the base table directly.
3. **Everything is fail-closed.** Missing/unknown role never grants access.
4. **Privileged writes (profile creation on first login, role changes, audit inserts) go through a service-role client**, because the RLS that protects those tables would otherwise (correctly) block the very user trying to bootstrap themselves.

---

## Concerns & Mitigations

| Concern | Mitigation |
|---|---|
| RLS recursion: policies on `user_profiles` call a helper that reads `user_profiles` | `get_my_role()` is `SECURITY DEFINER` (bypasses RLS inside the function) with a pinned `search_path`; wrapped as `(SELECT get_my_role())` in policies so Postgres evaluates it once per statement (initplan), not per row |
| Existing auth users have no profile row yet | Migration pre-seeds a profile row for every existing `auth.users` row with `role = 'admin'` |
| Crew `auth.users` doesn't exist until first login | Use a `pending_invites` table; on first login match email case-insensitively and auto-create the profile **via the service-role client** (RLS would otherwise reject a role-less new user) |
| Crew could read `revenue`/`phone` by querying base tables directly | `jobs` and `customers` have **no crew RLS policy**. Crew data comes only from `jobs_crew_view` (definer, self-scoped, revenue/phone excluded) |
| A plain view bypasses RLS with the owner's rights | `jobs_crew_view` embeds its own `WHERE ja.crew_id = get_my_crew_id()` scoping filter, so a definer view is safe *and* still hides pricing columns |
| Missing/unknown role silently grants access | Middleware and `requireRole()` both fail closed |
| Audit log could be forged by any authenticated user | No `authenticated` INSERT policy on `role_audit_log`; only the service role (which bypasses RLS) writes it |
| `types.ts` goes stale | Must re-run `supabase gen types` after each migration; view columns come back nullable — narrow at call sites |

---

## Phase 0: Service-role client (prerequisite)
**New file: `src/lib/supabase/admin.ts`**

Several privileged operations must bypass RLS. Add a service-role client, used **only** in trusted server contexts (auth callback, RBAC Server Actions). Never import this into a Client Component.

```ts
import { createClient as createAdminBase } from "@supabase/supabase-js"
import type { Database } from "./types"

/** Service-role client — bypasses RLS. Server-only, never expose to the browser. */
export function createAdminClient() {
  return createAdminBase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and to the `required` list in `src/lib/env.ts`.

---

## Phase 1: DB Foundation
**New migration: `supabase/migrations/024_rbac_foundation.sql`**

```sql
-- Role enum
CREATE TYPE user_role AS ENUM ('dev', 'admin', 'crew');

-- User profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'admin',
  crew_id UUID REFERENCES crew(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PK already indexes id; index the FK used by crew scoping
CREATE INDEX ON user_profiles(crew_id);

-- Pending invites (whitelist — pre-configured before first login)
CREATE TABLE pending_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role user_role NOT NULL,
  crew_id UUID REFERENCES crew(id) ON DELETE SET NULL,
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

-- Audit log for role changes
CREATE TABLE role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by UUID REFERENCES auth.users(id),
  target_user UUID REFERENCES auth.users(id),
  old_role user_role,
  new_role user_role NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Helper: role lookup. SECURITY DEFINER so reads inside RLS policies bypass
-- RLS on user_profiles (prevents infinite recursion). search_path pinned per
-- the pattern established in migration 015.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$;

-- Helper: current user's linked crew_id (used by crew scoping). Same rationale.
CREATE OR REPLACE FUNCTION get_my_crew_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT crew_id FROM user_profiles WHERE id = auth.uid()
$$;

-- Seed profiles for all existing auth users as 'admin' (no one loses access)
INSERT INTO user_profiles (id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- RLS on new tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_audit_log ENABLE ROW LEVEL SECURITY;

-- user_profiles: each user reads their own row; only dev may write.
-- (First-login INSERT is done by the service-role client, which bypasses RLS —
-- see Phase 4 — so no self-insert policy is granted here on purpose.)
CREATE POLICY "self_read_user_profiles" ON user_profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "dev_write_user_profiles" ON user_profiles
  FOR ALL TO authenticated
  USING ((SELECT get_my_role()) = 'dev')
  WITH CHECK ((SELECT get_my_role()) = 'dev');

-- pending_invites: dev only. First-login reads/writes go through service role.
CREATE POLICY "dev_all_pending_invites" ON pending_invites
  FOR ALL TO authenticated
  USING ((SELECT get_my_role()) = 'dev')
  WITH CHECK ((SELECT get_my_role()) = 'dev');

-- role_audit_log: dev may read. NO authenticated INSERT policy —
-- audit rows are written by the service role only (bypasses RLS).
CREATE POLICY "dev_read_audit_log" ON role_audit_log
  FOR SELECT TO authenticated USING ((SELECT get_my_role()) = 'dev');
```

> **Note:** After running this migration, manually promote yourself from `'admin'` to `'dev'` directly in Supabase Studio before using the RBAC UI.

---

## Phase 2: RLS Policy Rewrite
**New migration: `supabase/migrations/025_rbac_rls_policies.sql`**

The existing catch-all policies are named `authenticated_all_<table>` (created by the DO-block in `001_initial_schema.sql`). Drop each and replace with role-aware versions.

**dev + admin** get full read/write on every table (same as today).
**crew** gets scoped, read-only access to a small set of *non-financial* tables only. Crucially, **crew has no policy on `jobs` or `customers`** — those hold `revenue`/`phone` and are reached only through the Phase 3 view.

```sql
-- Pattern for staff-only tables. Repeat for every table EXCEPT the crew-readable
-- ones handled below:
--   leads, lead_photos, surveys, survey_media, proposals, estimations,
--   proposal_revisions, expenses, payments, invoices, fleet, crew,
--   system_settings, revenue_targets, customers, jobs
DROP POLICY "authenticated_all_leads" ON leads;
CREATE POLICY "staff_all_leads" ON leads
  FOR ALL TO authenticated
  USING ((SELECT get_my_role()) IN ('dev', 'admin'))
  WITH CHECK ((SELECT get_my_role()) IN ('dev', 'admin'));

-- jobs: STAFF ONLY at the table level (contains revenue). Crew reads jobs_crew_view.
DROP POLICY "authenticated_all_jobs" ON jobs;
CREATE POLICY "staff_all_jobs" ON jobs
  FOR ALL TO authenticated
  USING ((SELECT get_my_role()) IN ('dev', 'admin'))
  WITH CHECK ((SELECT get_my_role()) IN ('dev', 'admin'));

-- customers: STAFF ONLY at the table level (contains phone). Crew sees name/address
-- via jobs_crew_view only.
DROP POLICY "authenticated_all_customers" ON customers;
CREATE POLICY "staff_all_customers" ON customers
  FOR ALL TO authenticated
  USING ((SELECT get_my_role()) IN ('dev', 'admin'))
  WITH CHECK ((SELECT get_my_role()) IN ('dev', 'admin'));

-- ---- Crew-readable non-financial tables ----
-- These contain no pricing/PII, so direct scoped SELECT is safe.

-- job_assignments: staff full; crew reads only its own rows
DROP POLICY "authenticated_all_job_assignments" ON job_assignments;
CREATE POLICY "staff_all_job_assignments" ON job_assignments
  FOR ALL TO authenticated
  USING ((SELECT get_my_role()) IN ('dev', 'admin'))
  WITH CHECK ((SELECT get_my_role()) IN ('dev', 'admin'));
CREATE POLICY "crew_read_own_assignments" ON job_assignments
  FOR SELECT TO authenticated USING (
    (SELECT get_my_role()) = 'crew'
    AND crew_id = (SELECT get_my_crew_id())
  );

-- job_timeline: staff full; crew reads timeline for assigned jobs
DROP POLICY "authenticated_all_job_timeline" ON job_timeline;
CREATE POLICY "staff_all_job_timeline" ON job_timeline
  FOR ALL TO authenticated
  USING ((SELECT get_my_role()) IN ('dev', 'admin'))
  WITH CHECK ((SELECT get_my_role()) IN ('dev', 'admin'));
CREATE POLICY "crew_read_assigned_timeline" ON job_timeline
  FOR SELECT TO authenticated USING (
    (SELECT get_my_role()) = 'crew'
    AND job_id IN (
      SELECT job_id FROM job_assignments WHERE crew_id = (SELECT get_my_crew_id())
    )
  );

-- job_media is a TABLE (migration 008), separate from the job-media storage bucket.
DROP POLICY "authenticated_all_job_media" ON job_media;   -- if such a policy exists
CREATE POLICY "staff_all_job_media" ON job_media
  FOR ALL TO authenticated
  USING ((SELECT get_my_role()) IN ('dev', 'admin'))
  WITH CHECK ((SELECT get_my_role()) IN ('dev', 'admin'));
CREATE POLICY "crew_read_assigned_media" ON job_media
  FOR SELECT TO authenticated USING (
    (SELECT get_my_role()) = 'crew'
    AND job_id IN (
      SELECT job_id FROM job_assignments WHERE crew_id = (SELECT get_my_crew_id())
    )
  );
-- Crew may add PHOTOS (not PDFs) to jobs they're assigned to
CREATE POLICY "crew_insert_assigned_media" ON job_media
  FOR INSERT TO authenticated WITH CHECK (
    (SELECT get_my_role()) = 'crew'
    AND media_type = 'photo'
    AND job_id IN (
      SELECT job_id FROM job_assignments WHERE crew_id = (SELECT get_my_crew_id())
    )
  );
```

> **`job_media` note:** confirm the exact existing policy name before `DROP`. `008_job_media.sql` created the table; the catch-all in `001` predates it, so `job_media` may only have policies added later — adjust the `DROP` to match `pg_policies`.

### Storage bucket policies (`job-media`)

The `job_media` **table** RLS above governs the metadata row; the actual file bytes live in the **`job-media` storage bucket**, which has its own RLS on `storage.objects`. Today (migration `008`) that bucket is public with blanket `authenticated_*` policies — meaning any authenticated user, including crew, could already read or write any job's files. Rewrite them to be role-aware. Uploads use the path `{jobId}/{fileName}` (verified in `JobMediaPanel.tsx`), so `(storage.foldername(name))[1]` is the job_id.

```sql
-- Recommended: make the bucket private. The app already fetches via
-- createSignedUrl(), so nothing breaks, and job photos stop being world-readable
-- by URL. (invoices/proposals were already made private in migration 014.)
UPDATE storage.buckets SET public = false WHERE id = 'job-media';

-- Replace the blanket authenticated policies from migration 008
DROP POLICY "authenticated_select_job-media" ON storage.objects;
DROP POLICY "authenticated_insert_job-media" ON storage.objects;
DROP POLICY "authenticated_delete_job-media" ON storage.objects;

-- Staff: full access to the bucket
CREATE POLICY "staff_all_job_media_objects" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'job-media' AND (SELECT get_my_role()) IN ('dev','admin'))
  WITH CHECK (bucket_id = 'job-media' AND (SELECT get_my_role()) IN ('dev','admin'));

-- Crew: read + upload, scoped to assigned jobs by the leading path segment.
-- No UPDATE/DELETE — crew can add photos but not remove or overwrite them.
CREATE POLICY "crew_read_job_media_objects" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'job-media'
    AND (SELECT get_my_role()) = 'crew'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT job_id FROM job_assignments WHERE crew_id = (SELECT get_my_crew_id())
    )
  );
CREATE POLICY "crew_insert_job_media_objects" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'job-media'
    AND (SELECT get_my_role()) = 'crew'
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT job_id FROM job_assignments WHERE crew_id = (SELECT get_my_crew_id())
    )
  );
```

> Two enforcement layers must both pass for a crew upload: the storage INSERT policy (file bytes) **and** the `crew_insert_assigned_media` table policy (metadata row). `JobMediaPanel` writes the object first, then the row — both are scoped identically, so a crew user can only ever land files under their assigned jobs.

---

## Phase 3: Crew-scoped View
**New migration: `supabase/migrations/026_crew_views.sql`**

Crew has no base-table access to `jobs` or `customers`. This single **self-scoped, security-definer** view is their only window into job data. It:
- filters rows to the caller's own assignments (`WHERE ja.crew_id = get_my_crew_id()`), so it's safe despite being definer;
- excludes `revenue` (pricing) and customer `phone`/`email` (PII).

```sql
-- security_invoker is OFF (definer) on purpose: crew has no RLS grant on jobs
-- or customers, so we scope rows here instead. get_my_crew_id() reads the
-- CURRENT request's user, so each caller only ever sees their own assignments.
CREATE VIEW jobs_crew_view AS
  SELECT
    j.id,
    j.job_number,
    j.status,
    j.move_date,
    j.move_time,
    j.move_end_date,
    j.origin_address,
    j.destination_address,
    j.proposal_id,
    c.name    AS customer_name,
    c.address AS customer_address
    -- EXCLUDES: j.revenue, c.phone, c.email
  FROM jobs j
  JOIN job_assignments ja ON ja.job_id = j.id
  JOIN proposals pr       ON pr.id = j.proposal_id
  JOIN leads l            ON l.id  = pr.lead_id
  JOIN customers c        ON c.id  = l.customer_id
  WHERE ja.crew_id = get_my_crew_id();

GRANT SELECT ON jobs_crew_view TO authenticated;
```

Staff continue to use `jobs` / the existing `jobs_with_customer` view (a staff query against `jobs_crew_view` returns zero rows, since staff have `crew_id IS NULL` — harmless).

---

## Phase 4: Auth Callback — First Login Profile Creation
**File: `src/app/auth/callback/route.ts`**

`pending_invites` acts as a **whitelist**. Unknown emails are rejected — signed out and redirected to `/login?error=not_invited`.

The profile INSERT, invite lookup, and invite update all use the **service-role client** (`createAdminClient`), because the new user has no role yet and RLS on `user_profiles`/`pending_invites` (correctly) allows neither. The profile SELECT can use the user's own session (covered by `self_read_user_profiles`).

```ts
import { createAdminClient } from "@/lib/supabase/admin"
// ...after a successful exchangeCodeForSession() and before redirecting:

const { data: { user } } = await supabase.auth.getUser()
if (user) {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle()

  if (!existing) {
    // First login — must have an unaccepted invite (case-insensitive email match)
    const { data: invite } = await admin
      .from("pending_invites")
      .select("role, crew_id")
      .ilike("email", user.email!)
      .is("accepted_at", null)
      .maybeSingle()

    if (!invite) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL("/login?error=not_invited", request.url))
    }

    await admin.from("user_profiles").insert({
      id: user.id,
      role: invite.role,
      crew_id: invite.crew_id ?? null,
    })

    await admin.from("pending_invites")
      .update({ accepted_at: new Date().toISOString() })
      .ilike("email", user.email!)
  }
}
```

The `/login` page should display a friendly message when `?error=not_invited` is present.

---

## Phase 5: Server-side Role Helper
**File: `src/lib/supabase/server.ts`** (add alongside existing exports)

```ts
export async function getMyRole(): Promise<"dev" | "admin" | "crew" | null> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("get_my_role")
  return data ?? null
}
```

---

## Phase 6: Middleware — Route Guards
**File: `src/middleware.ts`**

After the existing `getUser()` auth check, resolve the role via the RPC (using the middleware-scoped Supabase client already constructed there) and enforce route restrictions. **Fail closed**: an authenticated user with no resolvable role is bounced out.

```ts
// Crew may only reach these route prefixes
const CREW_ALLOWED = ["/jobs", "/calendar", "/auth", "/api"]
// RBAC admin surface
const DEV_ONLY = ["/settings/rbac"]

if (user) {
  const { data: role } = await supabase.rpc("get_my_role")

  if (!role) {
    // Authenticated but unprovisioned — should be impossible (callback rejects
    // uninvited users), but fail closed rather than defaulting to full access.
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL("/login?error=no_role", request.url))
  }

  if (role === "crew" && !CREW_ALLOWED.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/jobs", request.url))
  }

  if (role !== "dev" && DEV_ONLY.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL("/today", request.url))
  }
}
```

> **Notes:** The RPC is one indexed PK lookup per navigation — negligible at this org's scale. Use the middleware-compatible Supabase client already in place (do **not** import `src/lib/supabase/server.ts`, which uses `next/headers` and won't run on the edge). Ensure the middleware `matcher` continues to exclude static assets so the RPC doesn't run per-file.

---

## Phase 7: Navigation Gating
**Files: `src/components/layout/Sidebar.tsx`, `src/components/layout/BottomNav.tsx`**

Add a `role` prop and conditionally render nav items:

- **dev**: all items + "User Access" link under Settings → `/settings/rbac`
- **admin**: all items except "User Access"
- **crew**: only Jobs, Calendar

Pass role down from `src/app/(dashboard)/layout.tsx` (which already wraps the shell) via `await getMyRole()`.

> Nav gating is UX only — the middleware guard (Phase 6) and RLS (Phase 2/3) are the real enforcement.

---

## Phase 8: Data Layer — Crew View Usage
**Affected files**: any Server Component or Server Action that queries `jobs` / `jobs_with_customer` / `customers` for display to crew.

```ts
const role = await getMyRole()
// Crew: revenue and customer phone/email are absent from the view by construction.
const { data } = role === "crew"
  ? await supabase.from("jobs_crew_view").select("*")
  : await supabase.from("jobs_with_customer").select("*") // or "jobs"
```

No manual `phone`/`revenue` omission is needed for crew — the view doesn't expose those columns, so it's enforced at the DB, not by remembering to drop fields in each select.

---

## Phase 9: RBAC Admin UI
**New route: `src/app/(dashboard)/settings/rbac/`**

Files:
- `page.tsx` — Server Component; lists users via the service-role client (`createAdminClient().auth.admin.listUsers()`) joined to `user_profiles`
- `loading.tsx` — skeleton
- `UserRoleRow.tsx` (client) — role dropdown, crew-record link selector, save action
- `InviteUserDialog.tsx` (client) — email + role + optional crew_id form, calls a Server Action
- `AuditLogTable.tsx` — read-only table of `role_audit_log`

**Server Actions** (`src/app/(dashboard)/settings/rbac/actions.ts`) — each guards with `await requireRole("dev")` first, then uses the service-role client for the privileged writes:
- `assignRole(targetUserId, newRole, crewId?)` — read old role, update `user_profiles`, insert a `role_audit_log` row (audit insert **must** be service-role; there is no authenticated INSERT policy). Also update `user_profiles.crew_id`.
- `inviteUser(email, role, crewId?)` — insert into `pending_invites`. **No email is sent** and we do **not** call `admin.inviteUserByEmail` — auth is Google-OAuth-only, so the invite is purely a whitelist entry; the person signs in with Google and the callback (Phase 4) provisions them. Notify them out-of-band.

```ts
// src/lib/auth/guards.ts (new file)
const RANK = { crew: 0, admin: 1, dev: 2 } as const

export async function requireRole(minimum: "dev" | "admin") {
  const role = await getMyRole()
  if (!role || RANK[role] < RANK[minimum]) {
    throw new Error("Unauthorized")
  }
}
```

---

## Phase 10: Crew-optimized Job Views
**Files**: `src/app/(dashboard)/jobs/page.tsx`, `src/app/(dashboard)/jobs/[id]/page.tsx`, calendar data source

- Jobs list: for crew, source rows from `jobs_crew_view` (no revenue column exists to hide).
- Job detail: for crew, render from `jobs_crew_view` + scoped `job_timeline` / `job_media` / `job_assignments`; there is no financial summary or customer phone to conditionally hide — those columns/tables aren't reachable.
- `JobMediaPanel`: for crew, **keep the photo upload affordance** but hide the PDF-upload path and the delete buttons (the DB rejects both regardless — this is just to avoid dead UI). Crew photo uploads land under their assigned job's path and appear alongside staff uploads.
- Calendar: for crew, build events from `jobs_crew_view` (already scoped to their assignments) rather than `jobs`.

---

## Implementation Order

1. Phase 0 (service-role client + env var)
2. Phase 1 → Phase 2 → Phase 3 (migrations — run in Supabase SQL Editor in order)
3. Promote yourself to `'dev'` in Supabase Studio
4. Phase 4 (auth callback)
5. Phase 5 (role helper)
6. Phase 6 (middleware)
7. Phase 7 (nav gating)
8. Phase 8 (data layer)
9. Phase 9 (RBAC UI)
10. Phase 10 (crew view polish)
11. Regenerate `src/lib/supabase/types.ts` after all migrations (view columns come back nullable — narrow at call sites)

---

## Migration Safety

- All existing users get `role = 'admin'` via the seed INSERT in Phase 1 — no one loses access.
- `pending_invites` is a whitelist — unknown Google accounts are rejected at the auth callback.
- Because policies are dropped and recreated inside a single migration transaction, there's no window where a table is left with no policy; the swap is atomic per migration.
- Test with a second Google account: first without an invite (should be rejected with `?error=not_invited`), then after adding an invite (should get through with the correct role and scoping).

---

## Verification Checklist

- [ ] Dev user sees all nav including "User Access" under Settings
- [ ] Admin user sees all nav, cannot reach `/settings/rbac` (redirected to `/today`)
- [ ] Crew user sees only Jobs + Calendar in nav
- [ ] Crew user navigating to `/pipeline` or `/money` is redirected to `/jobs`
- [ ] Authenticated user with no `user_profiles` row is signed out and sent to `/login?error=no_role` (fail-closed)
- [ ] Unknown Google account login is rejected with `?error=not_invited`
- [ ] Crew user in Jobs sees only their assigned jobs — **verify a direct `SELECT * FROM jobs` as a crew JWT in Supabase Studio returns zero rows** (revenue never reachable)
- [ ] `SELECT * FROM jobs_crew_view` as crew returns only their jobs, with no `revenue`/`phone` columns; as a staff/dev user returns zero rows
- [ ] Crew cannot `SELECT` from `customers`, `proposals`, `invoices`, `payments`, etc. (RLS denies)
- [ ] Assigning a role in the RBAC UI creates a `role_audit_log` entry with correct `changed_by`/`old_role`/`new_role`
- [ ] A non-dev user cannot insert into `role_audit_log` directly (RLS denies)
- [ ] Inviting a user adds a `pending_invites` row; on their first Google login the profile is created with the correct role + crew link
- [ ] Crew can upload a photo to an assigned job (file lands under `{jobId}/…`, metadata row created, `media_type = 'photo'`)
- [ ] Crew uploading to a job they're **not** assigned to is rejected by both the storage policy and the `job_media` insert policy
- [ ] Crew cannot delete/overwrite job media, and cannot upload a PDF (DB rejects `media_type = 'pdf'`)
- [ ] Unlinking a crew record (setting `crew_id = null`) removes that crew's job visibility on their next request
- [ ] `tsc --noEmit` and `biome check .` pass after all changes

---

## Deferred / future work (intentionally out of scope)

- **Role in the JWT.** Carrying `user_role` as a custom/app_metadata claim would remove the per-request RPC in middleware and the per-statement lookup in RLS. Deferred because it adds app_metadata↔`user_profiles` sync (or an access-token hook), existing-user claim backfill, and role-change staleness (up to token expiry) — not worth it at this scale. Revisit only if middleware latency becomes a measured problem.
- **Broader crew write paths** (job status updates, timeline entries). Crew's only write in this plan is photo upload (Phase 2). If field status write-back is wanted later, it needs its own scoped UPDATE policy on `jobs`/`job_timeline` — note that granting crew any write on `jobs` requires care so `revenue` stays unwritable (column-level grants or a dedicated RPC).
