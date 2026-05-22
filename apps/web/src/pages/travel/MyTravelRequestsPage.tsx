import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plane, Search, Plus, ArrowRight, Clock, CheckCircle2, XCircle, Sparkles,
} from 'lucide-react';
import { travelRequestApi } from '../../lib/api';
import { TravelRequestStatus } from '@travel-os/shared-types';

interface Row {
  id: string;
  request_code: string;
  status: TravelRequestStatus;
  urgency: 'NORMAL' | 'URGENT';
  current_level: number;
  request_for: string;
  reservation_type: string;
  reason_of_travel: string;
  traveler_full_name: string;
  booking_boarding: string | null;
  booking_destination: string | null;
  booking_departure_date: string | null;
  submitted_at: string;
  department_name: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  AUTO_APPROVED: { label: 'Auto-Approved', color: 'var(--status-success)', icon: Sparkles },
  PENDING_L1:    { label: 'Pending L1',    color: 'var(--status-warning)', icon: Clock },
  PENDING_L2:    { label: 'Pending L2',    color: 'var(--status-warning)', icon: Clock },
  PENDING_L3:    { label: 'Pending L3',    color: 'var(--status-warning)', icon: Clock },
  APPROVED:      { label: 'Approved',      color: 'var(--status-success)', icon: CheckCircle2 },
  REJECTED:      { label: 'Rejected',      color: 'var(--status-danger)',  icon: XCircle },
  CANCELLED:     { label: 'Cancelled',     color: 'var(--content-muted)',  icon: XCircle },
};

export default function MyTravelRequestsPage() {
  const navigate = useNavigate();
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<string>('');

  useEffect(() => {
    setLoading(true);
    travelRequestApi.list({ search: search || undefined, status: filter || undefined })
      .then((r) => setRows(r.data.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [search, filter]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold"
            style={{ color: 'rgb(var(--content-primary))' }}>Travel Requests</h1>
          <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
            All requests you can see, based on your role.
          </p>
        </div>
        <button onClick={() => navigate('/travel/new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
          style={{ background: 'rgb(var(--accent))' }}>
          <Plus className="w-3.5 h-3.5" /> New Request
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code / name / destination…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs outline-none"
            style={{
              background: 'rgb(var(--surface-elevated))',
              border: '1px solid rgb(var(--border-subtle))',
              color: 'rgb(var(--content-primary))',
            }} />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}
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
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass p-10 text-center">
          <Plane className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
            No travel requests yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const m = STATUS_META[r.status] ?? STATUS_META.PENDING_L1;
            const I = m.icon;
            return (
              <motion.div key={r.id}
                onClick={() => navigate(`/travel/requests/${r.id}`)}
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
                      {r.request_code}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                      style={{ background: `rgb(${m.color}/0.15)`, color: `rgb(${m.color})` }}>
                      {m.label}
                    </span>
                    {r.urgency === 'URGENT' && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: 'rgb(var(--status-danger)/0.12)', color: 'rgb(var(--status-danger))' }}>
                        Urgent
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5"
                    style={{ color: 'rgb(var(--content-secondary))' }}>
                    {r.traveler_full_name} · {r.booking_boarding || '—'} → {r.booking_destination || '—'}
                  </p>
                  <p className="text-[10px] mt-0.5 font-mono"
                    style={{ color: 'rgb(var(--content-muted))' }}>
                    {r.booking_departure_date
                      ? new Date(r.booking_departure_date).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })
                      : '—'}
                    {' · '}
                    {r.reason_of_travel}
                    {' · '}
                    {r.department_name}
                  </p>
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
