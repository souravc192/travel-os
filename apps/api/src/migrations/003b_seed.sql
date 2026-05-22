-- ============================================================
-- Travel OS — Phase 3 Seed
-- Run AFTER 003_phase3_overhaul.sql
--
-- • Seeds the Owner user (sourav.1@pw.live)
-- • Defaults annual budgets for any departments already on file
-- ============================================================

BEGIN;

-- ─── Owner ────────────────────────────────────────────────────
-- Password: Travel@123 (matches existing seed hash)
INSERT INTO users (id, email, password_hash, role, theme, is_active)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000099',
  'sourav.1@pw.live',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFhA1GsG5NzFfPa',
  'OWNER',
  'deep-space-dark',
  true
)
ON CONFLICT (email) DO UPDATE
  SET role = 'OWNER', is_active = true;

-- ─── Default budgets ──────────────────────────────────────────
-- ₹24L (= ₹2L × 12) per department, current FY.
DO $$
DECLARE
  v_fy TEXT;
BEGIN
  v_fy := CASE
    WHEN EXTRACT(MONTH FROM NOW()) >= 4
    THEN EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(((EXTRACT(YEAR FROM NOW())::INT + 1) % 100)::TEXT, 2, '0')
    ELSE (EXTRACT(YEAR FROM NOW())::INT - 1)::TEXT || '-' || LPAD((EXTRACT(YEAR FROM NOW())::INT % 100)::TEXT, 2, '0')
  END;

  INSERT INTO department_budgets (department_id, fiscal_year, allocated_annual)
    SELECT d.id, v_fy, 2400000
      FROM departments d
     WHERE d.is_active = true
  ON CONFLICT (department_id, fiscal_year) DO NOTHING;
END$$;

COMMIT;
