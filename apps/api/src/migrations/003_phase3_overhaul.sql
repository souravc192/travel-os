-- ============================================================
-- Travel OS — Phase 3: Travel Request + 5-Role Model + Dept Budgets
-- Depends on: 001_initial_schema.sql, 001b_seed.sql, 002_budget_alerts.sql
--
-- Changes:
--   • Replace 6-role user_role enum → 5-role (OWNER/ADMIN/TRAVEL_TEAM/HOD/USER)
--   • Expand employees table to be Members Master (Excel-imported)
--   • Seed 377 departments from Excel
--   • Drop budget_master / supplementary_requests (Phase 2)
--   • Add department_budgets + budget_addition_requests
--   • Add travel_requests + travel_request_approvals
--   • TR-YYYY-NNNNN sequence + helper
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Drop Phase 2 budget tables (replaced by department budgets)
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS budget_alerts            CASCADE;
DROP TABLE IF EXISTS budget_alert_thresholds  CASCADE;
DROP TABLE IF EXISTS budget_history           CASCADE;
DROP TABLE IF EXISTS supplementary_requests   CASCADE;
DROP VIEW  IF EXISTS budget_master_view       CASCADE;
DROP VIEW  IF EXISTS org_spend_summary        CASCADE;
DROP TABLE IF EXISTS budget_master            CASCADE;

-- Drop the placeholder Phase 1 trips table if it exists (no rows expected pre-Phase-3)
DROP TABLE IF EXISTS approvals  CASCADE;
DROP TABLE IF EXISTS bookings   CASCADE;
DROP TABLE IF EXISTS invoices   CASCADE;
DROP TABLE IF EXISTS exceptions CASCADE;
DROP TABLE IF EXISTS trips      CASCADE;

-- ────────────────────────────────────────────────────────────
-- 2. Replace user_role enum (6 → 5)
-- ────────────────────────────────────────────────────────────
-- Step A: detach role column → temp text
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role TYPE TEXT USING role::TEXT;

-- Step B: drop old enum
DROP TYPE user_role;

-- Step C: create new enum
CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'TRAVEL_TEAM', 'HOD', 'USER');

-- Step D: migrate old role values → new
UPDATE users SET role = CASE role
  WHEN 'SUPER_ADMIN'   THEN 'OWNER'
  WHEN 'FINANCE_ADMIN' THEN 'ADMIN'
  WHEN 'TRAVEL_DESK'   THEN 'TRAVEL_TEAM'
  WHEN 'L1_APPROVER'   THEN 'HOD'
  WHEN 'L2_APPROVER'   THEN 'HOD'
  WHEN 'EMPLOYEE'      THEN 'USER'
  ELSE 'USER'
END;

-- Step E: reattach enum + default
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'USER';

-- ────────────────────────────────────────────────────────────
-- 3. Expand employees → Members Master
-- ────────────────────────────────────────────────────────────
-- Allow employees without a login (Excel-imported)
ALTER TABLE employees ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_user_id
  ON employees(user_id) WHERE user_id IS NOT NULL;

-- Add Excel-master columns
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS email             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS first_name        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_name         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS l1_email          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS l2_email          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS l3_email          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS no_of_approvers   SMALLINT NOT NULL DEFAULT 0
                            CHECK (no_of_approvers BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS group_label       VARCHAR(80),
  ADD COLUMN IF NOT EXISTS gender            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS hod_email         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cxo_email         VARCHAR(255);

-- Drop legacy approver FKs (replaced by email-based chain)
ALTER TABLE employees DROP COLUMN IF EXISTS l1_approver_id;
ALTER TABLE employees DROP COLUMN IF EXISTS l2_approver_id;

-- Drop grade_level — replaced by group_label
ALTER TABLE employees DROP COLUMN IF EXISTS grade_level;

-- Phone column already exists; keep it (Excel "Mobile Number" lands here)
-- Cost-centre association is left NULLABLE (per Phase 3 spec, blank)
ALTER TABLE employees ALTER COLUMN cost_centre_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_email_lower
  ON employees (LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_hod_email      ON employees(hod_email);
CREATE INDEX IF NOT EXISTS idx_employees_l1_email       ON employees(l1_email);
CREATE INDEX IF NOT EXISTS idx_employees_no_approvers   ON employees(no_of_approvers);

-- ────────────────────────────────────────────────────────────
-- 4. Seed all 377 departments referenced by Excel (idempotent)
--    Codes are auto-generated SHA1-prefix slugs; admin can edit.
-- ────────────────────────────────────────────────────────────
-- (List populated programmatically by the import endpoint on first
--  Members upload — see members.controller.ts. We pre-create a couple
--  here so the system isn't empty after a fresh migrate.)
INSERT INTO departments (name, code) VALUES
  ('Unassigned',        'UNASSIGNED'),
  ('Tech Engineering',  'TECH-ENG'),
  ('Travel Desk',       'TRAVEL-DESK'),
  ('Finance',           'FINANCE')
ON CONFLICT (code) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 5. department_budgets — single source of truth for FY budgets
-- ────────────────────────────────────────────────────────────
CREATE TABLE department_budgets (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id           UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  fiscal_year             VARCHAR(9) NOT NULL,             -- '2026-27'
  allocated_annual        NUMERIC(15,2) NOT NULL DEFAULT 2400000,  -- ₹24L = ₹2L × 12
  consumed                NUMERIC(15,2) NOT NULL DEFAULT 0,
  supplementary_approved  NUMERIC(15,2) NOT NULL DEFAULT 0,
  last_updated_by         UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(department_id, fiscal_year),
  CONSTRAINT chk_dept_consumed_nonneg  CHECK (consumed >= 0),
  CONSTRAINT chk_dept_alloc_nonneg     CHECK (allocated_annual >= 0)
);

CREATE INDEX idx_dept_budgets_dept ON department_budgets(department_id);
CREATE INDEX idx_dept_budgets_fy   ON department_budgets(fiscal_year);

CREATE VIEW department_budgets_view AS
  SELECT db.*,
    (allocated_annual + supplementary_approved - consumed) AS remaining,
    CASE
      WHEN (allocated_annual + supplementary_approved) = 0 THEN 0
      ELSE ROUND((consumed / NULLIF(allocated_annual + supplementary_approved, 0)) * 100, 2)
    END AS utilization_pct
  FROM department_budgets db;

-- ────────────────────────────────────────────────────────────
-- 6. budget_addition_requests — HOD raises, Admin approves
-- ────────────────────────────────────────────────────────────
CREATE TABLE budget_addition_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_budget_id UUID NOT NULL REFERENCES department_budgets(id) ON DELETE CASCADE,
  requested_by        UUID NOT NULL REFERENCES users(id),
  amount              NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  reason              TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  decision_by         UUID REFERENCES users(id),
  decision_note       TEXT,
  decision_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_addition_status ON budget_addition_requests(status);
CREATE INDEX idx_budget_addition_dept   ON budget_addition_requests(department_budget_id);

-- ────────────────────────────────────────────────────────────
-- 7. department_budget_history — audit log
-- ────────────────────────────────────────────────────────────
CREATE TABLE department_budget_history (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_budget_id    UUID NOT NULL REFERENCES department_budgets(id) ON DELETE CASCADE,
  action                  VARCHAR(30) NOT NULL,  -- ALLOCATE / CONSUME / SUPPLEMENT / ADJUST
  amount                  NUMERIC(15,2) NOT NULL,
  balance_after           NUMERIC(15,2) NOT NULL,
  actor_id                UUID REFERENCES users(id),
  note                    TEXT,
  travel_request_id       UUID,  -- FK added after travel_requests
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dept_history_budget ON department_budget_history(department_budget_id);

-- ────────────────────────────────────────────────────────────
-- 8. travel_requests — the new Phase 3 form
-- ────────────────────────────────────────────────────────────
CREATE TYPE urgency_level     AS ENUM ('NORMAL', 'URGENT');
CREATE TYPE request_for_type  AS ENUM ('PW_MEMBER', 'STUDENT', 'GUEST', 'NEW_MEMBER', 'EVENT');
CREATE TYPE request_kind      AS ENUM ('NEW_REQUEST', 'EXTENSION');
CREATE TYPE reservation_kind  AS ENUM ('TRAVEL', 'STAY', 'TRAVEL_AND_STAY');
CREATE TYPE tr_status         AS ENUM (
  'AUTO_APPROVED',
  'PENDING_L1', 'PENDING_L2', 'PENDING_L3',
  'APPROVED', 'REJECTED', 'CANCELLED'
);

CREATE SEQUENCE travel_request_seq START 1;

-- TR-2026-00001
CREATE OR REPLACE FUNCTION next_travel_request_code()
RETURNS TEXT AS $$
DECLARE n BIGINT; y TEXT;
BEGIN
  y := TO_CHAR(NOW(), 'YYYY');
  n := nextval('travel_request_seq');
  RETURN 'TR-' || y || '-' || LPAD(n::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

CREATE TABLE travel_requests (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_code            VARCHAR(20) NOT NULL UNIQUE DEFAULT next_travel_request_code(),

  -- Submission ownership
  submitted_by_user_id    UUID NOT NULL REFERENCES users(id),
  submitted_on_behalf     BOOLEAN NOT NULL DEFAULT false,

  -- Subject employee (whose travel this is)
  traveler_employee_id    UUID REFERENCES employees(id),
  traveler_employee_code  VARCHAR(30),  -- denormalized PW0086 for fast lookup

  -- Cost centre override (only used when submitted_on_behalf = true)
  on_behalf_cost_centre   VARCHAR(50),

  -- Header
  urgency                 urgency_level NOT NULL DEFAULT 'NORMAL',
  reason_of_travel        VARCHAR(80)   NOT NULL,
  reason_of_travel_other  TEXT,         -- free text when reason_of_travel='Others'

  -- Snapshotted autofill fields (immutable post-submit)
  traveler_full_name      VARCHAR(150),
  traveler_email          VARCHAR(255),
  traveler_designation    VARCHAR(100),
  traveler_department_id  UUID REFERENCES departments(id),
  traveler_l1_email       VARCHAR(255),
  traveler_l2_email       VARCHAR(255),
  traveler_l3_email       VARCHAR(255),
  traveler_no_of_approvers SMALLINT NOT NULL DEFAULT 0,

  -- Request typing
  request_for             request_for_type NOT NULL,
  request_kind            request_kind     NOT NULL DEFAULT 'NEW_REQUEST',
  reservation_type        reservation_kind NOT NULL DEFAULT 'TRAVEL',
  needs_stay              BOOLEAN NOT NULL DEFAULT false,

  -- Extension fields (only when request_kind = EXTENSION)
  extension_start_date    DATE,
  initial_request_id      UUID REFERENCES travel_requests(id),

  -- Per-type detail panels (validated at app layer per request_for)
  student_details         JSONB,   -- { no_of_students, sheet_link, reason, remarks }
  guest_details           JSONB,   -- { name, hosting_department, email_id, purpose, remarks }
  new_member_details      JSONB,   -- { employee_name, candidate_id, email_id, joining_department, remarks }
  event_details           JSONB,   -- { event_name, no_of_members, sheet_link, reason, remarks }

  -- Traveler details (for non-PW_MEMBER requests, this is the actual passenger)
  traveler_details        JSONB,   -- { name, employee_id, contact_no, email_id, gender, dob, need_of_stay }

  -- Booking details
  booking_boarding        VARCHAR(150),
  booking_visiting_reason VARCHAR(200),
  booking_destination     VARCHAR(150),
  booking_departure_date  DATE,
  booking_preferred_time  VARCHAR(50),
  booking_purpose         TEXT,
  booking_remarks         TEXT,

  -- Stay details (only when needs_stay = true)
  stay_visiting_center    VARCHAR(150),
  stay_location           VARCHAR(150),
  stay_check_in           DATE,
  stay_check_out          DATE,
  stay_remarks            TEXT,

  -- Status / chain
  status                  tr_status NOT NULL DEFAULT 'PENDING_L1',
  current_level           SMALLINT  NOT NULL DEFAULT 1,  -- 1 / 2 / 3 / 0 if auto
  submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at              TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tr_status        ON travel_requests(status);
CREATE INDEX idx_tr_submitted_by  ON travel_requests(submitted_by_user_id);
CREATE INDEX idx_tr_traveler      ON travel_requests(traveler_employee_id);
CREATE INDEX idx_tr_request_code  ON travel_requests(request_code);
CREATE INDEX idx_tr_initial_req   ON travel_requests(initial_request_id);
CREATE INDEX idx_tr_dept          ON travel_requests(traveler_department_id);

-- Wire FK from history → travel_requests
ALTER TABLE department_budget_history
  ADD CONSTRAINT fk_dept_history_request
  FOREIGN KEY (travel_request_id) REFERENCES travel_requests(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────
-- 9. travel_request_approvals — one row per chain step
-- ────────────────────────────────────────────────────────────
CREATE TABLE travel_request_approvals (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  travel_request_id   UUID NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,
  level               SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 3),
  approver_email      VARCHAR(255) NOT NULL,
  approver_user_id    UUID REFERENCES users(id),  -- nullable until they log in
  status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED')),
  acted_at            TIMESTAMPTZ,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (travel_request_id, level)
);

CREATE INDEX idx_tra_request   ON travel_request_approvals(travel_request_id);
CREATE INDEX idx_tra_email     ON travel_request_approvals(LOWER(approver_email));
CREATE INDEX idx_tra_pending   ON travel_request_approvals(status, approver_email)
  WHERE status = 'PENDING';

-- ────────────────────────────────────────────────────────────
-- 10. Auto-update updated_at on new tables
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'department_budgets', 'budget_addition_requests', 'travel_requests'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
      CREATE TRIGGER trg_%I_updated_at
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t, t, t);
  END LOOP;
END;
$$;

COMMIT;
