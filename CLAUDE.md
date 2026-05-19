# Travel OS — Phase 2: Budget Control Engine (current)

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
