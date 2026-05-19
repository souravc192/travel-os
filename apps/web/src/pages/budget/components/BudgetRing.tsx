import { motion } from 'framer-motion';

interface BudgetRingProps {
  pct: number;
  label?: string;
  value?: string;
  size?: number;
}

export default function BudgetRing({ pct, label, value, size = 160 }: BudgetRingProps) {
  const r    = (size / 2) - 12;
  const circ = 2 * Math.PI * r;
  const safePct = Math.max(0, Math.min(pct, 100));
  const color =
    pct < 50 ? 'var(--status-success)' :
    pct < 70 ? 'var(--status-warning)' :
    pct < 90 ? '#F97316'               :
               'var(--status-danger)';

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth="10"
          stroke="rgb(var(--surface-overlay))"
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth="10"
          stroke={`rgb(${color})`}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (circ * safePct) / 100 }}
          transition={{ duration: 1.4, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
        />
      </svg>
      <div className="text-center -mt-1">
        <p className="text-3xl font-bold font-mono" style={{ color: `rgb(${color})` }}>
          {Math.round(pct)}%
        </p>
        {label && (
          <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
        )}
        {value && (
          <p className="text-[11px] font-mono mt-1" style={{ color: 'rgb(var(--content-secondary))' }}>
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
