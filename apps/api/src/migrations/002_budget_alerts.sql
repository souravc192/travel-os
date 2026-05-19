-- ============================================================
-- Travel OS — Phase 2: Budget Alert Thresholds
-- Depends on: 001_initial_schema.sql
-- ============================================================

-- ─── Table: budget_alert_thresholds ───────────────────────────
-- Configurable utilization-percent triggers. Org-wide.
CREATE TABLE IF NOT EXISTS budget_alert_thresholds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  threshold_pct   NUMERIC(5,2) NOT NULL UNIQUE,
  channel         VARCHAR(20)  NOT NULL DEFAULT 'IN_APP'
                  CHECK (channel IN ('IN_APP','EMAIL','SLACK','WEBHOOK')),
  label           VARCHAR(80),
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  updated_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_threshold_range CHECK (threshold_pct > 0 AND threshold_pct <= 200)
);

CREATE INDEX IF NOT EXISTS idx_alert_thresholds_active
  ON budget_alert_thresholds(is_active) WHERE is_active = true;

-- ─── Table: budget_alerts (fire log) ──────────────────────────
-- One row per (budget, threshold) pair — used as a dedupe ledger so the
-- same threshold doesn't fire repeatedly for the same FY.
CREATE TABLE IF NOT EXISTS budget_alerts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id       UUID NOT NULL REFERENCES budget_master(id) ON DELETE CASCADE,
  threshold_id    UUID NOT NULL REFERENCES budget_alert_thresholds(id) ON DELETE CASCADE,
  threshold_pct   NUMERIC(5,2) NOT NULL,
  actual_pct      NUMERIC(5,2) NOT NULL,
  channel         VARCHAR(20)  NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),
  fired_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (budget_id, threshold_id)
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_budget ON budget_alerts(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_unack  ON budget_alerts(fired_at DESC)
  WHERE acknowledged_at IS NULL;

-- ─── Auto-update updated_at ───────────────────────────────────
DROP TRIGGER IF EXISTS trg_budget_alert_thresholds_updated_at ON budget_alert_thresholds;
CREATE TRIGGER trg_budget_alert_thresholds_updated_at
  BEFORE UPDATE ON budget_alert_thresholds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Default thresholds ───────────────────────────────────────
INSERT INTO budget_alert_thresholds (threshold_pct, channel, label) VALUES
  ( 50.00, 'IN_APP', 'Half consumed — informational'),
  ( 70.00, 'IN_APP', 'Approaching limit — review pipeline'),
  ( 90.00, 'EMAIL',  'Critical — finance notified'),
  (100.00, 'EMAIL',  'Exhausted — supplementary required')
ON CONFLICT (threshold_pct) DO NOTHING;
