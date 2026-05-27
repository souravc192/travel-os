-- ============================================================
-- Travel OS — Phase 4: Bookings + Policy Knowledge Base
-- Depends on: 003_phase3_overhaul.sql
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Booking enums
-- ────────────────────────────────────────────────────────────
CREATE TYPE booking_type   AS ENUM ('FLIGHT', 'TRAIN', 'BUS', 'CAB', 'HOTEL', 'OTHER');
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED');

-- ────────────────────────────────────────────────────────────
-- 2. bookings table
--    1 travel_request → N bookings (flight + hotel + cab etc.)
-- ────────────────────────────────────────────────────────────
CREATE TABLE bookings (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  travel_request_id           UUID NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,

  booking_type                booking_type   NOT NULL,
  booking_status              booking_status NOT NULL DEFAULT 'PENDING',

  vendor_name                 VARCHAR(150) NOT NULL,
  amount                      NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  currency                    CHAR(3) NOT NULL DEFAULT 'INR',
  booking_reference           VARCHAR(80),     -- PNR / vendor ref
  booking_date                DATE NOT NULL,   -- when the booking was made

  -- Transport-specific
  departure_at                TIMESTAMPTZ,
  return_at                   TIMESTAMPTZ,

  -- Hotel-specific
  check_in_date               DATE,
  check_out_date              DATE,

  -- Invoice attachment
  invoice_path                TEXT,
  invoice_original_filename   VARCHAR(255),
  invoice_uploaded_at         TIMESTAMPTZ,

  notes                       TEXT,

  -- Cancellation
  cancellation_fee            NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (cancellation_fee >= 0),
  cancelled_at                TIMESTAMPTZ,
  cancelled_by                UUID REFERENCES users(id),
  cancellation_reason         TEXT,

  -- Audit
  department_budget_id        UUID REFERENCES department_budgets(id),  -- snapshot
  consumed_amount             NUMERIC(15,2) NOT NULL DEFAULT 0,        -- what we actually debited

  created_by                  UUID NOT NULL REFERENCES users(id),
  confirmed_at                TIMESTAMPTZ,
  confirmed_by                UUID REFERENCES users(id),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_cancel_fee_le_amount CHECK (cancellation_fee <= amount)
);

CREATE INDEX idx_bookings_request    ON bookings(travel_request_id);
CREATE INDEX idx_bookings_status     ON bookings(booking_status);
CREATE INDEX idx_bookings_type       ON bookings(booking_type);
CREATE INDEX idx_bookings_created_at ON bookings(created_at DESC);

-- Updated-at trigger
DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 3. Extend department_budget_history actions to include REFUND
--    (action is VARCHAR — no enum migration needed, just docs)
-- ────────────────────────────────────────────────────────────
-- Existing actions: ALLOCATE / CONSUME / SUPPLEMENT / ADJUST
-- New action:       REFUND  (recorded on booking cancellation)

-- Add FK from history → bookings (NULLable; existing rows stay null)
ALTER TABLE department_budget_history
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dept_history_booking ON department_budget_history(booking_id);

-- ────────────────────────────────────────────────────────────
-- 4. policies + policy_versions
-- ────────────────────────────────────────────────────────────
CREATE TABLE policies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category      VARCHAR(60)  NOT NULL,            -- 'Flight Policy', 'Hotel Policy', etc.
  title         VARCHAR(150) NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_policies_category_title
  ON policies (LOWER(category), LOWER(title));

CREATE INDEX idx_policies_active   ON policies(is_active);
CREATE INDEX idx_policies_category ON policies(category);

DROP TRIGGER IF EXISTS trg_policies_updated_at ON policies;
CREATE TRIGGER trg_policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE policy_versions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id           UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version_number      INT  NOT NULL,
  source_filename     VARCHAR(255) NOT NULL,
  source_pdf_path     TEXT         NOT NULL,
  parsed_tree         JSONB        NOT NULL,    -- hierarchical card tree (see pdf-parser)
  raw_text            TEXT,                     -- the extracted plain text (audit / re-parse)
  is_published        BOOLEAN NOT NULL DEFAULT false,
  uploaded_by         UUID REFERENCES users(id),
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at        TIMESTAMPTZ,
  published_by        UUID REFERENCES users(id),
  UNIQUE (policy_id, version_number)
);

CREATE INDEX idx_policy_versions_policy    ON policy_versions(policy_id);
CREATE INDEX idx_policy_versions_published ON policy_versions(policy_id, is_published)
  WHERE is_published = true;

-- Only one published version per policy at a time
CREATE UNIQUE INDEX uq_one_published_per_policy
  ON policy_versions(policy_id)
  WHERE is_published = true;

COMMIT;
