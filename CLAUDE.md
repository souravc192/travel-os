# Travel OS — Phase 5B: Multi-segment travel (current)

## Phase 5B — what shipped

### 1. Schema
- New table `travel_segments` (one row per journey leg):
  - `sequence_no`, `from_location`, `to_location`, `travel_date`,
    `preferred_time`, `travel_mode` (enum `travel_mode_seg`), `notes`.
- New table `accommodation_segments` (one row per stay):
  - `sequence_no`, `city`, `center`, `check_in_date`, `check_out_date`,
    `hotel_requirement` (enum), `hotel_requirement_other`, `notes`.
- `bookings` gets **two new nullable FKs**: `travel_segment_id` and
  `accommodation_segment_id` — loose link per M2(a). Type of the booking
  decides which one is set.
- `travel_requests` loses the flat single-trip columns (booking_boarding,
  booking_destination, booking_departure_date, …, stay_*) and gains
  request-level `purpose`, `remarks`, plus a denormalised
  `earliest_travel_date` cached for fast urgency / sort queries.
- Pre-Phase-5B `travel_requests` rows were dummy data; the migration
  TRUNCATEs them before the column drop (cascades to approvals, bookings,
  budget history rows referencing them).

### 2. Backend
- `travel-requests.controller.ts::createRequest`:
  - Accepts `travelSegments[]` (≥1 required) + `accommodationSegments[]`.
  - Validates per-row (from/to differ, dates parseable, modes/requirements valid,
    accommodation check-out > check-in, OTHER requirement needs free text).
  - Travel segments must be in non-decreasing date order.
  - Urgency now keyed off **MIN(travel_date)** across segments — replaces the
    Phase-5A `booking_departure_date` input. `computeUrgency()` unchanged.
  - Approval chain logic unchanged (urgency → middle slot, blank/self skip).
- `getRequest` returns `travel_segments` and `accommodation_segments` alongside
  the request body.
- `listRequests` + `listPendingApprovals` expose `first_from`, `last_to`,
  `earliest_travel_date`, and `segments_count` derived columns for
  at-a-glance list rendering.
- `bookings.controller.ts::createBooking` + `updateBooking` accept optional
  `travelSegmentId` / `accommodationSegmentId` and persist them.

### 3. Frontend
- `NewTravelRequestPage`:
  - Replaces the flat Booking + Stay sections with two dynamic-row sections:
    **Travel Segments** and **Accommodation Segments**, each with "+ Add" and
    "× Remove" controls and validation. Travel always has ≥1 row; accommodation
    starts empty and is opt-in.
  - Urgency badge now watches `MIN(travelSegments[*].travelDate)`.
  - New request-level **Purpose & Remarks** section replaces the per-booking
    purpose/remarks fields.
  - `needsStay` derived from `accommodationSegments.length > 0`.
- `TravelRequestDetailPage`:
  - Renders an ordered list of travel segments (with mode badge) and a
    matching accommodation list (with requirement badge), in place of the
    old single Booking / Stay sections.
- `MyTravelRequestsPage` + `ApprovalsInboxPage` + `DashboardPage`:
  - Read `first_from` / `last_to` / `earliest_travel_date` / `segments_count`
    from the API to show "Delhi → Bengaluru (+2 more)" style summaries.
- `BookingFormModal` + `BookingsPanel`:
  - Optional **Link to Segment** dropdown. The dropdown auto-filters to
    Travel segments for transport bookings and Accommodation segments for
    HOTEL / CONFERENCE_HALL bookings.

## DB migrations — full order
```
psql $DATABASE_URL -f apps/api/src/migrations/001_initial_schema.sql
psql $DATABASE_URL -f apps/api/src/migrations/001b_seed.sql
psql $DATABASE_URL -f apps/api/src/migrations/002_budget_alerts.sql
psql $DATABASE_URL -f apps/api/src/migrations/003_phase3_overhaul.sql
psql $DATABASE_URL -f apps/api/src/migrations/003b_seed.sql
psql $DATABASE_URL -f apps/api/src/migrations/004_phase4_bookings_policy.sql
psql $DATABASE_URL -f apps/api/src/migrations/005_phase5a_urgency_booking.sql
psql $DATABASE_URL -f apps/api/src/migrations/006_phase5b_multi_segment.sql
```
Or one-shot: `npm run migrate:all` (from `apps/api`).

> **Heads-up**: `006_phase5b_multi_segment.sql` TRUNCATEs `travel_requests`
> before dropping the legacy flat columns. Existing approvals, bookings, and
> budget-history rows cascade. This is per the design call M1 (dummy data).

## What Phase 5C (Reimbursement) needs from Phase 5B
- Travel-linked reimbursements link to `travel_requests.id`. A reimbursement
  can optionally drill down to a specific `travel_segments.id` later, but v1
  links at request level.
- `bookings.travel_segment_id` / `accommodation_segment_id` mean Travel Team
  can already attribute spend to a specific leg / stay — handy for
  reimbursement audit drilldown.

---

# Travel OS — Phase 5A: Urgency rewrite + Center ID + Designation visibility + PDF auth + booking types (superseded)

## Phase 5A — what shipped

### 1. Urgency rewrite — auto-computed three-state with chain swap
- `urgency_level` enum gains **EMERGENCY** (Phase 4 had only NORMAL / URGENT).
- Urgency is **auto-computed at submit time** from `booking_departure_date` vs today (calendar-day diff):
  - `≥ 4 days` → **NORMAL**
  - `1 – 3 days` → **URGENT**
  - `0 days` (same day / within 24h) → **EMERGENCY**
- Chain composition is now **urgency-driven**, replacing the
  Phase-3 "take first N from `no_of_approvers`" logic:
  - NORMAL    → L1 → L2  → L3
  - URGENT    → L1 → HOD → L3
  - EMERGENCY → L1 → CXO → L3
- Chain builder (`apps/api/src/controllers/travel-requests.controller.ts::buildChain`):
  - Drops blank approver-email slots.
  - Drops any slot whose email equals the submitter's email (self-approval skip).
  - If `employees.no_of_approvers = 0`, chain is empty → AUTO_APPROVED.
  - If filtered chain ends up empty, also AUTO_APPROVED.
- Approve/reject chain advance uses **actual chain row count** (not the raw
  `traveler_no_of_approvers`), so it correctly finalises shorter post-filter chains.
- Frontend (`NewTravelRequestPage`) replaces the urgency toggle with a
  read-only `<UrgencyBadge>` that updates as soon as a departure date is picked.
- Reusable helper exported from shared-types: `computeUrgency(submitted, departure)`.

### 2. Center ID for "Expansion" department
- New column `travel_requests.expansion_center_id` (free-text, ≤80 chars).
- Backend enforces: if traveler's department name is exactly `'Expansion'`,
  `expansionCenterId` is required on POST.
- Frontend conditionally renders the field under Member Identification when the
  autofilled department name is `Expansion`.
- Displayed on TravelRequestDetailPage in the Traveler section.

### 3. Designation visibility (confidentiality)
- Designation is now **hidden from User and HOD** roles across the UI.
- Visible only to **Owner / Admin / Travel Team** — Travel Desk still needs it
  for ticketing / vendor interactions.
- Data is still fetched, stored, and available in DB and lookups — only the
  render-side is gated.

### 4. Policy PDF preview / NO_TOKEN bug fix
- Root cause: plain `<a href="…/pdf" target="_blank">` couldn't attach the
  in-memory JWT (we don't keep it in a cookie), so the API rejected with NO_TOKEN.
- Fix: new helpers in `apps/web/src/lib/api.ts`:
  - `openAuthPdf(url)` — fetches with auth header, makes a `blob://` URL, opens
    in a new tab (falls back to a download trigger if popup blocked).
  - `fetchAuthPdfBlobUrl(url)` — same but returns the blob URL for inline
    `<iframe>` embedding; caller is responsible for revoking it.
- All policy & invoice PDF links converted to `openAuthPdf`.
- Admin policy preview panel now renders the source PDF in an `<iframe>`
  side-by-side with the parsed cards so reviewers can compare at a glance.

### 5. Booking type additions
- `booking_type` enum extended with **TRAVELLER** (Tempo Traveller — small bus)
  and **CONFERENCE_HALL**.
- New nullable column `bookings.venue_capacity INT` for conference halls.
- BookingFormModal:
  - Dropdown now uses friendly labels (`Tempo Traveller`, `Conference Hall`).
  - Conference Hall flow shows **Event Start / Event End** and a **Venue
    Capacity** input.
- BookingsPanel + BookingsListPage:
  - Truck icon for TRAVELLER, Presentation icon for CONFERENCE_HALL.
  - Capacity badge rendered next to vendor when set.

## DB migrations — full order
```
psql $DATABASE_URL -f apps/api/src/migrations/001_initial_schema.sql
psql $DATABASE_URL -f apps/api/src/migrations/001b_seed.sql
psql $DATABASE_URL -f apps/api/src/migrations/002_budget_alerts.sql
psql $DATABASE_URL -f apps/api/src/migrations/003_phase3_overhaul.sql
psql $DATABASE_URL -f apps/api/src/migrations/003b_seed.sql
psql $DATABASE_URL -f apps/api/src/migrations/004_phase4_bookings_policy.sql
psql $DATABASE_URL -f apps/api/src/migrations/005_phase5a_urgency_booking.sql
```
Or one-shot: `npm run migrate:all` (from `apps/api`).

> Note: `005_phase5a_urgency_booking.sql` runs the `ALTER TYPE … ADD VALUE`
> statements **outside** a `BEGIN/COMMIT` block (Postgres requirement). The
> `apps/api/scripts/run-migration.js` runner submits the whole file in one
> `client.query()` call, so this works without splitting the file.

## What Phase 5B (multi-segment travel) needs from Phase 5A
- `travel_requests.expansion_center_id` is now request-level. When multi-segment
  lands, each accommodation segment may want its own center reference — keep
  the request-level field as a default, segments override.
- `computeUrgency()` is keyed off a single `bookingDepartureDate`; once
  segments arrive, switch to `MIN(segment_departure_date)` to pick urgency.
- Chain builder is stateless — works as-is regardless of how segments are stored.

---

# Travel OS — Phase 4: Bookings + Policy Knowledge Base (superseded)

## Phase 4 — what shipped
- **Bookings module** (Travel Team can manually record bookings against each travel request):
  - New table `bookings` — 1 travel_request → N bookings (flight + hotel + cab etc.).
  - Enums: `booking_type` (FLIGHT/TRAIN/BUS/CAB/HOTEL/OTHER), `booking_status` (PENDING/CONFIRMED/CANCELLED/RESCHEDULED).
  - Per-booking fields: vendor, amount, currency, PNR/reference, booking_date, departure/return (transport)
    OR check_in/check_out (hotel), notes, invoice_path, cancellation_fee.
  - Status FSM: PENDING → CONFIRMED → CANCELLED, plus RESCHEDULED branch.
- **Budget wiring** — `bookings.controller.ts` debits/refunds department budget transactionally:
  - On **CONFIRM**: `consumed += amount`, history row action `CONSUME` with `booking_id` + `travel_request_id`.
  - On **CANCEL**: `consumed -= (amount − cancellation_fee)`, history row action `REFUND`. The fee remains consumed (audit-friendly).
  - `department_budget_history` gained a `booking_id` column + `REFUND` action.
- **Invoice attachments**:
  - Local-disk storage adapter at `apps/api/src/config/storage.ts` with **`STORAGE_DRIVER=local|s3`** env flag (S3 driver stubbed).
  - `STORAGE_LOCAL_DIR` controls path. Defaults to `./uploads` (project-relative).
  - Authenticated streaming download at `GET /api/v1/bookings/:id/invoice`.
- **Policy Knowledge Base**:
  - New tables `policies` + `policy_versions`. Multiple categorised policies supported.
  - One published version per policy at any time (partial unique index enforces it).
  - PDF parser at `apps/api/src/utils/pdf-parser.ts` — numbered-section heuristic
    (`^\d+(\.\d+)*\.?\s+`) with single-card fallback for unnumbered docs.
  - Upload → preview tree → publish. Versions never disappear; can be re-previewed and republished.
  - Authenticated PDF download at `GET /api/v1/policies/versions/:versionId/pdf`.
- **Backend endpoints added**:
  - `POST/GET/PATCH /api/v1/bookings` + `/:id/confirm` + `/:id/cancel` + `/:id/reschedule` + `/:id/invoice`.
  - `GET /api/v1/bookings/by-request/:requestId` — embedded in TravelRequestDetailPage.
  - `GET/POST/PATCH /api/v1/policies` + `/:id/versions` (upload) + `/versions/:id/publish` + delete.
- **Frontend pages added**:
  - `/bookings` — Travel Team / Admin / Owner: org-wide bookings list with status filter.
  - `BookingsPanel` embedded inside `TravelRequestDetailPage` for approved/auto-approved requests.
  - `BookingFormModal` — type-aware (flight vs hotel) create / edit modal.
  - `/policy` — categorised list (everyone authenticated).
  - `/policy/:id` — hierarchical expandable cards + in-page search + previous-versions section.
  - `/admin/policies` — Admin/Owner: upload PDF, preview parsed tree, publish, manage versions.
- **Budget drill-down**: `BudgetHistoryDrawer` now shows the vendor + booking type on
  `CONSUME` / `REFUND` rows (joined via `bookings.booking_id`).

## DB migrations — full order
```
psql $DATABASE_URL -f apps/api/src/migrations/001_initial_schema.sql
psql $DATABASE_URL -f apps/api/src/migrations/001b_seed.sql
psql $DATABASE_URL -f apps/api/src/migrations/002_budget_alerts.sql
psql $DATABASE_URL -f apps/api/src/migrations/003_phase3_overhaul.sql
psql $DATABASE_URL -f apps/api/src/migrations/003b_seed.sql
psql $DATABASE_URL -f apps/api/src/migrations/004_phase4_bookings_policy.sql
```
Or one-shot: `npm run migrate:all` (from `apps/api`).

## Extra dependencies added in Phase 4
- API: `pdf-parse` + `@types/pdf-parse` (existing `multer` reused).

## Env vars added in Phase 4
- `STORAGE_DRIVER` — `local` (default) or `s3` (stub).
- `STORAGE_LOCAL_DIR` — absolute or project-relative path. Default: `./uploads`.
- **Railway**: mount a Volume at `/data`, set `STORAGE_LOCAL_DIR=/data/uploads`. Otherwise invoices/PDFs are wiped on every deploy.

## File-storage layout (local driver)
```
$STORAGE_LOCAL_DIR/
├── invoices/YYYY/MM/<uuid>.<ext>
└── policies/YYYY/MM/<uuid>.pdf
```

## What Phase 5+ needs from Phase 4
- `bookings.invoice_path` will be the input to the Invoice/GST validation engine.
- `bookings.cancellation_fee` is the canonical record of partial debits.
- `policy_versions.parsed_tree` (JSONB) can be served to the policy validator at request-submit time.
- To enable S3, implement the `S3Storage` class in `apps/api/src/config/storage.ts`
  and set `STORAGE_DRIVER=s3`. No other code change required.

---

# Travel OS — Phase 3: Travel Request + 5-Role + Members Master (superseded)

## Phase 3 — what shipped
- **5-role RBAC** (replaces the old 6): `OWNER`, `ADMIN`, `TRAVEL_TEAM`, `HOD`, `USER`.
  Mapping applied in `003_phase3_overhaul.sql`. Owner = `sourav.1@pw.live` (seeded).
- **Members Master** (`employees` table, expanded with `email`, `designation`, `l1_email`,
  `l2_email`, `l3_email`, `no_of_approvers`, `group_label`, `hod_email`, `cxo_email`).
  Excel-driven; `user_id` is now nullable so members can exist without a login.
- **Travel Request engine**:
  - `travel_requests` — every form submission, with snapshotted autofill fields and
    JSON detail panels (`student_details` / `guest_details` / `new_member_details`
    / `event_details` / `traveler_details`).
  - `travel_request_approvals` — one row per chain step, level 1-3, status FSM.
  - Chain length = `no_of_approvers` (0 → auto-approved, no chain).
  - Code: `TR-YYYY-NNNNN` via `next_travel_request_code()` SQL function.
- **Department Budgets** (replaces cost-centre `budget_master`):
  - `department_budgets` — `allocated_annual` (default ₹2 400 000 = ₹24L/yr).
  - `budget_addition_requests` — HOD raises, Admin/Owner decides (single-step).
  - `department_budget_history` — audit log keyed by travel_request_id.
- **Backend endpoints added**:
  - `POST /api/v1/members/import` — Owner/Admin only, accepts .xlsx, upserts by Employee Id.
  - `GET  /api/v1/employees/lookup?employeeCode=PW0086` — autofill source.
  - `POST /api/v1/travel-requests` + list/get/approve/reject/cancel.
  - `GET  /api/v1/travel-requests/pending-approvals` — HOD inbox by email match.
  - `POST /api/v1/budget/addition-requests` (HOD) → `/decide` (Admin/Owner).
- **Frontend pages added**:
  - `/travel/new` — full branching form (5 Request-For paths, conditional sections).
  - `/travel/requests` & `/travel/requests/:id` — list + detail w/ chain timeline.
  - `/approvals` & `/approvals/:id` — pending inbox for HOD/Travel Team/Admin/Owner.
  - `/admin/members` — drag/drop .xlsx upload UI.
  - `/budget` — rewritten to be department-based.
- **Sidebar** rebuilt with the 5-role model (`apps/web/src/components/layout/AppLayout.tsx`).

## DB migrations — full order
```
psql $DATABASE_URL -f src/migrations/001_initial_schema.sql   # Phase 1 base
psql $DATABASE_URL -f src/migrations/001b_seed.sql            # legacy seed (still required)
psql $DATABASE_URL -f src/migrations/002_budget_alerts.sql    # Phase 2 (dropped by 003 but harmless)
psql $DATABASE_URL -f src/migrations/003_phase3_overhaul.sql  # Phase 3 schema
psql $DATABASE_URL -f src/migrations/003b_seed.sql            # Phase 3 seed (Owner + dept budgets)
```
Or one-shot: `npm run migrate:all`.

## Extra dependencies added
- API: `multer` + `exceljs` + their @types.

## Test credentials (post-Phase-3 migration)
- `sourav.1@pw.live`         / Travel@123  (Owner)
- `superadmin@company.com`   / Travel@123  → migrated to Owner
- `finance@company.com`      / Travel@123  → migrated to Admin
- `travel.desk@company.com`  / Travel@123  → migrated to Travel Team
- `hod.eng@company.com`      / Travel@123  → migrated to HOD
- `manager.eng@company.com`  / Travel@123  → migrated to HOD
- `emp.eng@company.com`      / Travel@123  → migrated to User

## What Phase 4+ needs from Phase 3
- `travel_requests` — booking/invoice modules will hang off this table.
- On `APPROVED`, the booking flow should call `POST /budget/:id/consume` with
  `{ amount, travelRequestId }` to debit the department budget.
- `traveler_no_of_approvers` snapshotted at submit — chain length is locked once submitted.

---

# Travel OS — Phase 2: Budget Control Engine (superseded)

## Phase 2 deliverables (this worktree)
- `apps/api/src/controllers/budget.controller.ts` — full controller
- `apps/api/src/routes/budget.routes.ts` — REST surface (slim, delegates)
- `apps/api/src/migrations/002_budget_alerts.sql` — `budget_alert_thresholds` + `budget_alerts`
- `apps/web/src/hooks/useBudget.ts` — TanStack Query hooks
- `apps/web/src/pages/budget/BudgetDashboardPage.tsx` + `components/{BudgetRing,BudgetTable,SupplementaryModal,BudgetHistoryDrawer}.tsx`
- `apps/web/src/router/index.tsx` — `/budget` mounted for all authenticated roles
- `apps/api/src/config/db.ts` — auto-enables SSL for Neon / managed Postgres
- `apps/web/src/lib/api.ts` — `budgetApi` expanded

## Budget API surface
- `GET    /api/v1/budget/summary?costCentreId&fiscalYear` — current user's CC by default
- `GET    /api/v1/budget/org-overview?fiscalYear`         — SUPER_ADMIN/FINANCE_ADMIN/TRAVEL_DESK
- `GET    /api/v1/budget/:id`                             — single record
- `GET    /api/v1/budget/:id/history?limit`               — audit trail
- `POST   /api/v1/budget`                                 — create/replace allocation (finance/super)
- `POST   /api/v1/budget/:id/adjust`                      — ±delta (finance/super, note ≥10 chars)
- `POST   /api/v1/budget/:id/consume`                     — internal hook (called by trip approval in Phase 3)
- `GET    /api/v1/budget/supplementary?status`            — employees see own; finance/super see all
- `POST   /api/v1/budget/supplementary`                   — request (reason ≥20 chars)
- `POST   /api/v1/budget/supplementary/:id/approve`       — two-step: PENDING→FINANCE_APPROVED→SUPER_APPROVED
- `GET    /api/v1/budget/alerts?budgetId`                 — fired alert log
- `GET/POST/DELETE /api/v1/budget/alert-thresholds`       — configurable trigger %

## DB / Neon
- `DATABASE_URL=postgresql://user:pass@<project>.neon.tech/dbname?sslmode=require`
- `apps/api/src/config/db.ts` auto-detects `neon.tech` / `sslmode=require` and enables `ssl: { rejectUnauthorized: false }`. Force with `DATABASE_SSL=true`.
- Apply migrations in order: `001_initial_schema.sql` → `001b_seed.sql` → `002_budget_alerts.sql`

## What Phase 3 (trip engine) needs from Phase 2
- `budget_master.id` — pass to `POST /budget/:id/consume` when a trip is approved
- `budgetApi.consume(id, { amount, tripId })` — also wire transactionally inside the trip-approval controller
- `evaluateAlerts(budgetId)` is fired automatically after consume — no extra wiring needed
- Cache key: `budget:{costCentreId}:{fiscalYear}` — invalidate when consuming

# Travel OS — Phase 1: Auth Module Context

## What this worktree contains
Authentication, RBAC, database schema, employee master, onboarding.

## Key files you need
- `apps/api/src/index.ts`             — Express server entry
- `apps/api/src/controllers/auth.controller.ts` — All auth logic
- `apps/api/src/middleware/auth.middleware.ts`   — JWT + RBAC guards
- `apps/api/src/utils/jwt.ts`         — Token sign/verify/rotate
- `apps/api/src/config/db.ts`         — PostgreSQL pool
- `apps/api/src/config/redis.ts`      — Redis + cache helpers
- `apps/api/src/migrations/001_initial_schema.sql` — Full DB schema
- `apps/web/src/pages/auth/LoginPage.tsx`   — Login UI
- `apps/web/src/pages/onboarding/OnboardingPage.tsx` — 3-step onboarding
- `apps/web/src/store/auth.store.ts`  — Zustand auth state
- `apps/web/src/lib/api.ts`           — Axios client with interceptors
- `packages/shared-types/src/index.ts` — All TypeScript interfaces

## Architecture decisions made
- Access token: 15 min, in-memory only (NOT in localStorage)
- Refresh token: 7 days, httpOnly cookie, rotated on every use
- Token theft detection: hash mismatch → revoke all sessions
- 6 roles: EMPLOYEE, L1_APPROVER, L2_APPROVER, TRAVEL_DESK, FINANCE_ADMIN, SUPER_ADMIN
- 5 UI themes stored per user in DB

## What Phase 2 (budget-engine) needs from this
- `employees.cost_centre_id` — for budget lookups
- `budget_master` table — already created in migration
- `authenticate` middleware — import from auth.middleware.ts
- `authorize(UserRole.FINANCE_ADMIN, ...)` — for budget routes

## DO NOT touch in this worktree
- Phase 3+ trip logic
- Scraper engine
- Invoice/booking flows

## Test credentials
- superadmin@company.com / Travel@123
- emp.eng@company.com / Travel@123
