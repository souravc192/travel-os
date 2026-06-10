import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Receipt, Search, Plus, ArrowRight, Clock, CheckCircle2, XCircle,
  BadgeDollarSign, FileText, Link2,
} from 'lucide-react';
import { reimbursementApi } from '../../lib/api';
import { ReimbursementStatus, ReimbursementKind, UserRole } from '@travel-os/shared-types';
import { useAuthStore } from '../../store/auth.store';

interface Row {
  id: string;
  reimbursementCode: string;
  kind: ReimbursementKind;
  status: ReimbursementStatus;
  title: string;
  employeeName: string | null;
  departmentName: string | null;
  travelRequestCode: string | null;
  totalClaimed: number;
  totalApproved: number;
  itemCount: number | null;
  submittedAt: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DRAFT:     { label: 'Draft',     color: 'var(--content-muted)',   icon: FileText },
  SUBMITTED: { label: 'Submitted', color: 'var(--status-warning)',  icon: Clock },
  APPROVED:  { label: 'Approved',  color: 'var(--status-success)',  icon: CheckCircle2 },
  REJECTED:  { label: 'Rejected',  color: 'var(--status-danger)',   icon: XCircle },
  PAID:      { label: 'Paid',      color: 'var(--status-info)',     icon: BadgeDollarSign },
};

function inr(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function ReimbursementsListPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const orgWide  = user && (
    user.role === UserRole.OWNER ||
    user.role === UserRole.ADMIN ||
    user.role === UserRole.TRAVEL_TEAM
  );

  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState<string>('');
  const [kind,    setKind]    = useState<string>('');

  useEffect(() => {
    setLoading(true);
    reimbursementApi.list({
      search: search || undefined,
      status: status || undefined,
      kind:   kind   || undefined,
    })
      .then((r) => setRows(r.data.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [search, status, kind]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <Receipt className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Reimbursements
            </h1>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              {orgWide
                ? 'All reimbursement claims across the org.'
                : 'Your reimbursement claims.'}
            </p>
          </div>
        </div>
        <button onClick={() => navigate('/reimbursements/new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: 'rgb(var(--accent))' }}>
          <Plus className="w-3.5 h-3.5" /> New Claim
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, title, employee or travel ref…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs outline-none"
            style={{
              background: 'rgb(var(--surface-elevated))',
              border: '1px solid rgb(var(--border-subtle))',
              color: 'rgb(var(--content-primary))',
            }} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs outline-none"
          style={{
            background: 'rgb(var(--surface-elevated))',
            border: '1px solid rgb(var(--border-subtle))',
            color: 'rgb(var(--content-primary))',
          }}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_META).map((s) => (
            <option key={s} value={s}>{STATUS_META[s].label}</option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs outline-none"
          style={{
            background: 'rgb(var(--surface-elevated))',
            border: '1px solid rgb(var(--border-subtle))',
            color: 'rgb(var(--content-primary))',
          }}>
          <option value="">All kinds</option>
          <option value={ReimbursementKind.TRAVEL_LINKED}>Travel Linked</option>
          <option value={ReimbursementKind.STANDALONE}>Standalone</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass p-10 text-center">
          <Receipt className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
            No reimbursement claims yet.
          </p>
          <button onClick={() => navigate('/reimbursements/new')}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: 'rgb(var(--accent))' }}>
            Create your first claim
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const m = STATUS_META[r.status] ?? STATUS_META.DRAFT;
            const I = m.icon;
            return (
              <motion.div key={r.id}
                onClick={() => navigate(`/reimbursements/${r.id}`)}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ x: 2 }}
                className="glass p-3 flex items-center gap-3 cursor-pointer">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `rgb(${m.color}/0.12)` }}>
                  <I className="w-4 h-4" style={{ color: `rgb(${m.color})` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold"
                      style={{ color: 'rgb(var(--content-primary))' }}>
                      {r.reimbursementCode}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: `rgb(${m.color}/0.15)`, color: `rgb(${m.color})` }}>
                      {m.label}
                    </span>
                    {r.kind === ReimbursementKind.TRAVEL_LINKED && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                        style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                        <Link2 className="w-3 h-3" />
                        {r.travelRequestCode ?? 'Travel'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 truncate"
                    style={{ color: 'rgb(var(--content-secondary))' }}>
                    {r.title}
                  </p>
                  <p className="text-[10px] mt-0.5 font-mono"
                    style={{ color: 'rgb(var(--content-muted))' }}>
                    {orgWide && r.employeeName ? `${r.employeeName} · ` : ''}
                    {r.itemCount ?? 0} item{(r.itemCount ?? 0) === 1 ? '' : 's'}
                    {' · '}
                    {r.departmentName ?? '—'}
                    {' · '}
                    {new Date(r.submittedAt ?? r.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="font-mono text-sm font-bold"
                    style={{ color: 'rgb(var(--content-primary))' }}>
                    {inr(r.totalClaimed)}
                  </p>
                  {r.status === ReimbursementStatus.APPROVED || r.status === ReimbursementStatus.PAID ? (
                    <p className="font-mono text-[10px]"
                      style={{ color: 'rgb(var(--status-success))' }}>
                      ✓ {inr(r.totalApproved)}
                    </p>
                  ) : null}
                </div>
                <ArrowRight className="w-4 h-4 flex-shrink-0"
                  style={{ color: 'rgb(var(--content-muted))' }} />
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
