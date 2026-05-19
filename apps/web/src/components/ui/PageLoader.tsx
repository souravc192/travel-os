import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';

// ─── Full-page loader (used during auth init) ─────────────────
export default function PageLoader() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'rgb(var(--surface-primary))' }}
    >
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgb(var(--accent))' }}
          animate={{ rotate: [0, 10, -10, 10, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Plane className="w-6 h-6 text-white" fill="currentColor" />
        </motion.div>
        <motion.div
          className="flex gap-1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: 'rgb(var(--accent))' }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </motion.div>
        <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
          Loading Travel OS…
        </p>
      </div>
    </div>
  );
}

// ─── Card skeleton ────────────────────────────────────────────
export function CardSkeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-2xl ${className}`} />;
}

// ─── Metric card skeleton ─────────────────────────────────────
export function MetricSkeleton() {
  return (
    <div className="glass p-5 space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-8 w-8 rounded-xl" />
      </div>
      <div className="skeleton h-7 w-32 rounded" />
      <div className="skeleton h-2 w-full rounded" />
    </div>
  );
}

// ─── Table row skeleton ───────────────────────────────────────
export function TableRowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl"
          style={{ background: 'rgb(var(--surface-elevated))' }}>
          <div className="skeleton h-8 w-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 rounded" style={{ width: `${50 + Math.random() * 30}%` }} />
            <div className="skeleton h-2.5 rounded" style={{ width: `${30 + Math.random() * 20}%` }} />
          </div>
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton h-6 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ─── Inline spinner ───────────────────────────────────────────
export function Spinner({ size = 16, color = 'rgb(var(--accent))' }: { size?: number; color?: string }) {
  return (
    <motion.div
      className="rounded-full border-2"
      style={{
        width: size,
        height: size,
        borderColor: `${color}30`,
        borderTopColor: color,
      }}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
    />
  );
}
