-- ============================================================
-- Travel OS — Phase 5C: Reimbursement module
-- Depends on: 006_phase5b_multi_segment.sql
--
-- Design (locked in earlier):
--   • Reimbursements do NOT debit the department budget — they are tracked
--     only and paid out-of-band (R1 = (C)).
--   • No approval chain in v1 (R2). Status is a simple FSM:
--       DRAFT → SUBMITTED → (APPROVED | REJECTED) → PAID
--     Admin / Owner flip the states. Chain wiring lives in a future phase.
--   • Two kinds: TRAVEL_LINKED (FK to travel_requests) and STANDALONE.
--   • N items per claim — each row has its own category + amount + receipt.
--   • Categories are admin-configurable.
--   • INR only for v1.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Enums
-- ────────────────────────────────────────────────────────────
CREATE TYPE reimbursement_kind   AS ENUM ('TRAVEL_LINKED', 'STANDALONE');
CREATE TYPE reimbursement_status AS ENUM (
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'
);

-- ────────────────────────────────────────────────────────────
-- 2. Admin-configurable category list
-- ────────────────────────────────────────────────────────────
CREATE TABLE reimbursement_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(80)  NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_reimbursement_categories_name
  ON reimbursement_categories (LOWER(name));

DROP TRIGGER IF EXISTS trg_reimbursement_categories_updated_at ON reimbursement_categories;
CREATE TRIGGER trg_reimbursement_categories_updated_at
  BEFORE UPDATE ON reimbursement_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed default categories (R5 hints)
INSERT INTO reimbursement_categories (name, description) VALUES
  ('Taxi',                'Auto / Uber / Ola / local taxi'),
  ('Local Conveyance',    'Metro / bus / non-taxi local transport'),
  ('Food',                'Meals during travel or business hours'),
  ('Lodging Top-Up',      'Out-of-pocket hotel charges not covered by booking'),
  ('Client Meeting',      'Meeting hosting, coffee, snacks'),
  ('Local Business',      'Misc business spend in the city of operation'),
  ('Stationery',          'Office stationery / printing'),
  ('Communication',       'Phone / data top-ups during travel'),
  ('Miscellaneous',       'Anything that doesn''t fit other categories')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. Reimbursement code sequence (RM-YYYY-NNNNN)
-- ────────────────────────────────────────────────────────────
CREATE SEQUENCE reimbursement_seq START 1;

CREATE OR REPLACE FUNCTION next_reimbursement_code() RETURNS TEXT AS $$
DECLARE n BIGINT; y TEXT;
BEGIN
  y := TO_CHAR(NOW(), 'YYYY');
  n := nextval('reimbursement_seq');
  RETURN 'RM-' || y || '-' || LPAD(n::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- 4. reimbursements (header)
-- ────────────────────────────────────────────────────────────
CREATE TABLE reimbursements (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reimbursement_code    VARCHAR(20) NOT NULL UNIQUE DEFAULT next_reimbursement_code(),

  kind                  reimbursement_kind   NOT NULL,
  status                reimbursement_status NOT NULL DEFAULT 'DRAFT',

  -- Who's claiming
  submitted_by_user_id  UUID NOT NULL REFERENCES users(id),
  employee_id           UUID REFERENCES employees(id),
  employee_code         VARCHAR(30),
  -- Snapshot for fast list rendering
  employee_name         VARCHAR(150),
  department_id         UUID REFERENCES departments(id),

  -- Travel-linked
  travel_request_id     UUID REFERENCES travel_requests(id) ON DELETE SET NULL,
  travel_request_code   VARCHAR(20),  -- denormalised (FK above auto-nulls on delete)

  -- Header
  title                 VARCHAR(150) NOT NULL,
  description           TEXT,
  currency              CHAR(3) NOT NULL DEFAULT 'INR',

  -- Totals (maintained from items by the app)
  total_claimed         NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_approved        NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Decision (Admin / Owner)
  decision_note         TEXT,
  decided_by            UUID REFERENCES users(id),
  decided_at            TIMESTAMPTZ,

  -- Payout (out-of-band)
  paid_reference        VARCHAR(80),
  paid_by               UUID REFERENCES users(id),
  paid_at               TIMESTAMPTZ,

  submitted_at          TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_kind_travel_link CHECK (
    (kind = 'TRAVEL_LINKED' AND travel_request_id IS NOT NULL) OR
    (kind = 'STANDALONE'    AND travel_request_id IS NULL)
  )
);

CREATE INDEX idx_reimb_status        ON reimbursements(status);
CREATE INDEX idx_reimb_submitter     ON reimbursements(submitted_by_user_id);
CREATE INDEX idx_reimb_travel_req    ON reimbursements(travel_request_id);
CREATE INDEX idx_reimb_created_at    ON reimbursements(created_at DESC);
CREATE INDEX idx_reimb_department    ON reimbursements(department_id);

DROP TRIGGER IF EXISTS trg_reimbursements_updated_at ON reimbursements;
CREATE TRIGGER trg_reimbursements_updated_at
  BEFORE UPDATE ON reimbursements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 5. reimbursement_items (N per claim)
-- ────────────────────────────────────────────────────────────
CREATE TABLE reimbursement_items (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reimbursement_id            UUID NOT NULL REFERENCES reimbursements(id) ON DELETE CASCADE,
  sequence_no                 INT  NOT NULL,
  category_id                 UUID NOT NULL REFERENCES reimbursement_categories(id),

  expense_date                DATE NOT NULL,
  description                 VARCHAR(200) NOT NULL,
  claimed_amount              NUMERIC(15,2) NOT NULL CHECK (claimed_amount >= 0),

  -- Approved amount can be less than claimed (partial approval).
  -- Stays NULL until Admin/Owner decides.
  approved_amount             NUMERIC(15,2),

  -- Receipt file (one per item)
  receipt_path                TEXT,
  receipt_original_filename   VARCHAR(255),
  receipt_uploaded_at         TIMESTAMPTZ,

  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (reimbursement_id, sequence_no),
  CONSTRAINT chk_item_approved_le_claimed
    CHECK (approved_amount IS NULL OR approved_amount <= claimed_amount)
);

CREATE INDEX idx_reimb_items_header ON reimbursement_items(reimbursement_id);
CREATE INDEX idx_reimb_items_cat    ON reimbursement_items(category_id);

DROP TRIGGER IF EXISTS trg_reimbursement_items_updated_at ON reimbursement_items;
CREATE TRIGGER trg_reimbursement_items_updated_at
  BEFORE UPDATE ON reimbursement_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
