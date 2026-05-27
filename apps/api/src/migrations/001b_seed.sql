-- ============================================================
-- Travel OS — Seed Data
-- Run AFTER 001_initial_schema.sql
-- ============================================================

BEGIN;

-- ─── Departments ─────────────────────────────────────────────
INSERT INTO departments (id, name, code) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Engineering',         'ENG'),
  ('11111111-0000-0000-0000-000000000002', 'Sales',               'SAL'),
  ('11111111-0000-0000-0000-000000000003', 'Finance',             'FIN'),
  ('11111111-0000-0000-0000-000000000004', 'Human Resources',     'HRD'),
  ('11111111-0000-0000-0000-000000000005', 'Operations',          'OPS'),
  ('11111111-0000-0000-0000-000000000006', 'Marketing',           'MKT');

-- ─── Cost Centres ─────────────────────────────────────────────
INSERT INTO cost_centres (id, code, name, department_id) VALUES
  ('22222222-0000-0000-0000-000000000001', 'CC-ENG-001', 'Engineering Core',       '11111111-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002', 'CC-SAL-001', 'Sales India',            '11111111-0000-0000-0000-000000000002'),
  ('22222222-0000-0000-0000-000000000003', 'CC-FIN-001', 'Finance Control',        '11111111-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000004', 'CC-HRD-001', 'HR Operations',          '11111111-0000-0000-0000-000000000004'),
  ('22222222-0000-0000-0000-000000000005', 'CC-OPS-001', 'Operations Delivery',    '11111111-0000-0000-0000-000000000005'),
  ('22222222-0000-0000-0000-000000000006', 'CC-MKT-001', 'Marketing Brand',        '11111111-0000-0000-0000-000000000006');

-- ─── Users (password: Admin@123 bcrypt hash) ──────────────────
-- All passwords: Travel@123 (bcrypt $2b$12$...)
-- Pre-generated hash for 'Travel@123':
-- $2b$12$s.GxiaFLkhSUMt0/9eOqSOn3jEIz1prdJYtsm7Ut8jkjcahIE79Xm

INSERT INTO users (id, email, password_hash, role, theme) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'superadmin@company.com',  '$2b$12$s.GxiaFLkhSUMt0/9eOqSOn3jEIz1prdJYtsm7Ut8jkjcahIE79Xm', 'SUPER_ADMIN',   'deep-space-dark'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'travel.desk@company.com', '$2b$12$s.GxiaFLkhSUMt0/9eOqSOn3jEIz1prdJYtsm7Ut8jkjcahIE79Xm', 'TRAVEL_DESK',   'corporate-light'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'finance@company.com',     '$2b$12$s.GxiaFLkhSUMt0/9eOqSOn3jEIz1prdJYtsm7Ut8jkjcahIE79Xm', 'FINANCE_ADMIN', 'arctic-blue'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'hod.eng@company.com',     '$2b$12$s.GxiaFLkhSUMt0/9eOqSOn3jEIz1prdJYtsm7Ut8jkjcahIE79Xm', 'L2_APPROVER',   'deep-space-dark'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'manager.eng@company.com', '$2b$12$s.GxiaFLkhSUMt0/9eOqSOn3jEIz1prdJYtsm7Ut8jkjcahIE79Xm', 'L1_APPROVER',   'corporate-light'),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'emp.eng@company.com',     '$2b$12$s.GxiaFLkhSUMt0/9eOqSOn3jEIz1prdJYtsm7Ut8jkjcahIE79Xm', 'EMPLOYEE',      'deep-space-dark');

-- ─── Employees ────────────────────────────────────────────────
INSERT INTO employees (id, user_id, employee_code, name, designation, department_id, cost_centre_id, grade_level, onboarding_complete) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'EMP-SA-0001', 'Super Admin',       'Platform Administrator', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'L5', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'EMP-TD-0001', 'Priya Sharma',      'Travel Desk Manager',    '11111111-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000005', 'L4', true),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', 'EMP-FN-0001', 'Rajesh Kumar',      'Finance Controller',      '11111111-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003', 'L4', true),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000004', 'EMP-ENG-001', 'Anjali Singh',      'Head of Engineering',    '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'L5', true),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000005', 'EMP-ENG-002', 'Vikram Nair',       'Engineering Manager',    '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'L4', true),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000006', 'EMP-ENG-003', 'Arjun Mehta',       'Senior Engineer',        '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'L3', true);

-- Set approver mappings
UPDATE employees SET
  l1_approver_id = 'bbbbbbbb-0000-0000-0000-000000000005',
  l2_approver_id = 'bbbbbbbb-0000-0000-0000-000000000004'
WHERE id = 'bbbbbbbb-0000-0000-0000-000000000006';

UPDATE employees SET
  l2_approver_id = 'bbbbbbbb-0000-0000-0000-000000000004'
WHERE id = 'bbbbbbbb-0000-0000-0000-000000000005';

-- ─── Budget Master (FY 2024-25) ───────────────────────────────
INSERT INTO budget_master (cost_centre_id, fiscal_year, allocated, consumed, supplementary_approved) VALUES
  ('22222222-0000-0000-0000-000000000001', '2024-25', 2500000.00, 1180000.00, 200000.00),
  ('22222222-0000-0000-0000-000000000002', '2024-25', 3500000.00,  980000.00,       0.00),
  ('22222222-0000-0000-0000-000000000003', '2024-25',  800000.00,  220000.00,       0.00),
  ('22222222-0000-0000-0000-000000000004', '2024-25',  600000.00,  145000.00,       0.00),
  ('22222222-0000-0000-0000-000000000005', '2024-25', 1200000.00,  760000.00,  100000.00),
  ('22222222-0000-0000-0000-000000000006', '2024-25', 1800000.00,  420000.00,       0.00);

-- ─── Sample Vendors ───────────────────────────────────────────
INSERT INTO vendors (id, name, type, gst_number, score) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'IndiGo Airlines',    'AIRLINE', '07AABCI1234A1ZX', 82.50),
  ('cccccccc-0000-0000-0000-000000000002', 'Air India',          'AIRLINE', '07AACIA2345B1ZY', 71.00),
  ('cccccccc-0000-0000-0000-000000000003', 'OYO Business',       'HOTEL',   '29AABCO3456C1ZZ', 65.00),
  ('cccccccc-0000-0000-0000-000000000004', 'Taj Hotels',         'HOTEL',   '27AABCT4567D1ZA', 91.00),
  ('cccccccc-0000-0000-0000-000000000005', 'Meru Cabs',          'CAB',     '29AABCM5678E1ZB', 74.50),
  ('cccccccc-0000-0000-0000-000000000006', 'Zoomcar',            'CAB',     '29AABCZ6789F1ZC', 68.00),
  ('cccccccc-0000-0000-0000-000000000007', 'IRCTC',              'TRAIN',   '07AAACI7890G1ZD', 88.00),
  ('cccccccc-0000-0000-0000-000000000008', 'RedBus',             'BUS',     '29AABCR8901H1ZE', 72.00);

-- ─── Vendor Scores ────────────────────────────────────────────
INSERT INTO vendor_scores (vendor_id, price_competitiveness, complaint_rate_score, resolution_time_score, booking_success_score, policy_compliance_score) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 22, 20, 18, 17, 9),  -- IndiGo: 86
  ('cccccccc-0000-0000-0000-000000000002', 18, 17, 14, 15, 8),  -- Air India: 72
  ('cccccccc-0000-0000-0000-000000000003', 20, 14, 12, 13, 7),  -- OYO: 66
  ('cccccccc-0000-0000-0000-000000000004', 14, 23, 19, 19, 10), -- Taj: 85
  ('cccccccc-0000-0000-0000-000000000005', 19, 18, 15, 16, 8),  -- Meru: 76
  ('cccccccc-0000-0000-0000-000000000007', 24, 22, 17, 18, 9);  -- IRCTC: 90

COMMIT;
