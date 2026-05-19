# ✈️ Travel OS — Enterprise Travel Intelligence Platform

> Full-cycle travel lifecycle management. From trip request to ERP reconciliation.

---

## 🏗️ Architecture Overview

```
travel-os/
├── apps/
│   ├── web/          → React 18 + TypeScript + Tailwind (Vite) → Vercel
│   └── api/          → Node.js + Express + PostgreSQL → Railway
├── packages/
│   └── shared-types/ → Single-source TypeScript interfaces (used by both apps)
├── infra/
│   └── docker-compose.yml  → Local Postgres + Redis
└── railway.json      → API deployment config
```

---

## ⚡ Quick Start (Local Dev)

### Prerequisites
- Node.js ≥ 20
- Docker Desktop (for local Postgres + Redis)
- npm ≥ 10

### 1. Clone & Install

```bash
git clone https://github.com/your-org/travel-os.git
cd travel-os
npm install          # installs all workspaces
```

### 2. Start Infrastructure

```bash
cd infra
docker compose up -d        # starts Postgres:5432 + Redis:6379

# Optional dev tools (pgAdmin + Redis Commander):
docker compose --profile dev-tools up -d
```

### 3. Configure Environment

```bash
# API
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env:
#   - Generate JWT secrets: openssl rand -hex 64
#   - DATABASE_URL is pre-filled for Docker Compose
#   - REDIS_URL is pre-filled for Docker Compose

# Web
cp apps/web/.env.example apps/web/.env.local
# VITE_API_URL=http://localhost:4000/api/v1 (default — no change needed)
```

### 4. Run Database Migrations + Seed

```bash
# Make sure Docker containers are running first
npm run db:migrate      # creates all 14 tables, views, triggers
npm run db:seed         # seeds demo org + 6 user accounts
```

### 5. Start Development Servers

```bash
npm run dev
# Web →  http://localhost:5173
# API →  http://localhost:4000
# Health: http://localhost:4000/health
```

---

## 🔐 Demo Login Credentials

All demo accounts use password: **`Travel@123`**

| Role          | Email                      | Access Level              |
|---------------|----------------------------|---------------------------|
| Super Admin   | superadmin@company.com     | Full system access        |
| Travel Desk   | travel.desk@company.com    | Bookings, vendors, RC     |
| Finance Admin | finance@company.com        | Invoices, GST, ERP        |
| L2 Approver   | hod.eng@company.com        | Second-level approvals    |
| L1 Approver   | manager.eng@company.com    | First-level approvals     |
| Employee L3   | emp.eng@company.com        | Trip requests, bookings   |

---

## 🌐 Deployment

### Frontend → Vercel

```bash
# Option A: Vercel CLI
cd apps/web
npx vercel --prod

# Option B: GitHub integration
# 1. Push to GitHub
# 2. Import project in Vercel dashboard
# 3. Set root directory: apps/web
# 4. Set env variable: VITE_API_URL=https://your-api.railway.app/api/v1
```

### Backend → Railway

```bash
# Option A: Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up

# Option B: GitHub integration
# 1. Connect repo in Railway dashboard
# 2. Railway auto-detects railway.json
# 3. Add environment variables (from .env.example)
# 4. Add PostgreSQL + Redis plugins from Railway marketplace
```

### Required Railway Environment Variables

```
DATABASE_URL          → auto-set by Railway PostgreSQL plugin
REDIS_URL             → auto-set by Railway Redis plugin
JWT_ACCESS_SECRET     → openssl rand -hex 64
JWT_REFRESH_SECRET    → openssl rand -hex 64
COOKIE_SECRET         → openssl rand -hex 32
NODE_ENV              → production
ALLOWED_ORIGINS       → https://your-app.vercel.app
PORT                  → 4000
```

---

## 📋 API Reference

### Authentication
```
POST   /api/v1/auth/login          → Login, get access token + httpOnly refresh cookie
POST   /api/v1/auth/refresh        → Rotate access token using refresh cookie
POST   /api/v1/auth/logout         → Revoke current session
POST   /api/v1/auth/logout-all     → Revoke all sessions (all devices)
GET    /api/v1/auth/me             → Get current user + employee profile
POST   /api/v1/auth/onboarding     → Complete first-login setup
PATCH  /api/v1/auth/theme          → Update UI theme preference
```

### Trips
```
GET    /api/v1/trips/my            → My trips (employee view)
GET    /api/v1/trips               → All trips (admin/desk view)
GET    /api/v1/trips/:id           → Single trip with approvals + bookings
POST   /api/v1/trips               → Create trip (policy validated)
POST   /api/v1/trips/:id/submit    → Submit draft for approval
POST   /api/v1/trips/:id/cancel    → Cancel trip
```

### Budget
```
GET    /api/v1/budget/summary           → My cost centre budget
GET    /api/v1/budget/org-overview      → All depts (admin/desk/finance)
GET    /api/v1/budget/:id/history       → Budget change timeline
POST   /api/v1/budget/supplementary     → Request additional budget
POST   /api/v1/budget/supplementary/:id/approve → Approve/reject request
```

### Users & Employees
```
GET    /api/v1/users                    → All users (super admin)
PATCH  /api/v1/users/:id/role           → Change user role
PATCH  /api/v1/users/:id/deactivate     → Deactivate user
GET    /api/v1/employees                → Employee directory
GET    /api/v1/employees/:id            → Employee detail
PATCH  /api/v1/employees/:id           → Update approver mapping / grade
```

### Departments
```
GET    /api/v1/departments              → List all departments
GET    /api/v1/departments/cost-centres → All cost centres with dept info
```

### Notifications
```
GET    /api/v1/notifications            → User's notifications
GET    /api/v1/notifications/count      → Unread count
PATCH  /api/v1/notifications/:id/read   → Mark one read
PATCH  /api/v1/notifications/read-all   → Mark all read
```

---

## 🗺️ Build Phases (Worktree Order)

| Phase | Worktree           | Status      | Delivers                                  |
|-------|--------------------|-------------|-------------------------------------------|
| 1     | `auth-module`      | ✅ **Done** | Auth, RBAC, DB schema, Onboarding         |
| 2     | `budget-engine`    | 🔜 Next     | Budget control, cost centre dashboard     |
| 3     | `trip-module`      | 🔜          | Trip form, policy validator, Trip ID gen  |
| 4     | `approval-engine`  | 🔜          | 3-panel approval, SLA tracker             |
| 5     | `scraper-engine`   | 🔜          | Puppeteer scraper, proxy, Redis cache     |
| 6     | `booking-engine`   | 🔜          | Vendor comparison UI, RC PDF OCR          |
| 7     | `invoice-engine`   | 🔜          | Invoice upload, GST validation, pay gate  |
| 8     | `analytics`        | 🔜          | KPI dashboard, charts, CSV/PDF export     |
| 9     | `main merge`       | 🔜          | Integration, ERP webhook, deploy          |

---

## 🔑 Security Model

- **JWT**: Access token (15 min, in-memory only) + Refresh token (7 days, httpOnly cookie)
- **Token rotation**: Every refresh issues a new refresh token; old one is revoked
- **Theft detection**: Hash mismatch on refresh → all sessions revoked
- **Blacklisting**: Revoked access tokens stored in Redis until natural expiry
- **RBAC**: 6 roles, enforced on every route via `authorize()` middleware
- **Audit trail**: All critical mutations logged via Postgres triggers
- **Rate limiting**: 500 req/15min global, 10 req/15min on auth endpoints
- **Password hashing**: bcrypt with cost factor 12

---

## 🗄️ Database Diagram (Key Tables)

```
users ──────────────── employees
                          │
              ┌───────────┼───────────┐
              │           │           │
        departments  cost_centres  trips
                          │           │
                    budget_master  approvals
                          │           │
                   budget_history  bookings
                                       │
                                   invoices
```

---

## 🧱 Hard Rules (Enforced in Code)

| Rule                                  | Enforcement Layer              |
|---------------------------------------|-------------------------------|
| No Trip ID → booking disabled         | API returns 403                |
| Budget = 0 → trip submission blocked  | POST /trips validates budget   |
| Policy breach → exception mandatory   | Phase 7 invoice gate           |
| No validated invoice → payment blocked| Invoice engine (Phase 7)       |
| L1/L2 booking flight → form error    | TRAVEL_POLICIES constant       |
| All overrides → audit_log entry       | Postgres trigger               |

---

## 🤝 Contributing (Worktree Workflow)

```bash
# Start a new phase
git worktree add ../travel-os-budget budget-engine
cd ../travel-os-budget

# Create CLAUDE.md for context
echo "# Budget Engine Context\nThis worktree contains only the budget control module..." > CLAUDE.md

# Work → commit → merge back
git add . && git commit -m "feat(budget): cost centre dashboard + animated consumption bar"
cd ../travel-os
git merge budget-engine
git worktree remove ../travel-os-budget
```

---

*Travel OS v1.0 · Phase 1 Complete · Built with ❤️ for enterprise travel teams*
