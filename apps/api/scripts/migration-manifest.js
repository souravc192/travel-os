/**
 * Ordered migration list + schema probes for bootstrapping existing databases
 * that were migrated before schema_migrations tracking existed.
 */
module.exports = [
  {
    file: '001_initial_schema.sql',
    probe:
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'",
  },
  {
    file: '001b_seed.sql',
    probe: 'SELECT 1 FROM users LIMIT 1',
  },
  {
    file: '002_budget_alerts.sql',
    // Tables from 002 are dropped by 003; infer from later schema.
    impliedBy: '003_phase3_overhaul.sql',
  },
  {
    file: '003_phase3_overhaul.sql',
    probe:
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'travel_requests'",
  },
  {
    file: '003b_seed.sql',
    probe: 'SELECT 1 FROM department_budgets LIMIT 1',
  },
  {
    file: '004_phase4_bookings_policy.sql',
    probe:
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'policies'",
  },
  {
    file: '005_phase5a_urgency_booking.sql',
    probe:
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'travel_requests' AND column_name = 'expansion_center_id'",
  },
  {
    file: '006_phase5b_multi_segment.sql',
    probe:
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'travel_segments'",
  },
  {
    file: '007_phase5c_reimbursement.sql',
    probe:
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reimbursements'",
  },
  {
    file: '008_phase5d_feedback_complaint.sql',
    probe:
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feedback'",
  },
];
