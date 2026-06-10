-- ============================================================
-- Travel OS — Phase 5D: Feedback & Complaint module
-- Depends on: 007_phase5c_reimbursement.sql
--
-- Design (locked in earlier):
--   F1 = (b) Travel Team manually marks a travel request COMPLETED.
--   F2 = Feedback can be submitted up to 30 days after completion, then
--        the form locks but stays viewable (window enforced in the app).
--   F3 = Travel Desk assigns a Resolution Owner from a user picker.
--        Default SLAs: CRITICAL 4h, HIGH 24h, MEDIUM 72h, LOW 7d.
--   F4 = Vendor-wise complaint trend — vendor stored as a denormalised
--        string snapshot so we can aggregate even after a booking is gone.
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
-- so the enum addition lives above the BEGIN/COMMIT block (same pattern
-- as 005_phase5a).
-- ============================================================

-- ── COMPLETED is a new terminal state on the travel-request FSM ──
ALTER TYPE tr_status ADD VALUE IF NOT EXISTS 'COMPLETED';

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Travel-request completion bookkeeping
-- ────────────────────────────────────────────────────────────
ALTER TABLE travel_requests
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id);

-- ────────────────────────────────────────────────────────────
-- 2. Enums
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE complaint_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_status AS ENUM (
    'OPEN',          -- raised, not yet assigned
    'ASSIGNED',      -- Travel Desk assigned a Resolution Owner
    'IN_PROGRESS',   -- Resolution Owner working it
    'RESOLVED',      -- Resolution Owner marked resolved
    'CLOSED'         -- Travel Desk / raiser closed it out
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE complaint_update_kind AS ENUM ('COMMENT', 'STATUS_CHANGE', 'ASSIGNMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────
-- 3. feedback (one row per COMPLETED travel request)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  travel_request_id     UUID NOT NULL UNIQUE REFERENCES travel_requests(id) ON DELETE CASCADE,
  submitted_by_user_id  UUID NOT NULL REFERENCES users(id),

  -- Claimant snapshot for fast list rendering
  employee_id           UUID REFERENCES employees(id),
  employee_name         VARCHAR(150),
  department_id         UUID REFERENCES departments(id),

  -- Ratings (1–5). overall is required; aspect ratings are optional.
  overall_rating        SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  booking_rating        SMALLINT CHECK (booking_rating       BETWEEN 1 AND 5),
  accommodation_rating  SMALLINT CHECK (accommodation_rating BETWEEN 1 AND 5),
  transport_rating      SMALLINT CHECK (transport_rating     BETWEEN 1 AND 5),
  travel_desk_rating    SMALLINT CHECK (travel_desk_rating   BETWEEN 1 AND 5),

  would_recommend       BOOLEAN,

  liked                 TEXT,
  improvements          TEXT,
  comments              TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_travel_req  ON feedback(travel_request_id);
CREATE INDEX IF NOT EXISTS idx_feedback_department  ON feedback(department_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at  ON feedback(created_at DESC);

DROP TRIGGER IF EXISTS trg_feedback_updated_at ON feedback;
CREATE TRIGGER trg_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 4. Complaint code sequence (CMP-YYYY-NNNNN)
-- ────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS complaint_seq START 1;

CREATE OR REPLACE FUNCTION next_complaint_code() RETURNS TEXT AS $$
DECLARE n BIGINT; y TEXT;
BEGIN
  y := TO_CHAR(NOW(), 'YYYY');
  n := nextval('complaint_seq');
  RETURN 'CMP-' || y || '-' || LPAD(n::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 5. complaints
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_code          VARCHAR(20) NOT NULL UNIQUE DEFAULT next_complaint_code(),

  -- Raiser
  raised_by_user_id       UUID NOT NULL REFERENCES users(id),
  employee_id             UUID REFERENCES employees(id),
  employee_name           VARCHAR(150),
  department_id           UUID REFERENCES departments(id),

  -- Optional links
  travel_request_id       UUID REFERENCES travel_requests(id) ON DELETE SET NULL,
  travel_request_code     VARCHAR(20),
  booking_id              UUID REFERENCES bookings(id) ON DELETE SET NULL,
  -- Denormalised vendor (for F4 vendor-wise analytics even after booking removal)
  vendor_name             VARCHAR(150),

  -- Classification (category is a free string; UI offers a curated list)
  category                VARCHAR(80) NOT NULL,
  priority                complaint_priority NOT NULL DEFAULT 'MEDIUM',
  status                  complaint_status   NOT NULL DEFAULT 'OPEN',

  subject                 VARCHAR(160) NOT NULL,
  description             TEXT NOT NULL,

  -- SLA — computed from priority at creation time
  sla_due_at              TIMESTAMPTZ,

  -- Assignment (Travel Desk → Resolution Owner)
  resolution_owner_user_id UUID REFERENCES users(id),
  assigned_by             UUID REFERENCES users(id),
  assigned_at             TIMESTAMPTZ,

  -- Resolution
  resolution_note         TEXT,
  resolved_by             UUID REFERENCES users(id),
  resolved_at             TIMESTAMPTZ,

  -- Closure
  closed_by               UUID REFERENCES users(id),
  closed_at               TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_status       ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_priority     ON complaints(priority);
CREATE INDEX IF NOT EXISTS idx_complaints_raiser       ON complaints(raised_by_user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_owner        ON complaints(resolution_owner_user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_travel_req   ON complaints(travel_request_id);
CREATE INDEX IF NOT EXISTS idx_complaints_vendor       ON complaints(vendor_name);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at   ON complaints(created_at DESC);

DROP TRIGGER IF EXISTS trg_complaints_updated_at ON complaints;
CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 6. complaint_updates (thread / audit log)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaint_updates (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id      UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  author_user_id    UUID NOT NULL REFERENCES users(id),
  author_name       VARCHAR(150),
  kind              complaint_update_kind NOT NULL DEFAULT 'COMMENT',
  body              TEXT NOT NULL,
  -- For STATUS_CHANGE rows: capture the transition for the timeline
  from_status       complaint_status,
  to_status         complaint_status,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaint_updates_complaint
  ON complaint_updates(complaint_id, created_at);

COMMIT;
