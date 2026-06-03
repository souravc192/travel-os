-- ============================================================
-- Travel OS — Phase 5A
--   1. Add EMERGENCY to urgency_level enum
--   2. Add TRAVELLER + CONFERENCE_HALL to booking_type enum
--   3. Add venue_capacity to bookings (conference hall use case)
--   4. Add expansion_center_id to travel_requests (only used when
--      traveler's department is "Expansion")
-- Depends on: 004_phase4_bookings_policy.sql
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block
-- when committing immediately after, so the enum additions live outside
-- the BEGIN/COMMIT block.
-- ============================================================

ALTER TYPE urgency_level ADD VALUE IF NOT EXISTS 'EMERGENCY';
ALTER TYPE booking_type  ADD VALUE IF NOT EXISTS 'TRAVELLER';
ALTER TYPE booking_type  ADD VALUE IF NOT EXISTS 'CONFERENCE_HALL';

BEGIN;

-- ────────────────────────────────────────────────────────────
-- venue_capacity for conference hall bookings
-- ────────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS venue_capacity INT;

-- ────────────────────────────────────────────────────────────
-- expansion_center_id for travel requests where department = 'Expansion'
-- ────────────────────────────────────────────────────────────
ALTER TABLE travel_requests
  ADD COLUMN IF NOT EXISTS expansion_center_id VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_tr_expansion_center
  ON travel_requests(expansion_center_id)
  WHERE expansion_center_id IS NOT NULL;

COMMIT;
