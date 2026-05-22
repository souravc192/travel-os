# Travel OS — Phase 3: Travel Request + 5-Role + Members Master (current)

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
