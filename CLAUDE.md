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
