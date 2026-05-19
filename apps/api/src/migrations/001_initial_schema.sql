-- ============================================================
-- Travel OS — Master Database Migration
-- Version: 001
-- Run: psql $DATABASE_URL -f 001_initial_schema.sql
-- ============================================================

BEGIN;

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite GIN indexes

-- ─── Enums ───────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM (
  'EMPLOYEE', 'L1_APPROVER', 'L2_APPROVER',
  'TRAVEL_DESK', 'FINANCE_ADMIN', 'SUPER_ADMIN'
);

CREATE TYPE grade_level AS ENUM ('L1', 'L2', 'L3', 'L4', 'L5');

CREATE TYPE trip_status AS ENUM (
  'DRAFT', 'SUBMITTED',
  'L1_PENDING', 'L1_APPROVED', 'L1_REJECTED',
  'L2_PENDING', 'L2_APPROVED', 'L2_REJECTED',
  'DESK_PENDING', 'DESK_APPROVED', 'DESK_REJECTED',
  'BOOKED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'CLOSED'
);

CREATE TYPE travel_mode AS ENUM (
  'FLIGHT', 'TRAIN', 'BUS', 'CAB', 'SELF_DRIVE'
);

CREATE TYPE approval_status AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'ESCALATED'
);

CREATE TYPE exception_type AS ENUM (
  'EMERGENCY_TRAVEL', 'BUSINESS_CRITICAL', 'CLIENT_REQUIREMENT',
  'LATE_BOOKING', 'COST_OVERRUN', 'MODE_UPGRADE', 'BUDGET_OVERRIDE'
);

CREATE TYPE invoice_status AS ENUM (
  'UPLOADED', 'PENDING_VALIDATION', 'VALIDATED',
  'REJECTED', 'GST_MISMATCH', 'DUPLICATE'
);

CREATE TYPE vendor_type AS ENUM (
  'AIRLINE', 'HOTEL', 'TRAIN', 'BUS', 'CAB'
);

CREATE TYPE erp_sync_status AS ENUM ('PENDING', 'SYNCED', 'FAILED');

CREATE TYPE app_theme AS ENUM (
  'corporate-light', 'deep-space-dark', 'forest-professional',
  'sunset-warm', 'arctic-blue'
);

-- ─── Table: departments ───────────────────────────────────────
CREATE TABLE departments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(20) NOT NULL UNIQUE,
  head_id       UUID,  -- FK added after employees table
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: cost_centres ──────────────────────────────────────
CREATE TABLE cost_centres (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(20) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Table: users ─────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            user_role NOT NULL DEFAULT 'EMPLOYEE',
  theme           app_theme NOT NULL DEFAULT 'deep-space-dark',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ─── Table: employees ─────────────────────────────────────────
CREATE TABLE employees (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  employee_code       VARCHAR(30) NOT NULL UNIQUE,
  name                VARCHAR(150) NOT NULL,
  designation         VARCHAR(100),
  department_id       UUID REFERENCES departments(id),
  cost_centre_id      UUID REFERENCES cost_centres(id),
  grade_level         grade_level,
  l1_approver_id      UUID REFERENCES employees(id),
  l2_approver_id      UUID REFERENCES employees(id),
  phone               VARCHAR(15),
  avatar_url          TEXT,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_user_id ON employees(user_id);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_grade ON employees(grade_level);
CREATE INDEX idx_employees_l1 ON employees(l1_approver_id);

-- ─── Add dept head FK now ─────────────────────────────────────
ALTER TABLE departments ADD CONSTRAINT fk_dept_head
  FOREIGN KEY (head_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ─── Table: refresh_tokens ────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ─── Table: budget_master ─────────────────────────────────────
CREATE TABLE budget_master (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cost_centre_id          UUID NOT NULL REFERENCES cost_centres(id),
  fiscal_year             VARCHAR(9) NOT NULL, -- e.g. '2024-25'
  allocated               NUMERIC(15,2) NOT NULL DEFAULT 0,
  consumed                NUMERIC(15,2) NOT NULL DEFAULT 0,
  supplementary_approved  NUMERIC(15,2) NOT NULL DEFAULT 0,
  last_updated_by         UUID REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cost_centre_id, fiscal_year),
  CONSTRAINT chk_consumed_not_negative CHECK (consumed >= 0),
  CONSTRAINT chk_allocated_positive CHECK (allocated >= 0)
);

CREATE INDEX idx_budget_cost_centre ON budget_master(cost_centre_id);

-- Computed column: remaining = allocated + supplementary - consumed
-- Handled as a generated virtual column via view
CREATE VIEW budget_master_view AS
  SELECT *,
    (allocated + supplementary_approved - consumed) AS remaining,
    CASE
      WHEN (allocated + supplementary_approved) = 0 THEN 0
      ELSE ROUND((consumed / NULLIF(allocated + supplementary_approved, 0)) * 100, 2)
    END AS utilization_pct
  FROM budget_master;

-- ─── Table: budget_history ────────────────────────────────────
CREATE TABLE budget_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id       UUID NOT NULL REFERENCES budget_master(id),
  action          VARCHAR(50) NOT NULL, -- 'ALLOCATE','CONSUME','SUPPLEMENT','ADJUST'
  amount          NUMERIC(15,2) NOT NULL,
  balance_after   NUMERIC(15,2) NOT NULL,
  actor_id        UUID REFERENCES users(id),
  note            TEXT,
  trip_id         UUID, -- FK added later
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_budget_history_budget ON budget_history(budget_id);

-- ─── Table: vendors ───────────────────────────────────────────
CREATE TABLE vendors (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(150) NOT NULL,
  type        vendor_type NOT NULL,
  gst_number  VARCHAR(20),
  score       NUMERIC(5,2) NOT NULL DEFAULT 50,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendors_type ON vendors(type);

-- ─── Table: vendor_rc_master ──────────────────────────────────
CREATE TABLE vendor_rc_master (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  route           VARCHAR(200) NOT NULL,
  vehicle_type    VARCHAR(100),
  rate            NUMERIC(10,2) NOT NULL,
  validity        DATE NOT NULL,
  gst_number      VARCHAR(20),
  file_url        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_rc_vendor ON vendor_rc_master(vendor_id);
CREATE INDEX idx_vendor_rc_route ON vendor_rc_master USING gin(route gin_trgm_ops);

-- ─── Table: vendor_scraped_rates ──────────────────────────────
CREATE TABLE vendor_scraped_rates (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source                VARCHAR(50) NOT NULL,      -- 'makemytrip','cleartrip', etc.
  travel_type           travel_mode NOT NULL,
  origin                VARCHAR(100) NOT NULL,
  destination           VARCHAR(100) NOT NULL,
  travel_date           DATE NOT NULL,
  vendor_name           VARCHAR(150) NOT NULL,
  rate                  NUMERIC(10,2) NOT NULL,
  cabin_class           VARCHAR(50),               -- ECONOMY, BUSINESS, etc.
  room_type             VARCHAR(100),
  availability_count    INTEGER,
  scraped_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_expires_at        TIMESTAMPTZ NOT NULL,
  trip_request_id       UUID,                      -- FK added after trips
  is_cheapest           BOOLEAN NOT NULL DEFAULT false,
  is_policy_compliant   BOOLEAN NOT NULL DEFAULT true,
  price_delta_vs_prev   NUMERIC(6,2)               -- % change
);

CREATE INDEX idx_scraped_rates_route ON vendor_scraped_rates(origin, destination, travel_date);
CREATE INDEX idx_scraped_rates_ttl ON vendor_scraped_rates(ttl_expires_at);
CREATE INDEX idx_scraped_rates_trip ON vendor_scraped_rates(trip_request_id);

-- ─── Table: trips ─────────────────────────────────────────────
CREATE TABLE trips (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_code                 VARCHAR(30) NOT NULL UNIQUE, -- TRP-2024-ENG-00001
  employee_id               UUID NOT NULL REFERENCES employees(id),
  status                    trip_status NOT NULL DEFAULT 'DRAFT',
  travel_type               travel_mode NOT NULL,
  origin                    VARCHAR(150) NOT NULL,
  destination               VARCHAR(150) NOT NULL,
  departure_date            DATE NOT NULL,
  return_date               DATE,
  is_round_trip             BOOLEAN NOT NULL DEFAULT false,
  purpose_of_travel         TEXT NOT NULL,
  budget_cap                NUMERIC(10,2) NOT NULL,
  actual_cost               NUMERIC(10,2),
  exception_tag             exception_type,
  additional_travelers      UUID[] DEFAULT '{}',     -- Array of employee IDs
  stay_required             BOOLEAN NOT NULL DEFAULT false,
  stay_check_in             DATE,
  stay_check_out            DATE,
  preferred_hotel_locality  VARCHAR(150),
  advance_booking_days      INTEGER NOT NULL DEFAULT 0,
  policy_compliant          BOOLEAN NOT NULL DEFAULT true,
  savings                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  missed_savings            NUMERIC(10,2) NOT NULL DEFAULT 0,
  submitted_at              TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  erp_sync_status           erp_sync_status NOT NULL DEFAULT 'PENDING',
  erp_synced_at             TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trips_employee ON trips(employee_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_dates ON trips(departure_date);
CREATE INDEX idx_trips_code ON trips(trip_code);
CREATE INDEX idx_trips_created ON trips(created_at DESC);

-- Add FK for scraped rates → trips
ALTER TABLE vendor_scraped_rates ADD CONSTRAINT fk_scraped_trip
  FOREIGN KEY (trip_request_id) REFERENCES trips(id) ON DELETE SET NULL;

-- Add FK for budget history → trips
ALTER TABLE budget_history ADD CONSTRAINT fk_budget_history_trip
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL;

-- ─── Table: approvals ─────────────────────────────────────────
CREATE TABLE approvals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  approver_id     UUID NOT NULL REFERENCES employees(id),
  level           SMALLINT NOT NULL CHECK (level IN (1, 2, 3)),
  status          approval_status NOT NULL DEFAULT 'PENDING',
  comment         TEXT,
  conditions      TEXT,
  sla_deadline    TIMESTAMPTZ NOT NULL,  -- trip submission + 24h
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, level)
);

CREATE INDEX idx_approvals_trip ON approvals(trip_id);
CREATE INDEX idx_approvals_approver ON approvals(approver_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_sla ON approvals(sla_deadline) WHERE status = 'PENDING';

-- ─── Table: exceptions ────────────────────────────────────────
CREATE TABLE exceptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type            exception_type NOT NULL,
  reason          TEXT NOT NULL CHECK (LENGTH(reason) >= 50),
  document_url    TEXT,
  logged_by       UUID NOT NULL REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exceptions_trip ON exceptions(trip_id);
CREATE INDEX idx_exceptions_type ON exceptions(type);

-- ─── Table: bookings ──────────────────────────────────────────
CREATE TABLE bookings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_code        VARCHAR(30) NOT NULL UNIQUE, -- BKG-2024-XXXXX
  trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
  vendor_id           UUID NOT NULL REFERENCES vendors(id),
  booking_type        vendor_type NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  savings_vs_cheapest NUMERIC(10,2) NOT NULL DEFAULT 0,
  invoice_uploaded    BOOLEAN NOT NULL DEFAULT false,
  gst_validated       BOOLEAN NOT NULL DEFAULT false,
  erp_sync_status     erp_sync_status NOT NULL DEFAULT 'PENDING',
  erp_synced_at       TIMESTAMPTZ,
  confirmed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_trip ON bookings(trip_id);
CREATE INDEX idx_bookings_vendor ON bookings(vendor_id);

-- ─── Table: invoices ──────────────────────────────────────────
CREATE TABLE invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  file_url          TEXT NOT NULL,
  gst_number        VARCHAR(20),
  amount            NUMERIC(10,2) NOT NULL,
  vendor_name       VARCHAR(150),
  invoice_date      DATE,
  status            invoice_status NOT NULL DEFAULT 'UPLOADED',
  validated_at      TIMESTAMPTZ,
  validator_id      UUID REFERENCES users(id),
  rejection_reason  TEXT,
  is_duplicate      BOOLEAN NOT NULL DEFAULT false,
  gst_recoverable   BOOLEAN NOT NULL DEFAULT false,
  ocr_raw_data      JSONB,                          -- Raw OCR output stored for audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_booking ON invoices(booking_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_gst ON invoices(gst_number);

-- ─── Table: vendor_scores ─────────────────────────────────────
CREATE TABLE vendor_scores (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id               UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  price_competitiveness   NUMERIC(5,2) NOT NULL DEFAULT 0, -- max 25
  complaint_rate_score    NUMERIC(5,2) NOT NULL DEFAULT 0, -- max 25
  resolution_time_score   NUMERIC(5,2) NOT NULL DEFAULT 0, -- max 20
  booking_success_score   NUMERIC(5,2) NOT NULL DEFAULT 0, -- max 20
  policy_compliance_score NUMERIC(5,2) NOT NULL DEFAULT 0, -- max 10
  total_score             NUMERIC(5,2) GENERATED ALWAYS AS (
    price_competitiveness + complaint_rate_score +
    resolution_time_score + booking_success_score +
    policy_compliance_score
  ) STORED,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id)
);

-- ─── Table: feedback ──────────────────────────────────────────
CREATE TABLE feedback (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE RESTRICT,
  vendor_id     UUID NOT NULL REFERENCES vendors(id),
  employee_id   UUID NOT NULL REFERENCES employees(id),
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  issue_type    VARCHAR(100),
  comment       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  ticket_id     VARCHAR(30) NOT NULL UNIQUE, -- TKT-2024-XXXXX
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, vendor_id, employee_id)
);

CREATE INDEX idx_feedback_trip ON feedback(trip_id);
CREATE INDEX idx_feedback_vendor ON feedback(vendor_id);
CREATE INDEX idx_feedback_status ON feedback(status);

-- ─── Table: audit_log ─────────────────────────────────────────
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(100) NOT NULL,  -- 'TRIP_APPROVED', 'BUDGET_OVERRIDE', etc.
  entity_type   VARCHAR(50) NOT NULL,   -- 'TRIP', 'BUDGET', 'VENDOR', etc.
  entity_id     UUID NOT NULL,
  old_value     JSONB,
  new_value     JSONB,
  ip_address    INET,
  user_agent    TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_log(action);

-- ─── Table: notifications ─────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,   -- 'APPROVAL_NEEDED','BUDGET_ALERT','PRICE_DROP' etc.
  title       VARCHAR(200) NOT NULL,
  body        TEXT NOT NULL,
  entity_type VARCHAR(50),
  entity_id   UUID,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ─── Table: supplementary_requests ───────────────────────────
CREATE TABLE supplementary_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id       UUID NOT NULL REFERENCES budget_master(id),
  requested_by    UUID NOT NULL REFERENCES employees(id),
  amount          NUMERIC(15,2) NOT NULL,
  reason          TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','FINANCE_APPROVED','SUPER_APPROVED','REJECTED')),
  finance_note    TEXT,
  finance_actor   UUID REFERENCES users(id),
  finance_at      TIMESTAMPTZ,
  super_note      TEXT,
  super_actor     UUID REFERENCES users(id),
  super_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Trip Code Sequence ───────────────────────────────────────
CREATE SEQUENCE trip_code_seq START 1;
CREATE SEQUENCE booking_code_seq START 1;
CREATE SEQUENCE ticket_id_seq START 1;

-- ─── Auto-update updated_at trigger ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','employees','departments','cost_centres',
    'budget_master','vendors','vendor_rc_master',
    'trips','approvals','bookings','invoices',
    'feedback','supplementary_requests'
  ] LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t);
  END LOOP;
END;
$$;

-- ─── Auto-audit trigger ────────────────────────────────────────
-- Attach to critical tables: trips, approvals, budget_master, exceptions
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (actor_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (
    current_setting('app.current_user_id', true)::UUID,
    TG_OP || '_' || UPPER(TG_TABLE_NAME),
    UPPER(TG_TABLE_NAME),
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Never let audit failure block main operation
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['trips','approvals','budget_master','exceptions'] LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%I_audit
      AFTER INSERT OR UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
    ', t, t);
  END LOOP;
END;
$$;

-- ─── Budget consumption trigger ───────────────────────────────
-- Auto-deduct from budget when trip is BOOKED
CREATE OR REPLACE FUNCTION sync_budget_on_trip_book()
RETURNS TRIGGER AS $$
DECLARE
  v_cost_centre_id UUID;
  v_fy             VARCHAR(9);
  v_budget_id      UUID;
BEGIN
  -- Only act when status changes TO 'BOOKED'
  IF NEW.status = 'BOOKED' AND OLD.status != 'BOOKED' AND NEW.actual_cost IS NOT NULL THEN
    SELECT e.cost_centre_id INTO v_cost_centre_id
    FROM employees e WHERE e.id = NEW.employee_id;

    v_fy := TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || TO_CHAR(CURRENT_DATE + INTERVAL '1 year', 'YY');

    SELECT id INTO v_budget_id FROM budget_master
    WHERE cost_centre_id = v_cost_centre_id AND fiscal_year = v_fy;

    IF v_budget_id IS NOT NULL THEN
      UPDATE budget_master
      SET consumed = consumed + NEW.actual_cost
      WHERE id = v_budget_id;

      INSERT INTO budget_history (budget_id, action, amount, balance_after, trip_id)
      SELECT v_budget_id, 'CONSUME', NEW.actual_cost,
             (allocated + supplementary_approved - consumed), NEW.id
      FROM budget_master WHERE id = v_budget_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trips_budget_sync
AFTER UPDATE ON trips
FOR EACH ROW EXECUTE FUNCTION sync_budget_on_trip_book();

-- ─── Views ────────────────────────────────────────────────────

-- Pending approvals with SLA status
CREATE VIEW pending_approvals_view AS
SELECT
  a.*,
  t.trip_code,
  t.origin,
  t.destination,
  t.departure_date,
  t.budget_cap,
  e.name AS employee_name,
  e.grade_level,
  CASE
    WHEN a.sla_deadline < NOW() THEN 'OVERDUE'
    WHEN a.sla_deadline < NOW() + INTERVAL '4 hours' THEN 'DUE_SOON'
    ELSE 'ON_TIME'
  END AS sla_status,
  EXTRACT(EPOCH FROM (a.sla_deadline - NOW()))/3600 AS hours_remaining
FROM approvals a
JOIN trips t ON t.id = a.trip_id
JOIN employees e ON e.id = t.employee_id
WHERE a.status = 'PENDING';

-- Organisation spend summary
CREATE VIEW org_spend_summary AS
SELECT
  d.name AS department,
  cc.code AS cost_centre,
  bm.fiscal_year,
  bm.allocated,
  bm.consumed,
  (bm.allocated + bm.supplementary_approved - bm.consumed) AS remaining,
  ROUND((bm.consumed / NULLIF(bm.allocated + bm.supplementary_approved, 0)) * 100, 2) AS utilization_pct,
  COUNT(DISTINCT t.id) AS trip_count,
  COALESCE(SUM(t.savings), 0) AS total_savings,
  COALESCE(SUM(t.missed_savings), 0) AS total_missed_savings
FROM budget_master bm
JOIN cost_centres cc ON cc.id = bm.cost_centre_id
JOIN departments d ON d.id = cc.department_id
LEFT JOIN employees emp ON emp.cost_centre_id = cc.id
LEFT JOIN trips t ON t.employee_id = emp.id
  AND t.status IN ('BOOKED','COMPLETED','CLOSED')
GROUP BY d.name, cc.code, bm.fiscal_year, bm.allocated, bm.consumed, bm.supplementary_approved;

COMMIT;

-- ─── Seed: Initial Super Admin + Demo Data ────────────────────
-- Run separately: psql $DATABASE_URL -f 001b_seed.sql
