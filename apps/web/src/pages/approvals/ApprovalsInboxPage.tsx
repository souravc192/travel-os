import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Inbox, CheckSquare, ArrowRight, Clock, Plane, MapPin, Calendar, RefreshCw,
} from 'lucide-react';
import { travelRequestApi } from '../../lib/api';

interface InboxRow {
  id: string;
  request_code: string;
  status: string;
  urgency: 'NORMAL' | 'URGENT';
  current_level: number;
  request_for: string;
  reason_of_travel: string;
  traveler_full_name: string;
  booking_boarding: string | null;
  booking_destination: string | null;
  booking_departure_date: string | null;
  submitted_at: string;
  department_name: string;
  my_level: number;
}

function ageDays(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export default function ApprovalsInboxPage() {
  const navigate = useNavigate();
  const [rows, setRows]       = useState<InboxRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await travelRequestApi.pendingApprovals();
      setRows(r.data.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <Inbox className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Approval Inbox
            </h1>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              Requests currently awaiting your decision.
            </p>
          </div>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass p-10 text-center">
          <CheckSquare className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'rgb(var(--status-success))' }} />
          <p className="text-sm font-semibold"
            style={{ color: 'rgb(var(--content-primary))' }}>You're all caught up</p>
          <p className="text-xs mt-1" style={{ color: 'rgb(var(--content-muted))' }}>
            No requests waiting for your action.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const age = ageDays(r.submitted_at);
            const ageColor = age >= 3 ? 'var(--status-danger)'
                          : age >= 1 ? 'var(--status-warning)'
                          : 'var(--status-success)';
            return (
              <motion.div key={r.id}
                onClick={() => navigate(`/approvals/${r.id}`)}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ x: 2 }}
                className="glass p-4 cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgb(var(--accent-subtle))' }}>
                    <Plane className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold"
                        style={{ color: 'rgb(var(--content-primary))' }}>
                        {r.request_code}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          background: 'rgb(var(--status-warning)/0.15)',
                          color: 'rgb(var(--status-warning))',
                        }}>
                        L{r.my_level} pending
                      </span>
                      {r.urgency === 'URGENT' && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                          style={{
                            background: 'rgb(var(--status-danger)/0.12)',
                            color: 'rgb(var(--status-danger))',
                          }}>
                          Urgent
                        </span>
                      )}
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
                        style={{
                          background: `rgb(${ageColor}/0.12)`,
                          color: `rgb(${ageColor})`,
                        }}>
                        {age === 0 ? 'today' : `${age}d ago`}
                      </span>
                    </div>
                    <p className="text-xs mt-1 font-medium"
                      style={{ color: 'rgb(var(--content-primary))' }}>
                      {r.traveler_full_name}
                      <span className="ml-1 font-normal"
                        style={{ color: 'rgb(var(--content-muted))' }}>
                        ({r.request_for.replace('_', ' ')})
                      </span>
                    </p>
                    <p className="text-[11px] mt-1 inline-flex items-center gap-1 flex-wrap"
                      style={{ color: 'rgb(var(--content-secondary))' }}>
                      <MapPin className="w-3 h-3" />
                      {r.booking_boarding || '—'} → {r.booking_destination || '—'}
                      <Calendar className="w-3 h-3 ml-2" />
                      {r.booking_departure_date
                        ? new Date(r.booking_departure_date).toLocaleDateString('en-IN',
                            { day: '2-digit', month: 'short' })
                        : '—'}
                    </p>
                    <p className="text-[10px] mt-0.5"
                      style={{ color: 'rgb(var(--content-muted))' }}>
                      {r.reason_of_travel} · {r.department_name}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 flex-shrink-0"
                    style={{ color: 'rgb(var(--content-muted))' }} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
