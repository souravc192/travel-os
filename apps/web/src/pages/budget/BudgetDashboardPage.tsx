import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet, TrendingUp, AlertTriangle, Plus, History, Sparkles, RefreshCw,
} from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '@travel-os/shared-types';
import {
  useBudgetSummary, useOrgOverview, useSupplementaryRequests,
  useApproveSupplementary, type BudgetSummary,
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
    <motion.div
      className="glass p-5"
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium" style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `rgb(${color}/0.12)` }}>
          <Icon className="w-4 h-4" style={{ color: `rgb(${color})` }} />
        </div>
      </div>
      <p className="text-2xl font-bold font-mono"
        style={{ color: 'rgb(var(--content-primary))' }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-1" style={{ color: 'rgb(var(--content-muted))' }}>{sub}</p>
      )}
    </motion.div>
  );
}

export default function BudgetDashboardPage() {
  const { user } = useAuthStore();
  const role     = user?.role;
  const isOrgViewer =
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.FINANCE_ADMIN ||
    role === UserRole.TRAVEL_DESK;

  const [fy] = useState(currentFY());
  const [showSupplementary, setShowSupplementary] = useState(false);
  const [historyOf, setHistoryOf] = useState<BudgetSummary | null>(null);

  const summary = useBudgetSummary({ fiscalYear: fy });
  const org     = useOrgOverview(fy);
  const supps   = useSupplementaryRequests();
  const approve = useApproveSupplementary();

  const myBudget = summary.data;

  const totals = org.data?.meta.totals;

  const pendingForMe = useMemo(() => {
    if (!supps.data) return [];
    if (role === UserRole.FINANCE_ADMIN) return supps.data.filter((r) => r.status === 'PENDING');
    if (role === UserRole.SUPER_ADMIN)   return supps.data.filter((r) => r.status === 'FINANCE_APPROVED');
    return [];
  }, [supps.data, role]);

  async function decide(id: string, action: 'APPROVE' | 'REJECT') {
    const note = action === 'REJECT'
      ? window.prompt('Reason for rejection?') ?? ''
      : window.prompt('Optional approval note (press OK to skip):') ?? '';
    if (action === 'REJECT' && note.trim().length < 5) return;
    await approve.mutateAsync({ id, action, note: note.trim() || undefined });
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold"
            style={{ color: 'rgb(var(--content-primary))' }}>
            Budget Control
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
            {isOrgViewer ? 'Organisation-wide budget posture' : 'Your cost-centre budget health'} · FY {fy}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { summary.refetch(); org.refetch(); supps.refetch(); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
            style={{
              background: 'rgb(var(--surface-elevated))',
              color:      'rgb(var(--content-secondary))',
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={() => setShowSupplementary(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: 'rgb(var(--accent))' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Request Supplementary
          </button>
        </div>
      </div>

      {/* ── Top stats ───────────────────────────────────── */}
      {isOrgViewer ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Wallet} label="Total Allocated"
            value={totals ? inr(totals.allocated) : '—'}
            color="var(--accent)" delay={0}
          />
          <StatCard
            icon={TrendingUp} label="Total Consumed"
            value={totals ? inr(totals.consumed) : '—'}
            sub={totals ? `${totals.overallUtilization.toFixed(1)}% utilization` : undefined}
            color="var(--status-danger)" delay={0.06}
          />
          <StatCard
            icon={Sparkles} label="Supplementary"
            value={totals ? inr(totals.supplementaryApproved) : '—'}
            color="var(--status-info)" delay={0.12}
          />
          <StatCard
            icon={AlertTriangle} label="Pending Requests"
            value={String(pendingForMe.length)}
            sub={pendingForMe.length > 0 ? 'Need your action' : 'You are caught up'}
            color="var(--status-warning)" delay={0.18}
          />
        </div>
      ) : (
        <motion.div
          className="glass p-6 grid md:grid-cols-2 gap-6 items-center"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex justify-center">
            {summary.isLoading ? (
              <div className="skeleton w-40 h-40 rounded-full" />
            ) : myBudget ? (
              <BudgetRing
                pct={myBudget.utilizationPct}
                label={myBudget.costCentreName}
                value={`${inr(myBudget.consumed)} of ${inr(myBudget.allocated + myBudget.supplementaryApproved)}`}
              />
            ) : (
              <div className="text-center py-6">
                <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
                  No budget allocated yet
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            {myBudget && [
              { label: 'Allocated',     amount: myBudget.allocated,             color: 'var(--content-muted)' },
              { label: 'Consumed',      amount: myBudget.consumed,              color: 'var(--status-danger)' },
              { label: 'Supplementary', amount: myBudget.supplementaryApproved, color: 'var(--status-info)'   },
              { label: 'Remaining',     amount: myBudget.remaining,             color: 'var(--status-success)'},
            ].map(({ label, amount, color }) => (
              <div key={label} className="flex items-center justify-between p-2.5 rounded-xl"
                style={{ background: 'rgb(var(--surface-elevated))' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full"
                    style={{ background: `rgb(${color})` }} />
                  <span className="text-xs"
                    style={{ color: 'rgb(var(--content-secondary))' }}>{label}</span>
                </div>
                <span className="font-mono text-sm font-semibold"
                  style={{ color: `rgb(${color})` }}>
                  {inr(amount)}
                </span>
              </div>
            ))}

            {myBudget && (
              <button
                onClick={() => setHistoryOf(myBudget)}
                className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                style={{
                  background: 'rgb(var(--accent-subtle))',
                  color:      'rgb(var(--accent-text))',
                }}
              >
                <History className="w-3.5 h-3.5" />
                View History
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Pending supplementary actions ────────────────── */}
      {pendingForMe.length > 0 && (
        <motion.div
          className="glass p-5"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-sm font-semibold mb-3"
            style={{ color: 'rgb(var(--content-primary))' }}>
            {role === UserRole.FINANCE_ADMIN ? 'Finance Review Queue' : 'Final Approval Queue'}
          </h2>
          <div className="space-y-2">
            {pendingForMe.map((r) => (
              <div key={r.id}
                className="flex items-start justify-between gap-4 p-3 rounded-xl"
                style={{ background: 'rgb(var(--surface-elevated))' }}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold"
                      style={{ color: 'rgb(var(--content-primary))' }}>
                      {r.cost_centre_code}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        background: 'rgb(var(--status-warning)/0.15)',
                        color:      'rgb(var(--status-warning))',
                      }}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs mt-1"
                    style={{ color: 'rgb(var(--content-secondary))' }}>
                    {r.reason}
                  </p>
                  <p className="text-[10px] mt-1"
                    style={{ color: 'rgb(var(--content-muted))' }}>
                    {r.requested_by_name} · {new Date(r.created_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-sm font-bold"
                    style={{ color: 'rgb(var(--accent))' }}>
                    {inr(Number(r.amount))}
                  </p>
                  <div className="flex gap-1 mt-2">
                    <button
                      onClick={() => decide(r.id, 'REJECT')}
                      disabled={approve.isPending}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                      style={{
                        background: 'rgb(var(--status-danger)/0.12)',
                        color:      'rgb(var(--status-danger))',
                      }}>
                      Reject
                    </button>
                    <button
                      onClick={() => decide(r.id, 'APPROVE')}
                      disabled={approve.isPending}
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

      {/* ── Org table ──────────────────────────────────── */}
      {isOrgViewer && (
        <div>
          <h2 className="text-sm font-semibold mb-3"
            style={{ color: 'rgb(var(--content-primary))' }}>
            Cost Centres
          </h2>
          {org.isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          ) : (
            <BudgetTable
              rows={org.data?.data ?? []}
              onSelect={(row) => setHistoryOf(row)}
            />
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────── */}
      <SupplementaryModal
        open={showSupplementary}
        onClose={() => setShowSupplementary(false)}
        costCentreId={myBudget?.costCentreId}
        costCentreLabel={myBudget?.costCentreName}
        fiscalYear={fy}
      />
      <BudgetHistoryDrawer
        open={Boolean(historyOf)}
        budgetId={historyOf?.id}
        title={historyOf ? `${historyOf.costCentreCode} · ${historyOf.costCentreName}` : undefined}
        onClose={() => setHistoryOf(null)}
      />
    </div>
  );
}
