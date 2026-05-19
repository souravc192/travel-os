# TRAVEL OS — CLAUDE.md
# Place this file at: travel-os/CLAUDE.md
# Claude Code reads this automatically at session start.

---

## 🎯 What is this project

**Travel OS** — Enterprise travel management SaaS.
Full lifecycle: Trip request → Approval → Booking → Invoice → ERP sync.

**Monorepo structure:**
```
travel-os/
├── apps/
│   ├── api/       → Node.js + Express + PostgreSQL + Redis
│   └── web/       → React 18 + TypeScript + Tailwind + Framer Motion
└── packages/
    └── shared-types/  → Single source of truth for all TypeScript interfaces
```

---

## ✅ PHASE 1 — COMPLETE. NEVER REWRITE THESE.

| What | Files |
|------|-------|
| DB schema (14 tables, triggers, views, sequences) | `apps/api/src/migrations/001_initial_schema.sql` |
| Seed data (6 users, departments, vendors) | `apps/api/src/migrations/001b_seed.sql` |
| JWT auth (15min access / 7d refresh / rotation / Redis blacklist) | `apps/api/src/utils/jwt.ts` |
| Auth controller (login, refresh, logout, /me, onboarding, theme) | `apps/api/src/controllers/auth.controller.ts` |
| RBAC middleware | `apps/api/src/middleware/auth.middleware.ts` |
| Express server + all middleware | `apps/api/src/index.ts` |
| PostgreSQL pool + transaction helper | `apps/api/src/config/db.ts` |
| Redis client + cache helpers + TTL constants | `apps/api/src/config/redis.ts` |
| Winston logger | `apps/api/src/config/logger.ts` |
| All routes (auth, users, employees, departments, budget, trips, notifications) | `apps/api/src/routes/` |
| All shared TypeScript types + TRAVEL_POLICIES constant | `packages/shared-types/src/index.ts` |
| Zustand auth store | `apps/web/src/store/auth.store.ts` |
| Axios API client (auto token refresh interceptor) | `apps/web/src/lib/api.ts` |
| React Router (all routes, role guards, auth init) | `apps/web/src/router/index.tsx` |
| All 5 CSS themes as CSS custom properties | `apps/web/src/styles/globals.css` |
| App layout (sidebar, topbar, notification drawer, command palette) | `apps/web/src/components/layout/` |
| Login page | `apps/web/src/pages/auth/LoginPage.tsx` |
| 3-step onboarding wizard | `apps/web/src/pages/onboarding/OnboardingPage.tsx` |
| Dashboard (metric cards, budget ring, sparklines) | `apps/web/src/pages/dashboard/DashboardPage.tsx` |
| UI primitives (PageLoader, skeletons, ThemeSwitcher, CommandPalette) | `apps/web/src/components/ui/` |

---

## 🔌 STANDARD IMPORTS — USE THESE, DON'T REINVENT

```ts
// ── Backend ───────────────────────────────────────────────────
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import db, { withTransaction, buildPaginationClause } from '../config/db';
import { cacheGet, cacheSet, cacheDel, RedisKey, TTL } from '../config/redis';
import { logger } from '../config/logger';

// ── Shared types ──────────────────────────────────────────────
import {
  UserRole, GradeLevel, TravelMode, TripStatus,
  ApprovalStatus, ExceptionType, InvoiceStatus,
  TRAVEL_POLICIES, AppTheme
} from '@travel-os/shared-types';

// ── Frontend ──────────────────────────────────────────────────
import { useAuthStore } from '../../store/auth.store';
import { api } from '../../lib/api';
import { motion, AnimatePresence } from 'framer-motion';
```

---

## 🎨 STYLING RULES — ENFORCED IN EVERY COMPONENT

**Always use CSS custom property tokens. Never hardcode colors.**

```tsx
// ✅ CORRECT
style={{ background: 'rgb(var(--surface-elevated))' }}
style={{ color: 'rgb(var(--content-primary))' }}
style={{ border: '1px solid rgb(var(--border))' }}
style={{ background: 'rgb(var(--accent))' }}

// ✅ CORRECT — opacity variant
style={{ background: 'rgb(var(--accent) / 0.12)' }}

// ❌ WRONG — breaks all 5 themes
className="bg-gray-900 text-white border-gray-700"
style={{ background: '#6366f1', color: '#ffffff' }}
```

**Available tokens:**
```
Surfaces:  --surface-primary  --surface-secondary  --surface-elevated  --surface-overlay
Borders:   --border  --border-strong
Text:      --content-primary  --content-secondary  --content-muted  --content-inverse
Accent:    --accent  --accent-hover  --accent-subtle  --accent-text
Status:    --status-success  --status-warning  --status-danger  --status-info
```

**Pre-built utility classes (in globals.css):**
```
.glass          → glassmorphism card
.glass-sm       → smaller glass card
.skeleton       → shimmer loading placeholder
.gradient-text  → accent gradient text
.nav-item       → sidebar nav link
.nav-item-active
.badge-success  .badge-warning  .badge-danger  .badge-info  .badge-muted
```

---

## ⚙️ CODE STANDARDS

**Every backend route must have:**
1. `authenticate` middleware
2. `authorize(UserRole.X, ...)` if restricted
3. Input validation via `express-validator` + `validateRequest`
4. Try/catch with `next(err)`
5. Consistent response shape:
```ts
// Success
res.json({ success: true, data: T, message?: string, meta?: { page, limit, total } })

// Error
res.status(4xx).json({ success: false, error: { code: 'SNAKE_CASE', message: 'Human readable' } })
```

**Every DB mutation must:**
- Use `withTransaction()` if touching more than 1 table
- Call `cacheDel()` if the mutated data has a Redis cache entry
- Set audit context for trigger: `SET LOCAL app.current_user_id = '${userId}'`

**Every React component must have:**
- Framer Motion `initial/animate` on cards, lists, modals
- Skeleton state while loading (use `.skeleton` class)
- Empty state with icon + message + CTA
- Error state handled

**TypeScript:**
- No `any` — use types from `@travel-os/shared-types`
- No `// TODO` or stub functions — implement everything fully

---

## 🚫 HARD RULES (ALWAYS ENFORCE IN CODE)

```
Budget = 0          → Block trip submission, return 422 with BUDGET_EXHAUSTED code
Policy breach       → Exception modal mandatory, cannot skip
No Trip ID          → Booking API returns 403
No validated invoice → Payment API disabled
Grade L1/L2 + Flight → Form validation error + API 422
All overrides       → audit_log entry (DB trigger already handles this)
```

---

## 🗺️ ALL PHASES — FULL ROADMAP

| Phase | Branch | Module | Status |
|-------|--------|--------|--------|
| 1 | `feature/auth` | Auth + DB schema + RBAC + Onboarding | ✅ Done |
| 2 | `feature/budget-engine` | Budget Control Engine | 🔜 |
| 3 | `feature/trip-module` | Trip Request Form + Policy Validator | 🔜 |
| 4 | `feature/approval-engine` | 3-Panel Approval + SLA Tracker | 🔜 |
| 5 | `feature/scraper-engine` | Puppeteer Price Scraper + Redis Cache | 🔜 |
| 6 | `feature/booking-engine` | Vendor Comparison UI + RC PDF OCR | 🔜 |
| 7 | `feature/invoice-engine` | Invoice Upload + GST Validation | 🔜 |
| 8 | `feature/analytics` | KPI Dashboard + Charts + Export | 🔜 |
| 9 | `main` | Integration + ERP Webhook + Deploy | 🔜 |

---

## 📋 CURRENT SESSION FOCUS

**Phase: [FILL THIS BEFORE EACH SESSION]**
**Branch: feature/[FILL THIS]**

**Touch only these files this session:**
```
[LIST EXACT FILE PATHS HERE]
```

**Do NOT touch:**
```
apps/api/src/controllers/auth.controller.ts
apps/api/src/middleware/auth.middleware.ts
apps/api/src/utils/jwt.ts
apps/api/src/config/db.ts
apps/api/src/config/redis.ts
apps/api/src/migrations/001_*.sql
apps/web/src/pages/auth/
apps/web/src/pages/dashboard/DashboardPage.tsx
apps/web/src/store/auth.store.ts
apps/web/src/lib/api.ts
apps/web/src/router/index.tsx
apps/web/src/styles/globals.css
packages/shared-types/src/index.ts  ← read-only unless adding new types
```

**Features to build this session:**
```
[PASTE PRD FEATURES FOR THIS PHASE HERE]
```

---

## 🔁 END OF SESSION — ALWAYS OUTPUT THIS

```
## SESSION HANDOFF
Phase: [N]
Branch: feature/[module]
Files completed: [list]
Files partially done: [list + what's left]
Next file to start: [path]
Decisions made: [anything non-obvious]
Migration needed: [yes/no — filename if yes]
```

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