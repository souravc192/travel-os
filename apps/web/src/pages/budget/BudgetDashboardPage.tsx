import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet, TrendingUp, AlertTriangle, Plus, History, Sparkles, RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '@travel-os/shared-types';
import {
  useBudgetSummary, useOrgOverview, useAdditionRequests,
  useDecideAddition, type BudgetSummary,
} from '../../hooks/useBudget';
import BudgetRing from './components/BudgetRing';
import BudgetTable from './components/BudgetTable';
import SupplementaryModal from './components/SupplementaryModal';
import BudgetHistoryDrawer from './components/BudgetHistoryDrawer';

function currentFY(d: Date = new Date()): string {
  const y = d.getFullYear(), m = d.getMonth();
  const start = m >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function inr(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string; delay?: number;
}) {
  return (
    <motion.div className="glass p-5"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium" style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `rgb(${color}/0.12)` }}>
          <Icon className="w-4 h-4" style={{ color: `rgb(${color})` }} />
        </div>
      </div>
      <p className="text-2xl font-bold font-mono"
        style={{ color: 'rgb(var(--content-primary))' }}>{value}</p>
      {sub && (<p className="text-[11px] mt-1" style={{ color: 'rgb(var(--content-muted))' }}>{sub}</p>)}
    </motion.div>
  );
}

export default function BudgetDashboardPage() {
  const { user } = useAuthStore();
  const role     = user?.role;
  const isOrgViewer =
    role === UserRole.OWNER ||
    role === UserRole.ADMIN ||
    role === UserRole.TRAVEL_TEAM;

  const [fy] = useState(currentFY());
  const [showSupp,   setShowSupp]   = useState(false);
  const [historyOf,  setHistoryOf]  = useState<BudgetSummary | null>(null);

  const summary  = useBudgetSummary({ fiscalYear: fy });
  const org      = useOrgOverview(fy);
  const supps    = useAdditionRequests();
  const decide   = useDecideAddition();
  const myBudget = summary.data;
  const totals   = org.data?.meta.totals;

  const pendingForMe = useMemo(() => {
    if (!supps.data) return [];
    if (role === UserRole.ADMIN || role === UserRole.OWNER) {
      return supps.data.filter((r) => r.status === 'PENDING');
    }
    return [];
  }, [supps.data, role]);

  async function act(id: string, action: 'APPROVE' | 'REJECT') {
    const note = action === 'REJECT'
      ? window.prompt('Reason for rejection?') ?? ''
      : window.prompt('Optional approval note (press OK to skip):') ?? '';
    if (action === 'REJECT' && note.trim().length < 5) return;
    await decide.mutateAsync({ id, action, note: note.trim() || undefined });
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold"
            style={{ color: 'rgb(var(--content-primary))' }}>
            Budget Control
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
            {isOrgViewer ? 'Organisation-wide budget posture' : 'Your department budget health'} · FY {fy}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { summary.refetch(); org.refetch(); supps.refetch(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
            style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {role === UserRole.HOD && myBudget && (
            <button onClick={() => setShowSupp(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
              style={{ background: 'rgb(var(--accent))' }}>
              <Plus className="w-3.5 h-3.5" /> Request Addition
            </button>
          )}
        </div>
      </div>

      {isOrgViewer ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Wallet}     label="Total Allocated"  value={totals ? inr(totals.allocatedAnnual) : '—'} color="var(--accent)" delay={0} />
          <StatCard icon={TrendingUp} label="Total Consumed"   value={totals ? inr(totals.consumed) : '—'}
            sub={totals ? `${totals.overallUtilization.toFixed(1)}% utilization` : undefined}
            color="var(--status-danger)" delay={0.06} />
          <StatCard icon={Sparkles}   label="Additions"        value={totals ? inr(totals.supplementaryApproved) : '—'}
            color="var(--status-info)" delay={0.12} />
          <StatCard icon={AlertTriangle} label="Pending Requests" value={String(pendingForMe.length)}
            sub={pendingForMe.length > 0 ? 'Need your action' : 'You are caught up'}
            color="var(--status-warning)" delay={0.18} />
        </div>
      ) : (
        <motion.div className="glass p-6 grid md:grid-cols-2 gap-6 items-center"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex justify-center">
            {summary.isLoading ? (
              <div className="skeleton w-40 h-40 rounded-full" />
            ) : myBudget ? (
              <BudgetRing pct={myBudget.utilizationPct}
                label={myBudget.departmentName}
                value={`${inr(myBudget.consumed)} of ${inr(myBudget.allocatedAnnual + myBudget.supplementaryApproved)}`} />
            ) : (
              <div className="text-center py-6">
                <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>No budget allocated yet</p>
              </div>
            )}
          </div>
          <div className="space-y-2.5">
            {myBudget && [
              { label: 'Allocated',  amount: myBudget.allocatedAnnual,        color: 'var(--content-muted)' },
              { label: 'Consumed',   amount: myBudget.consumed,               color: 'var(--status-danger)' },
              { label: 'Additions',  amount: myBudget.supplementaryApproved,  color: 'var(--status-info)'   },
              { label: 'Remaining',  amount: myBudget.remaining,              color: 'var(--status-success)' },
            ].map(({ label, amount, color }) => (
              <div key={label} className="flex items-center justify-between p-2.5 rounded-xl"
                style={{ background: 'rgb(var(--surface-elevated))' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: `rgb(${color})` }} />
                  <span className="text-xs" style={{ color: 'rgb(var(--content-secondary))' }}>{label}</span>
                </div>
                <span className="font-mono text-sm font-semibold" style={{ color: `rgb(${color})` }}>
                  {inr(amount)}
                </span>
              </div>
            ))}
            {myBudget && (
              <button onClick={() => setHistoryOf(myBudget)}
                className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                <History className="w-3.5 h-3.5" /> View History
              </button>
            )}
          </div>
        </motion.div>
      )}

      {pendingForMe.length > 0 && (
        <motion.div className="glass p-5"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgb(var(--content-primary))' }}>
            Pending Addition Requests
          </h2>
          <div className="space-y-2">
            {pendingForMe.map((r) => (
              <div key={r.id}
                className="flex items-start justify-between gap-4 p-3 rounded-xl"
                style={{ background: 'rgb(var(--surface-elevated))' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold"
                      style={{ color: 'rgb(var(--content-primary))' }}>
                      {r.department_name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        background: 'rgb(var(--status-warning)/0.15)',
                        color:      'rgb(var(--status-warning))',
                      }}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'rgb(var(--content-secondary))' }}>
                    {r.reason}
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: 'rgb(var(--content-muted))' }}>
                    {r.requested_by_name} · {new Date(r.created_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-sm font-bold" style={{ color: 'rgb(var(--accent))' }}>
                    {inr(Number(r.amount))}
                  </p>
                  <div className="flex gap-1 mt-2">
                    <button onClick={() => act(r.id, 'REJECT')} disabled={decide.isPending}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                      style={{ background: 'rgb(var(--status-danger)/0.12)', color: 'rgb(var(--status-danger))' }}>
                      Reject
                    </button>
                    <button onClick={() => act(r.id, 'APPROVE')} disabled={decide.isPending}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white"
                      style={{ background: 'rgb(var(--status-success))' }}>
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {isOrgViewer && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgb(var(--content-primary))' }}>
            Departments
          </h2>
          {org.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : (
            <BudgetTable rows={org.data?.data ?? []} onSelect={(row) => setHistoryOf(row)} />
          )}
        </div>
      )}

      <SupplementaryModal
        open={showSupp}
        onClose={() => setShowSupp(false)}
        departmentBudgetId={myBudget?.id}
        departmentLabel={myBudget?.departmentName}
        fiscalYear={fy} />
      <BudgetHistoryDrawer
        open={Boolean(historyOf)}
        budgetId={historyOf?.id}
        title={historyOf?.departmentName}
        onClose={() => setHistoryOf(null)} />
    </div>
  );
}
