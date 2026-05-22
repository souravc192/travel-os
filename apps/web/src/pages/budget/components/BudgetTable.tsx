import { motion } from 'framer-motion';
import { ArrowUpDown, Eye } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { BudgetSummary } from '../../../hooks/useBudget';

interface BudgetTableProps {
  rows: BudgetSummary[];
  onSelect?: (row: BudgetSummary) => void;
}

type SortKey = 'department' | 'allocated' | 'consumed' | 'remaining' | 'utilization';

function inr(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function utilBadge(pct: number) {
  if (pct < 50)  return { color: 'var(--status-success)', label: 'Healthy' };
  if (pct < 70)  return { color: 'var(--status-warning)', label: 'Watch'   };
  if (pct < 90)  return { color: '#F97316',               label: 'High'    };
  if (pct < 100) return { color: 'var(--status-danger)',  label: 'Critical'};
  return            { color: 'var(--status-danger)',  label: 'Over'    };
}

export default function BudgetTable({ rows, onSelect }: BudgetTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('utilization');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case 'department':  av = a.departmentName;     bv = b.departmentName;     break;
        case 'allocated':   av = a.allocatedAnnual;    bv = b.allocatedAnnual;    break;
        case 'consumed':    av = a.consumed;           bv = b.consumed;           break;
        case 'remaining':   av = a.remaining;          bv = b.remaining;          break;
        case 'utilization': av = a.utilizationPct;     bv = b.utilizationPct;     break;
      }
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggle(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  }

  function Th({ k, children, align = 'left' }: { k: SortKey; children: React.ReactNode; align?: 'left' | 'right' }) {
    return (
      <th onClick={() => toggle(k)}
        className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none
          ${align === 'right' ? 'text-right' : 'text-left'}`}
        style={{ color: 'rgb(var(--content-muted))' }}>
        <span className="inline-flex items-center gap-1">
          {children}
          <ArrowUpDown className="w-3 h-3 opacity-50" />
        </span>
      </th>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="glass p-10 text-center">
        <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
          No budget records for the selected fiscal year.
        </p>
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: 'rgb(var(--surface-elevated))' }}>
            <tr>
              <Th k="department">Department</Th>
              <Th k="allocated"  align="right">Allocated</Th>
              <Th k="consumed"   align="right">Consumed</Th>
              <Th k="remaining"  align="right">Remaining</Th>
              <Th k="utilization" align="right">Utilization</Th>
              <th className="px-3 py-2.5 w-12" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const u = utilBadge(r.utilizationPct);
              return (
                <motion.tr key={r.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                  className="border-t cursor-pointer hover:bg-[rgb(var(--surface-elevated))]"
                  style={{ borderColor: 'rgb(var(--border-subtle))' }}
                  onClick={() => onSelect?.(r)}>
                  <td className="px-3 py-3">
                    <div className="text-xs font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                      {r.departmentName}
                    </div>
                    <div className="text-[10px] font-mono" style={{ color: 'rgb(var(--content-muted))' }}>
                      FY {r.fiscalYear}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs" style={{ color: 'rgb(var(--content-primary))' }}>
                    {inr(r.allocatedAnnual)}
                    {r.supplementaryApproved > 0 && (
                      <div className="text-[10px]" style={{ color: 'rgb(var(--status-info))' }}>
                        +{inr(r.supplementaryApproved)} added
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs" style={{ color: 'rgb(var(--content-primary))' }}>
                    {inr(r.consumed)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs font-semibold"
                    style={{ color: `rgb(${u.color})` }}>
                    {inr(r.remaining)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'rgb(var(--surface-overlay))' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${Math.min(r.utilizationPct, 100)}%`, background: `rgb(${u.color})` }} />
                        </div>
                        <span className="font-mono text-xs font-semibold w-12 text-right"
                          style={{ color: `rgb(${u.color})` }}>
                          {r.utilizationPct.toFixed(1)}%
                        </span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide font-semibold"
                        style={{ color: `rgb(${u.color})` }}>
                        {u.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Eye className="w-4 h-4 inline-block" style={{ color: 'rgb(var(--content-muted))' }} />
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
