import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Package, Search, ArrowRight, Plane, Train, Bus, Car, Hotel, Box,
  CheckCircle2, Clock, XCircle, RefreshCw,
} from 'lucide-react';
import { bookingApi } from '../../lib/api';
import { BookingStatus, BookingType } from '@travel-os/shared-types';

interface Row {
  id: string;
  travelRequestId: string;
  requestCode: string;
  bookingType: BookingType;
  bookingStatus: BookingStatus;
  vendorName: string;
  amount: number;
  bookingReference: string | null;
  bookingDate: string;
  createdAt: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  FLIGHT: Plane, TRAIN: Train, BUS: Bus, CAB: Car, HOTEL: Hotel, OTHER: Box,
};
const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING:     { label: 'Pending',     color: 'var(--status-warning)', icon: Clock },
  CONFIRMED:   { label: 'Confirmed',   color: 'var(--status-success)', icon: CheckCircle2 },
  CANCELLED:   { label: 'Cancelled',   color: 'var(--status-danger)',  icon: XCircle },
  RESCHEDULED: { label: 'Rescheduled', color: 'var(--status-info)',    icon: RefreshCw },
};

function inr(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000)    return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function BookingsListPage() {
  const navigate = useNavigate();
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      const r = await bookingApi.list({
        search: search || undefined,
        status: filter || undefined,
      });
      setRows(r.data.data);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [search, filter]); // eslint-disable-line

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgb(var(--accent-subtle))' }}>
          <Package className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold"
            style={{ color: 'rgb(var(--content-primary))' }}>
            Bookings
          </h1>
          <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
            All bookings across the org. Open a request to add/edit bookings.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor or PNR…"
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
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="glass p-10 text-center">
          <Package className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
            No bookings recorded yet.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => {
            const TypeIcon = TYPE_ICON[r.bookingType] ?? Box;
            const sMeta    = STATUS_META[r.bookingStatus];
            const SIcon    = sMeta.icon;
            return (
              <motion.div key={r.id}
                onClick={() => navigate(`/travel/requests/${r.travelRequestId}`)}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ x: 2 }}
                className="glass p-3 flex items-center gap-3 cursor-pointer">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `rgb(${sMeta.color}/0.12)` }}>
                  <TypeIcon className="w-4 h-4" style={{ color: `rgb(${sMeta.color})` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold"
                      style={{ color: 'rgb(var(--content-primary))' }}>
                      {r.vendorName}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-1"
                      style={{ background: `rgb(${sMeta.color}/0.12)`, color: `rgb(${sMeta.color})` }}>
                      <SIcon className="w-3 h-3" /> {sMeta.label}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-muted))' }}>
                      {r.bookingType}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5 font-mono"
                    style={{ color: 'rgb(var(--content-secondary))' }}>
                    {r.requestCode} {r.bookingReference && `· ref ${r.bookingReference}`}
                    {` · ${new Date(r.bookingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
                  </p>
                </div>
                <p className="font-mono text-sm font-bold flex-shrink-0"
                  style={{ color: 'rgb(var(--content-primary))' }}>{inr(r.amount)}</p>
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
