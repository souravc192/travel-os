import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Minus, Plane, Clock, AlertTriangle,
  CheckCircle, DollarSign, BarChart3, Users, ArrowRight, Plus, Zap
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, Tooltip
} from 'recharts';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '@travel-os/shared-types';
import { budgetApi, travelRequestApi } from '../../lib/api';
import { MetricSkeleton } from '../../components/ui/PageLoader';

// ─── Animated counter ─────────────────────────────────────────
function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start   = 0;
    const end     = value;
    const duration = 1400;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4); // ease-out-quart
      setDisplay(start + (end - start) * eased);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value]);

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString('en-IN');

  return <>{prefix}{formatted}{suffix}</>;
}

// ─── Animated budget ring ─────────────────────────────────────
function BudgetRing({ pct, label, value }: { pct: number; label: string; value: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const color = pct < 50 ? 'var(--status-success)' :
                pct < 70 ? 'var(--status-warning)'  :
                pct < 90 ? '#F97316'                 :
                           'var(--status-danger)';
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={r} fill="none"
          strokeWidth="10" stroke="rgb(var(--surface-overlay))" />
        <motion.circle cx="64" cy="64" r={r} fill="none"
          strokeWidth="10" stroke={`rgb(${color})`}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (circ * Math.min(pct, 100)) / 100 }}
          transition={{ duration: 1.4, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
        />
      </svg>
      <div className="text-center -mt-1">
        <p className="text-2xl font-bold font-mono" style={{ color: `rgb(${color})` }}>
          {Math.round(pct)}%
        </p>
        <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
        <p className="text-[11px] font-mono mt-0.5" style={{ color: 'rgb(var(--content-secondary))' }}>{value}</p>
      </div>
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────
function MetricCard({ label, value, unit, trend, trendValue, sparkline, icon: Icon, delay = 0 }: {
  label: string; value: number; unit: string; trend: string;
  trendValue: number; sparkline: { value: number }[]; icon: React.ElementType; delay?: number;
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'var(--status-success)' :
                     trend === 'down' ? 'var(--status-danger)' : 'var(--content-muted)';

  const formatValue = (v: number) => {
    if (unit === 'currency') {
      if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
      if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
      if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)}K`;
      return `₹${v.toLocaleString('en-IN')}`;
    }
    if (unit === 'percentage') return `${v.toFixed(1)}%`;
    return v.toLocaleString('en-IN');
  };

  return (
    <motion.div
      className="glass p-5 flex flex-col gap-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium mb-3" style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
          <p className="text-2xl font-bold font-mono" style={{ color: 'rgb(var(--content-primary))' }}>
            <AnimatedNumber
              value={value}
              prefix={unit === 'currency' ? '₹' : ''}
              suffix={unit === 'percentage' ? '%' : ''}
              decimals={unit === 'percentage' ? 1 : 0}
            />
          </p>
        </div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgb(var(--accent-subtle))' }}>
          <Icon className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
        </div>
      </div>

      {/* Sparkline */}
      <div className="h-10 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkline} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={`rgb(${trendColor})`} stopOpacity={0.3} />
                <stop offset="95%" stopColor={`rgb(${trendColor})`} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone" dataKey="value" stroke={`rgb(${trendColor})`}
              strokeWidth={1.5} fill={`url(#grad-${label})`} dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Trend */}
      <div className="flex items-center gap-1.5">
        <TrendIcon className="w-3 h-3" style={{ color: `rgb(${trendColor})` }} />
        <span className="text-xs font-medium" style={{ color: `rgb(${trendColor})` }}>
          {trendValue > 0 ? '+' : ''}{trendValue}%
        </span>
        <span className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>vs last month</span>
      </div>
    </motion.div>
  );
}

// ─── Trip status pill ─────────────────────────────────────────
const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  DRAFT:          { label: 'Draft',     className: 'badge-muted' },
  SUBMITTED:      { label: 'Submitted', className: 'badge-info' },
  L1_PENDING:     { label: 'L1 Review', className: 'badge-warning' },
  L1_APPROVED:    { label: 'L1 ✓',     className: 'badge-success' },
  L2_PENDING:     { label: 'L2 Review', className: 'badge-warning' },
  DESK_PENDING:   { label: 'Desk Review',className:'badge-warning' },
  BOOKED:         { label: 'Booked',    className: 'badge-success' },
  IN_TRANSIT:     { label: 'Travelling',className: 'badge-info' },
  COMPLETED:      { label: 'Completed', className: 'badge-success' },
  CANCELLED:      { label: 'Cancelled', className: 'badge-danger' },
  L1_REJECTED:    { label: 'Rejected',  className: 'badge-danger' },
  L2_REJECTED:    { label: 'Rejected',  className: 'badge-danger' },
  DESK_REJECTED:  { label: 'Rejected',  className: 'badge-danger' },
};

// ─── Generate mock sparkline data ─────────────────────────────
function mockSparkline(base: number, variance = 0.15) {
  return Array.from({ length: 12 }, (_, i) => ({
    value: base * (1 + (Math.random() - 0.4) * variance * (i / 12 + 0.5)),
  }));
}

// ─── Dashboard ────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, employee } = useAuthStore();
  const navigate           = useNavigate();
  const role               = user?.role;

  const [loading, setLoading]   = useState(true);
  const [budget, setBudget]     = useState<Record<string, unknown> | null>(null);
  const [trips, setTrips]       = useState<unknown[]>([]);
  const [pendingApprovals, setPending] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [budRes, tripRes] = await Promise.allSettled([
          budgetApi.summary(),
          travelRequestApi.list({ limit: 5 }),
        ]);
        if (budRes.status === 'fulfilled')  setBudget(budRes.value.data.data);
        if (tripRes.status === 'fulfilled') setTrips(tripRes.value.data.data);

        if (role !== UserRole.USER) {
          const apRes = await travelRequestApi.pendingApprovals();
          setPending(apRes.data.data?.length ?? 0);
        }
      } catch { /* silent */ }
      finally   { setLoading(false); }
    };
    load();
  }, [role]);

  const isAdmin = role === UserRole.OWNER || role === UserRole.ADMIN;
  const isDesk  = role === UserRole.TRAVEL_TEAM;
  const isApprover = role === UserRole.HOD;

  // Mock KPI data (real data comes from /budget/org-overview in Phase 8)
  const kpis = [
    { label: 'Total Spend',         value: 11_80_000, unit: 'currency',    trend: 'up',   trendValue: 12.4, icon: DollarSign, sparkline: mockSparkline(11_80_000) },
    { label: 'Savings Generated',   value: 3_24_000,  unit: 'currency',    trend: 'up',   trendValue: 8.2,  icon: TrendingUp, sparkline: mockSparkline(3_24_000) },
    { label: 'Budget Utilization',  value: 47.2,      unit: 'percentage',  trend: 'up',   trendValue: 3.1,  icon: BarChart3,  sparkline: mockSparkline(47) },
    { label: 'Exception Rate',      value: 4.8,       unit: 'percentage',  trend: 'down', trendValue: -1.2, icon: AlertTriangle, sparkline: mockSparkline(5) },
    { label: 'Pending Approvals',   value: pendingApprovals, unit: 'count',trend: 'flat', trendValue: 0,   icon: Clock,      sparkline: mockSparkline(pendingApprovals || 3) },
    { label: 'Active Trips',        value: trips.length || 4, unit: 'count',trend:'up',   trendValue: 2,   icon: Plane,      sparkline: mockSparkline(4) },
  ];

  // Budget utilization pct
  const budgetPct = budget
    ? ((budget as any).consumed / ((budget as any).allocated + (budget as any).supplementaryApproved)) * 100
    : 47.2;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* ── Welcome bar ──────────────────────────────────── */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: 'rgb(var(--content-primary))' }}>
            {greeting}, {employee?.name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            {employee?.groupLabel && (
              <span className="ml-2 font-mono px-1.5 py-0.5 rounded text-[10px]"
                style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                {employee.groupLabel}
              </span>
            )}
          </p>
        </div>

        <motion.button
          onClick={() => navigate('/trips/new')}
          className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'rgb(var(--accent))' }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <Plus className="w-4 h-4" />
          New Trip
        </motion.button>
      </motion.div>

      {/* ── Alert banners ────────────────────────────────── */}
      {pendingApprovals > 0 && isApprover && (
        <motion.div
          className="flex items-center justify-between p-4 rounded-2xl"
          style={{
            background: 'rgb(var(--status-warning)/0.08)',
            border: '1px solid rgb(var(--status-warning)/0.25)',
          }}
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgb(var(--status-warning)/0.15)' }}>
              <Clock className="w-4 h-4" style={{ color: 'rgb(var(--status-warning))' }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                {pendingApprovals} trip{pendingApprovals > 1 ? 's' : ''} awaiting your approval
              </p>
              <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
                Oldest pending for 6 hours — SLA due in 18h
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/approvals')}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgb(var(--status-warning)/0.15)', color: 'rgb(var(--status-warning))' }}
          >
            Review <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}

      {/* ── KPI Grid ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'rgb(var(--content-secondary))' }}>
            {isAdmin || isDesk ? 'Organisation Overview' : 'Your Overview'}
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => <MetricSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpis.map((kpi, i) => (
              <MetricCard key={kpi.label} {...kpi} delay={i * 0.06} />
            ))}
          </div>
        )}
      </div>

      {/* ── Bottom grid: Budget ring + Recent trips ───────── */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Budget ring card */}
        <motion.div
          className="glass p-6 flex flex-col items-center gap-4"
          initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <div className="w-full flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
              Budget Health
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-muted))' }}>
              FY 2024–25
            </span>
          </div>

          <BudgetRing
            pct={budgetPct}
            label={employee?.departmentName ?? 'Department'}
            value={budget
              ? `₹${((budget as any).consumed / 100000).toFixed(1)}L of ₹${(((budget as any).allocated + (budget as any).supplementaryApproved) / 100000).toFixed(1)}L`
              : '₹11.8L of ₹25L'
            }
          />

          {/* Budget breakdown */}
          <div className="w-full space-y-2.5 mt-2">
            {[
              { label: 'Allocated',      amount: (budget as any)?.allocated ?? 25_00_000,              color: 'var(--content-muted)' },
              { label: 'Consumed',       amount: (budget as any)?.consumed ?? 11_80_000,               color: 'var(--status-danger)' },
              { label: 'Supplementary',  amount: (budget as any)?.supplementaryApproved ?? 2_00_000,   color: 'var(--status-info)' },
              { label: 'Remaining',      amount: ((budget as any)?.allocated ?? 25_00_000) - ((budget as any)?.consumed ?? 11_80_000) + ((budget as any)?.supplementaryApproved ?? 2_00_000), color: 'var(--status-success)' },
            ].map(({ label, amount, color }) => (
              <div key={label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: `rgb(${color})` }} />
                  <span style={{ color: 'rgb(var(--content-secondary))' }}>{label}</span>
                </div>
                <span className="font-mono font-medium" style={{ color: `rgb(${color})` }}>
                  ₹{(amount / 1_00_000).toFixed(1)}L
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent trips */}
        <motion.div
          className="glass p-6 lg:col-span-2"
          initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.55, duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
              {isApprover || isAdmin || isDesk ? 'Pending Approvals' : 'My Recent Trips'}
            </h3>
            <button
              onClick={() => navigate(isApprover ? '/approvals' : '/trips')}
              className="flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: 'rgb(var(--accent-text))' }}
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => (
                <div key={i} className="skeleton h-16 rounded-xl" />
              ))}
            </div>
          ) : trips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgb(var(--surface-elevated))' }}>
                <Plane className="w-6 h-6" style={{ color: 'rgb(var(--content-muted))' }} />
              </div>
              <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>No trips yet</p>
              <button
                onClick={() => navigate('/trips/new')}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}
              >
                Create your first trip
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Mock trips since backend not wired yet */}
              {[
                { id: '1', tripCode: 'TRP-2024-ENG-00042', origin: 'Mumbai', destination: 'Bengaluru', status: 'BOOKED',      departureDate: '2024-02-15', budget: 18000 },
                { id: '2', tripCode: 'TRP-2024-ENG-00041', origin: 'Delhi',  destination: 'Chennai',   status: 'L1_PENDING',  departureDate: '2024-02-20', budget: 12000 },
                { id: '3', tripCode: 'TRP-2024-ENG-00040', origin: 'Pune',   destination: 'Hyderabad', status: 'COMPLETED',   departureDate: '2024-02-05', budget: 9500  },
                { id: '4', tripCode: 'TRP-2024-ENG-00039', origin: 'Delhi',  destination: 'Kolkata',   status: 'DESK_PENDING', departureDate: '2024-02-25', budget: 22000 },
              ].map((trip, i) => {
                const st = STATUS_STYLE[trip.status] ?? { label: trip.status, className: 'badge-muted' };
                return (
                  <motion.div
                    key={trip.id}
                    className="flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: 'rgb(var(--surface-elevated))' }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.07 }}
                    onClick={() => navigate(`/trips/${trip.id}`)}
                    whileHover={{ x: 2 }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgb(var(--accent-subtle))' }}>
                      <Plane className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold truncate" style={{ color: 'rgb(var(--content-primary))' }}>
                          {trip.origin} → {trip.destination}
                        </p>
                      </div>
                      <p className="text-[10px] font-mono mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
                        {trip.tripCode} · {new Date(trip.departureDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={st.className}>{st.label}</span>
                      <span className="text-[10px] font-mono" style={{ color: 'rgb(var(--content-muted))' }}>
                        ₹{trip.budget.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgb(var(--content-muted))' }} />
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* FAB for mobile */}
          <motion.button
            onClick={() => navigate('/trips/new')}
            className="sm:hidden fixed bottom-6 right-6 w-14 h-14 rounded-2xl flex items-center justify-center shadow-2xl text-white z-30"
            style={{ background: 'rgb(var(--accent))' }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="w-6 h-6" />
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}

// Re-export for router
function ChevronRight({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} style={style}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
