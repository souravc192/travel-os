-- ============================================================
-- Travel OS — Phase 5B: Multi-segment travel
--
-- Replaces the flat single-booking shape on travel_requests with:
--   • travel_segments        — one row per leg of the journey
--   • accommodation_segments — one row per stay
-- Bookings can now optionally link back to either kind of segment.
--
-- Depends on: 005_phase5a_urgency_booking.sql
--
-- Per design call (M1): existing travel_requests data is dummy, so the
-- request rows are wiped before the schema changes. Approvals, bookings
-- and budget-history rows fan-out via ON DELETE CASCADE / SET NULL.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 0. Wipe dummy data so we can drop legacy columns cleanly
-- ────────────────────────────────────────────────────────────
TRUNCATE travel_requests CASCADE;

-- ────────────────────────────────────────────────────────────
-- 1. Enums
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'travel_mode_seg') THEN
    CREATE TYPE travel_mode_seg AS ENUM
      ('FLIGHT','TRAIN','BUS','CAB','SELF_DRIVE','TRAVELLER','OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hotel_requirement') THEN
    CREATE TYPE hotel_requirement AS ENUM
      ('SHARING','NON_SHARING','SINGLE','DOUBLE','SUITE','SERVICE_APARTMENT','OTHER');
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────
-- 2. travel_segments (one row per journey leg)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS travel_segments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  travel_request_id   UUID NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,
  sequence_no         INT  NOT NULL,                       -- 1, 2, 3 …
  from_location       VARCHAR(150) NOT NULL,
  to_location         VARCHAR(150) NOT NULL,
  travel_date         DATE         NOT NULL,
  preferred_time      VARCHAR(50),
  travel_mode         travel_mode_seg NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (travel_request_id, sequence_no),
  CONSTRAINT chk_seg_locs_diff CHECK (LOWER(from_location) <> LOWER(to_location))
);

CREATE INDEX IF NOT EXISTS idx_travel_segments_request ON travel_segments(travel_request_id);
CREATE INDEX IF NOT EXISTS idx_travel_segments_date    ON travel_segments(travel_date);

-- ────────────────────────────────────────────────────────────
-- 3. accommodation_segments (one row per stay)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accommodation_segments (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  travel_request_id        UUID NOT NULL REFERENCES travel_requests(id) ON DELETE CASCADE,
  sequence_no              INT NOT NULL,
  city                     VARCHAR(150) NOT NULL,
  center                   VARCHAR(150),               -- visiting centre / branch
  check_in_date            DATE NOT NULL,
  check_out_date           DATE NOT NULL,
  hotel_requirement        hotel_requirement NOT NULL DEFAULT 'NON_SHARING',
  hotel_requirement_other  TEXT,                       -- free text when hotel_requirement='OTHER'
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (travel_request_id, sequence_no),
  CONSTRAINT chk_acc_dates CHECK (check_out_date > check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_accommodation_segments_request ON accommodation_segments(travel_request_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_segments_dates   ON accommodation_segments(check_in_date);

-- ────────────────────────────────────────────────────────────
-- 4. Bookings ↔ segment loose link (M2 (a))
-- ────────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS travel_segment_id        UUID REFERENCES travel_segments(id)        ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accommodation_segment_id UUID REFERENCES accommodation_segments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_travel_segment        ON bookings(travel_segment_id);
CREATE INDEX IF NOT EXISTS idx_bookings_accommodation_segment ON bookings(accommodation_segment_id);

-- ────────────────────────────────────────────────────────────
-- 5. Drop legacy flat fields on travel_requests
--    (dummy rows already truncated above)
-- ────────────────────────────────────────────────────────────
ALTER TABLE travel_requests
  DROP COLUMN IF EXISTS booking_boarding,
  DROP COLUMN IF EXISTS booking_visiting_reason,
  DROP COLUMN IF EXISTS booking_destination,
  DROP COLUMN IF EXISTS booking_departure_date,
  DROP COLUMN IF EXISTS booking_preferred_time,
  DROP COLUMN IF EXISTS booking_purpose,
  DROP COLUMN IF EXISTS booking_remarks,
  DROP COLUMN IF EXISTS stay_visiting_center,
  DROP COLUMN IF EXISTS stay_location,
  DROP COLUMN IF EXISTS stay_check_in,
  DROP COLUMN IF EXISTS stay_check_out,
  DROP COLUMN IF EXISTS stay_remarks;

-- Single request-level free-text fields replace the cluster above
ALTER TABLE travel_requests
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS remarks TEXT;

-- Convenience: cached MIN(travel_date) across all segments, used for urgency
-- snapshots and quick listing. Maintained by the application layer on
-- create — not a generated column (no easy cross-row generated expression).
ALTER TABLE travel_requests
  ADD COLUMN IF NOT EXISTS earliest_travel_date DATE;

CREATE INDEX IF NOT EXISTS idx_tr_earliest_travel_date
  ON travel_requests(earliest_travel_date)
  WHERE earliest_travel_date IS NOT NULL;

COMMIT;
