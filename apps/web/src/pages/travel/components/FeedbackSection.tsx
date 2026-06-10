import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Star, MessageSquareHeart, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { feedbackApi } from '../../../lib/api';

interface FeedbackData {
  id: string;
  overallRating: number;
  bookingRating: number | null;
  accommodationRating: number | null;
  transportRating: number | null;
  travelDeskRating: number | null;
  wouldRecommend: boolean | null;
  liked: string | null;
  improvements: string | null;
  comments: string | null;
  createdAt: string;
}

interface Props {
  requestId: string;
}

const ASPECTS: Array<{ key: 'bookingRating' | 'accommodationRating' | 'transportRating' | 'travelDeskRating'; label: string }> = [
  { key: 'bookingRating',       label: 'Booking Experience' },
  { key: 'accommodationRating', label: 'Accommodation' },
  { key: 'transportRating',     label: 'Transport' },
  { key: 'travelDeskRating',    label: 'Travel Desk Support' },
];

function StarRow({ value, onChange, readOnly }: {
  value: number | null; onChange?: (n: number) => void; readOnly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (hover || value || 0) >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(0)}
            onClick={() => !readOnly && onChange?.(n)}
            className={readOnly ? 'cursor-default' : 'cursor-pointer'}>
            <Star className="w-5 h-5"
              style={{
                color: active ? 'rgb(var(--status-warning))' : 'rgb(var(--content-muted))',
                fill: active ? 'rgb(var(--status-warning))' : 'none',
              }} />
          </button>
        );
      })}
    </div>
  );
}

const inputCx = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = {
  background: 'rgb(var(--surface-elevated))',
  border:     '1px solid rgb(var(--border-subtle))',
  color:      'rgb(var(--content-primary))',
};

export default function FeedbackSection({ requestId }: Props) {
  const [loading,  setLoading]  = useState(true);
  const [existing, setExisting] = useState<FeedbackData | null>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [windowDays, setWindowDays] = useState(30);
  const [windowOpen, setWindowOpen] = useState(false);

  // Form state
  const [overall,       setOverall]       = useState(0);
  const [aspect,        setAspect]        = useState<Record<string, number | null>>({});
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [liked,         setLiked]         = useState('');
  const [improvements,  setImprovements]  = useState('');
  const [comments,      setComments]      = useState('');

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await feedbackApi.byRequest(requestId);
      const d = r.data.data;
      setExisting(d.feedback);
      setCanSubmit(d.canSubmit);
      setWindowOpen(d.windowOpen);
      setWindowDays(d.windowDays);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [requestId]);  // eslint-disable-line

  async function submit() {
    setError(null);
    if (overall < 1) { setError('Please give an overall rating.'); return; }
    setBusy(true);
    try {
      await feedbackApi.create({
        travelRequestId:     requestId,
        overallRating:       overall,
        bookingRating:       aspect.bookingRating ?? null,
        accommodationRating: aspect.accommodationRating ?? null,
        transportRating:     aspect.transportRating ?? null,
        travelDeskRating:    aspect.travelDeskRating ?? null,
        wouldRecommend,
        liked:        liked.trim() || null,
        improvements: improvements.trim() || null,
        comments:     comments.trim() || null,
      });
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Could not submit feedback.');
    } finally { setBusy(false); }
  }

  if (loading) return <div className="skeleton h-40 w-full rounded-xl" />;

  // ── Already submitted → read-only view ──
  if (existing) {
    return (
      <div className="glass p-5">
        <h2 className="font-display text-sm font-semibold mb-3 flex items-center gap-2"
          style={{ color: 'rgb(var(--content-primary))' }}>
          <MessageSquareHeart className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
          Trip Feedback
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold"
            style={{ background: 'rgb(var(--status-success)/0.12)', color: 'rgb(var(--status-success))' }}>
            Submitted
          </span>
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: 'rgb(var(--content-secondary))' }}>Overall</span>
            <StarRow value={existing.overallRating} readOnly />
          </div>
          {ASPECTS.map(({ key, label }) => existing[key] != null && (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>{label}</span>
              <StarRow value={existing[key]} readOnly />
            </div>
          ))}
          {existing.wouldRecommend != null && (
            <p className="text-xs" style={{ color: 'rgb(var(--content-secondary))' }}>
              Would recommend: <strong>{existing.wouldRecommend ? 'Yes' : 'No'}</strong>
            </p>
          )}
          {existing.liked && <ReadField label="What went well" value={existing.liked} />}
          {existing.improvements && <ReadField label="What to improve" value={existing.improvements} />}
          {existing.comments && <ReadField label="Comments" value={existing.comments} />}
        </div>
      </div>
    );
  }

  // ── Window closed and no submission → locked notice ──
  if (!canSubmit) {
    return (
      <div className="glass p-5">
        <h2 className="font-display text-sm font-semibold mb-2 flex items-center gap-2"
          style={{ color: 'rgb(var(--content-primary))' }}>
          <MessageSquareHeart className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
          Trip Feedback
        </h2>
        <p className="text-xs flex items-center gap-2" style={{ color: 'rgb(var(--content-muted))' }}>
          <Lock className="w-3.5 h-3.5" />
          {windowOpen
            ? 'Only the traveler who raised this request can give feedback.'
            : `The ${windowDays}-day feedback window has closed.`}
        </p>
      </div>
    );
  }

  // ── Editable form ──
  return (
    <div className="glass p-5">
      <h2 className="font-display text-sm font-semibold mb-1 flex items-center gap-2"
        style={{ color: 'rgb(var(--content-primary))' }}>
        <MessageSquareHeart className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
        Share Your Feedback
      </h2>
      <p className="text-[11px] mb-4" style={{ color: 'rgb(var(--content-muted))' }}>
        Open for {windowDays} days after completion. Your input helps us improve travel services.
      </p>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
            Overall Experience <span style={{ color: 'rgb(var(--status-danger))' }}>*</span>
          </span>
          <StarRow value={overall} onChange={setOverall} />
        </div>

        <div className="pt-2 border-t space-y-2.5" style={{ borderColor: 'rgb(var(--border-subtle))' }}>
          {ASPECTS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'rgb(var(--content-secondary))' }}>{label}</span>
              <StarRow value={aspect[key] ?? null}
                onChange={(n) => setAspect((p) => ({ ...p, [key]: n }))} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs flex-1" style={{ color: 'rgb(var(--content-secondary))' }}>
            Would you recommend this travel process?
          </span>
          {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map(({ v, l }) => (
            <button key={l} type="button"
              onClick={() => setWouldRecommend(v)}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={wouldRecommend === v
                ? { background: 'rgb(var(--accent))', color: '#fff' }
                : { background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}>
              {l}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs font-medium block mb-1.5"
            style={{ color: 'rgb(var(--content-secondary))' }}>What went well? (optional)</label>
          <textarea rows={2} value={liked} onChange={(e) => setLiked(e.target.value)}
            className={inputCx} style={inputStyle} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1.5"
            style={{ color: 'rgb(var(--content-secondary))' }}>What could be improved? (optional)</label>
          <textarea rows={2} value={improvements} onChange={(e) => setImprovements(e.target.value)}
            className={inputCx} style={inputStyle} />
        </div>
        <div>
          <label className="text-xs font-medium block mb-1.5"
            style={{ color: 'rgb(var(--content-secondary))' }}>Additional comments (optional)</label>
          <textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)}
            className={inputCx} style={inputStyle} />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-xl text-xs"
            style={{ color: 'rgb(var(--status-danger))', background: 'rgb(var(--status-danger)/0.08)' }}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        <motion.button whileTap={{ scale: 0.98 }}
          onClick={submit} disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'rgb(var(--accent))' }}>
          <CheckCircle2 className="w-4 h-4" />
          {busy ? 'Submitting…' : 'Submit Feedback'}
        </motion.button>
      </div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-2 border-t" style={{ borderColor: 'rgb(var(--border-subtle))' }}>
      <p className="text-[10px] uppercase tracking-wide font-semibold"
        style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
      <p className="text-xs mt-0.5" style={{ color: 'rgb(var(--content-secondary))' }}>{value}</p>
    </div>
  );
}
