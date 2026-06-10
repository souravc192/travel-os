import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, ArrowLeft, Building2, Tag, Activity, TrendingUp } from 'lucide-react';
import { complaintApi } from '../../lib/api';

interface VendorRow {
  vendor: string; total: number; open_count: number; resolved_count: number;
  critical_count: number; high_count: number;
}
interface CatRow    { category: string; total: number; }
interface StatusRow { status: string; total: number; }
interface MonthRow  { month: string; total: number; }

interface Analytics {
  byVendor: VendorRow[];
  byCategory: CatRow[];
  byStatus: StatusRow[];
  byMonth: MonthRow[];
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'var(--status-warning)', ASSIGNED: 'var(--status-info)',
  IN_PROGRESS: 'var(--status-info)', RESOLVED: 'var(--status-success)',
  CLOSED: 'var(--content-muted)',
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgb(var(--surface-elevated))' }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `rgb(${color})` }} />
    </div>
  );
}

export default function ComplaintAnalyticsPage() {
  const navigate = useNavigate();
  const [data, setData]       = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    complaintApi.vendorAnalytics()
      .then((r) => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 max-w-4xl mx-auto space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="skeleton h-40 rounded-xl" />)}
    </div>;
  }

  const totalComplaints = data?.byStatus.reduce((s, x) => s + x.total, 0) ?? 0;
  const maxVendor = Math.max(1, ...(data?.byVendor.map((v) => v.total) ?? [1]));
  const maxCat    = Math.max(1, ...(data?.byCategory.map((c) => c.total) ?? [1]));
  const maxMonth  = Math.max(1, ...(data?.byMonth.map((m) => m.total) ?? [1]));

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/complaints')} className="p-2 rounded-xl"
          style={{ background: 'rgb(var(--surface-elevated))' }}>
          <ArrowLeft className="w-4 h-4" style={{ color: 'rgb(var(--content-secondary))' }} />
        </button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgb(var(--accent-subtle))' }}>
          <BarChart3 className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: 'rgb(var(--content-primary))' }}>
            Complaint Analytics
          </h1>
          <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
            {totalComplaints} complaint{totalComplaints === 1 ? '' : 's'} tracked
          </p>
        </div>
      </div>

      {/* Status summary chips */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {data?.byStatus.map((s) => (
          <div key={s.status} className="glass p-3 rounded-xl">
            <p className="text-[10px] uppercase tracking-wide font-semibold"
              style={{ color: `rgb(${STATUS_COLOR[s.status] ?? 'var(--content-muted)'})` }}>
              {s.status.replace('_', ' ')}
            </p>
            <p className="font-mono text-xl font-bold mt-1" style={{ color: 'rgb(var(--content-primary))' }}>
              {s.total}
            </p>
          </div>
        ))}
      </div>

      {/* Vendor-wise trend (F4) */}
      <div className="glass p-5">
        <h2 className="font-display text-sm font-semibold mb-4 flex items-center gap-2"
          style={{ color: 'rgb(var(--content-primary))' }}>
          <Building2 className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} /> Vendor-wise Complaints
        </h2>
        {(!data || data.byVendor.length === 0) ? (
          <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>No data yet.</p>
        ) : (
          <div className="space-y-3">
            {data.byVendor.map((v) => (
              <motion.div key={v.vendor} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                    {v.vendor}
                  </span>
                  <div className="flex items-center gap-2">
                    {v.critical_count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: 'rgb(var(--status-danger)/0.12)', color: 'rgb(var(--status-danger))' }}>
                        {v.critical_count} critical
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgb(var(--status-warning)/0.12)', color: 'rgb(var(--status-warning))' }}>
                      {v.open_count} open
                    </span>
                    <span className="font-mono text-xs font-bold" style={{ color: 'rgb(var(--content-primary))' }}>
                      {v.total}
                    </span>
                  </div>
                </div>
                <Bar value={v.total} max={maxVendor} color="var(--accent)" />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Category */}
        <div className="glass p-5">
          <h2 className="font-display text-sm font-semibold mb-4 flex items-center gap-2"
            style={{ color: 'rgb(var(--content-primary))' }}>
            <Tag className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} /> By Category
          </h2>
          {(!data || data.byCategory.length === 0) ? (
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>No data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.byCategory.map((c) => (
                <div key={c.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: 'rgb(var(--content-secondary))' }}>{c.category}</span>
                    <span className="font-mono text-xs font-bold" style={{ color: 'rgb(var(--content-primary))' }}>{c.total}</span>
                  </div>
                  <Bar value={c.total} max={maxCat} color="var(--status-info)" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monthly trend */}
        <div className="glass p-5">
          <h2 className="font-display text-sm font-semibold mb-4 flex items-center gap-2"
            style={{ color: 'rgb(var(--content-primary))' }}>
            <TrendingUp className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} /> Monthly Trend
          </h2>
          {(!data || data.byMonth.length === 0) ? (
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>No data yet.</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {data.byMonth.map((mo) => {
                const pct = Math.round((mo.total / maxMonth) * 100);
                return (
                  <div key={mo.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t-lg flex items-end justify-center" style={{ height: '100%' }}>
                      <motion.div initial={{ height: 0 }} animate={{ height: `${pct}%` }}
                        className="w-full rounded-t-lg flex items-start justify-center pt-1"
                        style={{ background: 'rgb(var(--accent))', minHeight: mo.total > 0 ? 8 : 0 }}>
                        <span className="text-[9px] font-mono font-bold text-white">{mo.total || ''}</span>
                      </motion.div>
                    </div>
                    <span className="text-[9px] font-mono" style={{ color: 'rgb(var(--content-muted))' }}>
                      {mo.month.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
