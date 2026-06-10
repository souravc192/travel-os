import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  MessageSquareWarning, Search, Plus, ArrowRight, BarChart3, Link2,
  Clock, UserCheck, Loader, CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react';
import { complaintApi } from '../../lib/api';
import { ComplaintStatus, ComplaintPriority, UserRole } from '@travel-os/shared-types';
import { useAuthStore } from '../../store/auth.store';

interface Row {
  id: string;
  complaintCode: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  category: string;
  subject: string;
  vendorName: string | null;
  employeeName: string | null;
  departmentName: string | null;
  travelRequestCode: string | null;
  resolutionOwnerName: string | null;
  slaDueAt: string | null;
  createdAt: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  OPEN:        { label: 'Open',        color: 'var(--status-warning)', icon: Clock },
  ASSIGNED:    { label: 'Assigned',    color: 'var(--status-info)',    icon: UserCheck },
  IN_PROGRESS: { label: 'In Progress', color: 'var(--status-info)',    icon: Loader },
  RESOLVED:    { label: 'Resolved',    color: 'var(--status-success)', icon: CheckCircle2 },
  CLOSED:      { label: 'Closed',      color: 'var(--content-muted)',  icon: XCircle },
};

const PRIORITY_META: Record<string, { label: string; color: string }> = {
  LOW:      { label: 'Low',      color: 'var(--content-muted)' },
  MEDIUM:   { label: 'Medium',   color: 'var(--status-info)' },
  HIGH:     { label: 'High',     color: 'var(--status-warning)' },
  CRITICAL: { label: 'Critical', color: 'var(--status-danger)' },
};

function slaBadge(slaDueAt: string | null, status: ComplaintStatus): { text: string; color: string } | null {
  if (!slaDueAt || status === 'RESOLVED' || status === 'CLOSED') return null;
  const due = new Date(slaDueAt).getTime();
  const now = Date.now();
  const diffH = (due - now) / 36e5;
  if (diffH < 0)  return { text: 'SLA breached', color: 'var(--status-danger)' };
  if (diffH < 6)  return { text: `${Math.round(diffH)}h left`, color: 'var(--status-warning)' };
  return { text: `${Math.round(diffH / 24)}d left`, color: 'var(--content-muted)' };
}

export default function ComplaintsListPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isManager = user && [UserRole.TRAVEL_TEAM, UserRole.ADMIN, UserRole.OWNER].includes(user.role);

  const [rows,     setRows]     = useState<Row[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [status,   setStatus]   = useState('');
  const [priority, setPriority] = useState('');

  useEffect(() => {
    setLoading(true);
    complaintApi.list({
      search:   search   || undefined,
      status:   status   || undefined,
      priority: priority || undefined,
    })
      .then((r) => setRows(r.data.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [search, status, priority]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <MessageSquareWarning className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Complaints
            </h1>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              {isManager ? 'All raised complaints across the org.' : 'Complaints you raised or are assigned to.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <button onClick={() => navigate('/complaints/analytics')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
              style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-primary))' }}>
              <BarChart3 className="w-3.5 h-3.5" /> Analytics
            </button>
          )}
          <button onClick={() => navigate('/complaints/new')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
            style={{ background: 'rgb(var(--accent))' }}>
            <Plus className="w-3.5 h-3.5" /> Raise Complaint
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, subject, vendor, employee…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs outline-none"
            style={{ background: 'rgb(var(--surface-elevated))', border: '1px solid rgb(var(--border-subtle))', color: 'rgb(var(--content-primary))' }} />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs outline-none"
          style={{ background: 'rgb(var(--surface-elevated))', border: '1px solid rgb(var(--border-subtle))', color: 'rgb(var(--content-primary))' }}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)}
          className="px-3 py-2 rounded-xl text-xs outline-none"
          style={{ background: 'rgb(var(--surface-elevated))', border: '1px solid rgb(var(--border-subtle))', color: 'rgb(var(--content-primary))' }}>
          <option value="">All priorities</option>
          {Object.keys(PRIORITY_META).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="glass p-10 text-center">
          <MessageSquareWarning className="w-10 h-10 mx-auto mb-3" style={{ color: 'rgb(var(--content-muted))' }} />
          <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>No complaints found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const m = STATUS_META[r.status] ?? STATUS_META.OPEN;
            const pm = PRIORITY_META[r.priority] ?? PRIORITY_META.MEDIUM;
            const I = m.icon;
            const sla = slaBadge(r.slaDueAt, r.status);
            return (
              <motion.div key={r.id}
                onClick={() => navigate(`/complaints/${r.id}`)}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }} whileHover={{ x: 2 }}
                className="glass p-3 flex items-center gap-3 cursor-pointer">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `rgb(${m.color}/0.12)` }}>
                  <I className="w-4 h-4" style={{ color: `rgb(${m.color})` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                      {r.complaintCode}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: `rgb(${m.color}/0.15)`, color: `rgb(${m.color})` }}>{m.label}</span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-bold"
                      style={{ background: `rgb(${pm.color}/0.12)`, color: `rgb(${pm.color})` }}>{pm.label}</span>
                    {r.travelRequestCode && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                        style={{ background: 'rgb(var(--accent-subtle))', color: 'rgb(var(--accent-text))' }}>
                        <Link2 className="w-3 h-3" /> {r.travelRequestCode}
                      </span>
                    )}
                    {sla && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                        style={{ background: `rgb(${sla.color}/0.12)`, color: `rgb(${sla.color})` }}>
                        <AlertTriangle className="w-3 h-3" /> {sla.text}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'rgb(var(--content-secondary))' }}>{r.subject}</p>
                  <p className="text-[10px] mt-0.5 font-mono" style={{ color: 'rgb(var(--content-muted))' }}>
                    {r.category}
                    {r.vendorName && ` · ${r.vendorName}`}
                    {isManager && r.employeeName && ` · ${r.employeeName}`}
                    {r.resolutionOwnerName && ` · owner: ${r.resolutionOwnerName}`}
                    {` · ${new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--content-muted))' }} />
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
