import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plane, User, Users, GraduationCap, UserPlus, Calendar, Building2,
  AlertTriangle, CheckCircle2, ChevronDown, Search, Hotel, Clock,
} from 'lucide-react';
import {
  REASON_OF_TRAVEL_OPTIONS, RequestFor, RequestKind, UrgencyLevel, UserRole,
  computeUrgency, SegmentTravelMode, HotelRequirement,
} from '@travel-os/shared-types';
import { useAuthStore } from '../../store/auth.store';
import { memberApi, travelRequestApi } from '../../lib/api';

// ─── Form state ───────────────────────────────────────────────
interface FormState {
  submittedOnBehalf: boolean;
  urgency: UrgencyLevel;
  reasonOfTravel: string;
  reasonOfTravelOther: string;
  employeeCode: string;        // PW0086 etc.
  onBehalfCostCentre: string;  // only when submittedOnBehalf = true

  // Autofilled (read-only)
  fullName: string;
  email: string;
  designation: string;
  departmentName: string;
  l1Email: string;
  l2Email: string;
  l3Email: string;
  hodEmail: string;
  cxoEmail: string;
  noOfApprovers: number;

  // Expansion-only
  expansionCenterId: string;

  // Type
  requestFor: RequestFor | '';
  requestKind: RequestKind;
  reservationType: 'TRAVEL' | 'STAY' | 'TRAVEL_AND_STAY';
  extensionStartDate: string;
  initialRequestId: string;

  // Type-specific
  studentDetails:    { noOfStudents: string; sheetLink: string; reason: string; remarks: string };
  guestDetails:      { name: string; hostingDepartment: string; emailId: string; purpose: string; remarks: string };
  newMemberDetails:  { employeeName: string; candidateId: string; emailId: string; joiningDepartment: string; remarks: string };
  eventDetails:      { eventName: string; noOfMembers: string; sheetLink: string; reason: string; remarks: string };

  // Traveler details (for non-PW_MEMBER)
  travelerDetails: {
    name: string; employeeId: string; contactNo: string; emailId: string;
    gender: string; dob: string;
  };

  // Multi-segment travel (Phase 5B)
  travelSegments: Array<{
    fromLocation:  string;
    toLocation:    string;
    travelDate:    string;
    preferredTime: string;
    travelMode:    SegmentTravelMode;
    notes:         string;
  }>;
  accommodationSegments: Array<{
    city:                 string;
    center:               string;
    checkInDate:          string;
    checkOutDate:         string;
    hotelRequirement:     HotelRequirement;
    hotelRequirementOther:string;
    notes:                string;
  }>;
  purpose: string;
  remarks: string;
}

const initial: FormState = {
  submittedOnBehalf: false,
  urgency: UrgencyLevel.NORMAL,
  reasonOfTravel: '',
  reasonOfTravelOther: '',
  employeeCode: '',
  onBehalfCostCentre: '',
  fullName: '', email: '', designation: '', departmentName: '',
  l1Email: '', l2Email: '', l3Email: '', hodEmail: '', cxoEmail: '', noOfApprovers: 0,
  expansionCenterId: '',
  requestFor: '', requestKind: RequestKind.NEW_REQUEST,
  reservationType: 'TRAVEL',
  extensionStartDate: '', initialRequestId: '',
  studentDetails:   { noOfStudents: '', sheetLink: '', reason: '', remarks: '' },
  guestDetails:     { name: '', hostingDepartment: '', emailId: '', purpose: '', remarks: '' },
  newMemberDetails: { employeeName: '', candidateId: '', emailId: '', joiningDepartment: '', remarks: '' },
  eventDetails:     { eventName: '', noOfMembers: '', sheetLink: '', reason: '', remarks: '' },
  travelerDetails:  { name: '', employeeId: '', contactNo: '', emailId: '', gender: '', dob: '' },
  travelSegments: [{
    fromLocation: '', toLocation: '', travelDate: '', preferredTime: '',
    travelMode: SegmentTravelMode.FLIGHT, notes: '',
  }],
  accommodationSegments: [],
  purpose: '', remarks: '',
};

// ─── Segment enum labels ───────────────────────────────────────
const TRAVEL_MODE_LABEL: Record<SegmentTravelMode, string> = {
  [SegmentTravelMode.FLIGHT]:     'Flight',
  [SegmentTravelMode.TRAIN]:      'Train',
  [SegmentTravelMode.BUS]:        'Bus',
  [SegmentTravelMode.CAB]:        'Cab',
  [SegmentTravelMode.SELF_DRIVE]: 'Self-Drive',
  [SegmentTravelMode.TRAVELLER]:  'Tempo Traveller',
  [SegmentTravelMode.OTHER]:      'Other',
};
const HOTEL_REQ_LABEL: Record<HotelRequirement, string> = {
  [HotelRequirement.SHARING]:           'Sharing',
  [HotelRequirement.NON_SHARING]:       'Non-Sharing',
  [HotelRequirement.SINGLE]:            'Single',
  [HotelRequirement.DOUBLE]:            'Double',
  [HotelRequirement.SUITE]:             'Suite',
  [HotelRequirement.SERVICE_APARTMENT]: 'Service Apartment',
  [HotelRequirement.OTHER]:             'Other',
};

const REQUEST_FOR_CARDS: { value: RequestFor; label: string; icon: React.ElementType; sub: string }[] = [
  { value: RequestFor.PW_MEMBER,  label: 'PW Member',   icon: User,         sub: 'For yourself or a team member' },
  { value: RequestFor.STUDENT,    label: 'Student',     icon: GraduationCap, sub: 'Bulk student travel' },
  { value: RequestFor.GUEST,      label: 'Guest',       icon: UserPlus,     sub: 'External visitor' },
  { value: RequestFor.NEW_MEMBER, label: 'New Member',  icon: Users,        sub: 'Joining employee' },
  { value: RequestFor.EVENT,      label: 'Event',       icon: Calendar,     sub: 'Event-related travel' },
];

// ─── Reusable input shells ────────────────────────────────────
function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium block mb-1.5"
        style={{ color: 'rgb(var(--content-secondary))' }}>{label}</label>
      {children}
      {hint && !error && (
        <p className="text-[10px] mt-1" style={{ color: 'rgb(var(--content-muted))' }}>{hint}</p>
      )}
      {error && <p className="text-[10px] mt-1" style={{ color: 'rgb(var(--status-danger))' }}>{error}</p>}
    </div>
  );
}

const inputCx = "form-input w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-colors focus:ring-2 focus:ring-[rgb(var(--accent)/0.35)]";

// ─── Urgency badge (read-only, auto-computed) ─────────────────
const URGENCY_META: Record<UrgencyLevel, { label: string; color: string; sub: string }> = {
  [UrgencyLevel.NORMAL]:    { label: 'Normal',    color: 'var(--status-success)', sub: '≥ 4 days from today' },
  [UrgencyLevel.URGENT]:    { label: 'Urgent',    color: 'var(--status-warning)', sub: '1–3 days from today' },
  [UrgencyLevel.EMERGENCY]: { label: 'Emergency', color: 'var(--status-danger)',  sub: 'Same day · within 24h' },
};
function UrgencyBadge({ urgency, hasDeparture }: { urgency: UrgencyLevel; hasDeparture: boolean }) {
  if (!hasDeparture) {
    return (
      <div className="px-3 py-2 rounded-xl text-xs font-medium"
        style={{
          background: 'rgb(var(--surface-elevated))',
          color: 'rgb(var(--content-muted))',
          border: '1px dashed rgb(var(--border-subtle))',
        }}>
        Pending departure date
      </div>
    );
  }
  const m = URGENCY_META[urgency];
  return (
    <div className="px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-2"
      style={{
        background: `rgb(${m.color}/0.12)`,
        color: `rgb(${m.color})`,
        border: `1px solid rgb(${m.color}/0.35)`,
      }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${m.color})` }} />
      {m.label}
      <span className="opacity-60 font-normal">· {m.sub}</span>
    </div>
  );
}

function Section({ title, children, icon: Icon, elevated }: {
  title: string; children: React.ReactNode; icon?: React.ElementType; elevated?: boolean;
}) {
  return (
    <motion.section
      className={`glass p-5 overflow-visible ${elevated ? 'relative z-50' : 'relative'}`}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h2 className="font-display text-sm font-semibold mb-4 flex items-center gap-2"
        style={{ color: 'rgb(var(--content-primary))' }}>
        {Icon && <Icon className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />}
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </motion.section>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function NewTravelRequestPage() {
  const navigate = useNavigate();
  const { user, employee } = useAuthStore();
  const [f, setF]               = useState<FormState>(initial);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonFilter, setReasonFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Hide designation from User + HOD (confidential) ──
  const canSeeDesignation =
    user?.role === UserRole.OWNER ||
    user?.role === UserRole.ADMIN ||
    user?.role === UserRole.TRAVEL_TEAM;

  // ── Auto-compute urgency from the EARLIEST travel-segment date ──
  const earliestTravelDate = useMemo(() => {
    const dates = f.travelSegments.map((s) => s.travelDate).filter(Boolean).sort();
    return dates[0] ?? '';
  }, [f.travelSegments]);

  useEffect(() => {
    if (!earliestTravelDate) return;
    const newUrgency = computeUrgency(new Date(), new Date(earliestTravelDate));
    if (newUrgency !== f.urgency) {
      setF((p) => ({ ...p, urgency: newUrgency }));
    }
  }, [earliestTravelDate]); // eslint-disable-line

  function patch<K extends keyof FormState>(key: K, val: FormState[K]) {
    setF((prev) => ({ ...prev, [key]: val }));
  }

  // ── Pre-fill from authenticated user if NOT submitting on behalf ──
  useEffect(() => {
    if (!f.submittedOnBehalf && employee?.employeeCode && !f.employeeCode) {
      patch('employeeCode', employee.employeeCode);
    }
  }, [f.submittedOnBehalf, employee?.employeeCode]); // eslint-disable-line

  // ── Lookup employee on code change ──
  useEffect(() => {
    const code = f.employeeCode.trim();
    if (!code) {
      patch('fullName', ''); patch('email', ''); patch('designation', '');
      patch('departmentName', ''); patch('l1Email', ''); patch('l2Email', '');
      patch('l3Email', ''); patch('hodEmail', ''); patch('cxoEmail', '');
      patch('noOfApprovers', 0);
      setLookupErr(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await memberApi.lookup(code);
        const d = res.data.data;
        setF((p) => ({
          ...p,
          fullName: d.name ?? '',
          email: d.email ?? '',
          designation: d.designation ?? '',
          departmentName: d.department_name ?? '',
          l1Email: d.l1_email ?? '',
          l2Email: d.l2_email ?? '',
          l3Email: d.l3_email ?? '',
          hodEmail: d.hod_email ?? '',
          cxoEmail: d.cxo_email ?? '',
          noOfApprovers: Number(d.no_of_approvers ?? 0),
        }));
        setLookupErr(null);
      } catch (err: unknown) {
        const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
        setLookupErr(apiErr.response?.data?.error?.message ?? 'Could not find that Employee ID.');
        setF((p) => ({ ...p, fullName: '', email: '', designation: '',
          departmentName: '', l1Email: '', l2Email: '', l3Email: '',
          hodEmail: '', cxoEmail: '', noOfApprovers: 0 }));
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [f.employeeCode]);

  const filteredReasons = useMemo(
    () => REASON_OF_TRAVEL_OPTIONS.filter(o =>
      o.toLowerCase().includes(reasonFilter.toLowerCase())),
    [reasonFilter]
  );

  useEffect(() => {
    if (!reasonOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-reason-dropdown]');
      if (!el) setReasonOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [reasonOpen]);

  const showTypeOfRequest =
    f.requestFor === RequestFor.PW_MEMBER ||
    f.requestFor === RequestFor.GUEST ||
    f.requestFor === RequestFor.NEW_MEMBER;

  const isExtension = showTypeOfRequest && f.requestKind === RequestKind.EXTENSION;
  const showStayBlock = f.accommodationSegments.length > 0;

  // ── Final validate ──
  function valid(): string | null {
    if (!f.reasonOfTravel) return 'Reason of travel is required.';
    if (f.reasonOfTravel === 'Others' && f.reasonOfTravelOther.trim().length < 3)
      return 'Specify the reason in the text box.';
    if (!f.employeeCode || !f.fullName) return 'Enter a valid Employee ID.';
    if (!f.requestFor) return 'Pick a Request For category.';
    if (isExtension && (!f.initialRequestId || !f.extensionStartDate))
      return 'Extension requires Initial Request ID and start date.';
    if (f.travelSegments.length === 0)
      return 'Add at least one travel segment.';
    for (let i = 0; i < f.travelSegments.length; i++) {
      const s = f.travelSegments[i];
      if (!s.fromLocation.trim() || !s.toLocation.trim() || !s.travelDate)
        return `Travel segment ${i + 1}: from, to, and travel date are required.`;
      if (s.fromLocation.trim().toLowerCase() === s.toLocation.trim().toLowerCase())
        return `Travel segment ${i + 1}: from and to must differ.`;
      if (i > 0 && s.travelDate < f.travelSegments[i - 1].travelDate)
        return `Travel segment ${i + 1} has an earlier date than the previous one.`;
    }
    for (let i = 0; i < f.accommodationSegments.length; i++) {
      const a = f.accommodationSegments[i];
      if (!a.city.trim() || !a.checkInDate || !a.checkOutDate)
        return `Accommodation ${i + 1}: city, check-in & check-out are required.`;
      if (a.checkOutDate <= a.checkInDate)
        return `Accommodation ${i + 1}: check-out must be after check-in.`;
      if (a.hotelRequirement === HotelRequirement.OTHER && a.hotelRequirementOther.trim().length < 2)
        return `Accommodation ${i + 1}: specify the requirement when choosing Other.`;
    }
    if (f.submittedOnBehalf && !f.onBehalfCostCentre.trim())
      return 'On-behalf cost centre is required.';
    if (f.departmentName === 'Expansion' && !f.expansionCenterId.trim())
      return 'Center ID is required for Expansion department travel.';
    return null;
  }

  async function submit() {
    const err = valid();
    if (err) { setSubmitError(err); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await travelRequestApi.create({
        submittedOnBehalf: f.submittedOnBehalf,
        urgency: f.urgency,
        reasonOfTravel: f.reasonOfTravel,
        reasonOfTravelOther: f.reasonOfTravel === 'Others' ? f.reasonOfTravelOther : undefined,
        employeeCode: f.employeeCode.trim().toUpperCase(),
        onBehalfCostCentre: f.submittedOnBehalf ? f.onBehalfCostCentre : null,
        requestFor: f.requestFor,
        requestKind: showTypeOfRequest ? f.requestKind : RequestKind.NEW_REQUEST,
        reservationType: f.reservationType,
        needsStay: f.accommodationSegments.length > 0,
        extensionStartDate: isExtension ? f.extensionStartDate : null,
        initialRequestId: isExtension ? f.initialRequestId : null,
        studentDetails:    f.requestFor === RequestFor.STUDENT    ? f.studentDetails    : null,
        guestDetails:      f.requestFor === RequestFor.GUEST      ? f.guestDetails      : null,
        newMemberDetails:  f.requestFor === RequestFor.NEW_MEMBER ? f.newMemberDetails  : null,
        eventDetails:      f.requestFor === RequestFor.EVENT      ? f.eventDetails      : null,
        travelerDetails:   f.requestFor !== RequestFor.PW_MEMBER  ? f.travelerDetails   : null,
        travelSegments: f.travelSegments.map((s) => ({
          fromLocation: s.fromLocation.trim(),
          toLocation:   s.toLocation.trim(),
          travelDate:   s.travelDate,
          travelMode:   s.travelMode,
          preferredTime: s.preferredTime.trim() || null,
          notes:         s.notes.trim()         || null,
        })),
        accommodationSegments: f.accommodationSegments.map((a) => ({
          city:            a.city.trim(),
          center:          a.center.trim() || null,
          checkInDate:     a.checkInDate,
          checkOutDate:    a.checkOutDate,
          hotelRequirement:      a.hotelRequirement,
          hotelRequirementOther: a.hotelRequirement === HotelRequirement.OTHER
                                   ? a.hotelRequirementOther.trim()
                                   : null,
          notes:           a.notes.trim() || null,
        })),
        purpose:           f.purpose.trim() || null,
        remarks:           f.remarks.trim() || null,
        expansionCenterId: f.departmentName === 'Expansion' ? f.expansionCenterId.trim() : null,
      });
      navigate(`/travel/requests/${res.data.data.id}`);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
      setSubmitError(apiErr.response?.data?.error?.message ?? 'Submission failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-3xl mx-auto pb-32">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgb(var(--accent-subtle))' }}>
          <Plane className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold"
            style={{ color: 'rgb(var(--content-primary))' }}>
            New Travel Request
          </h1>
          <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
            Form ID auto-generated as <span className="font-mono">TR-{new Date().getFullYear()}-XXXXX</span> on submit.
          </p>
        </div>
      </div>

      {/* ── 1. Header ─────────────────────────────────────────── */}
      <Section title="Request Header" icon={Clock} elevated={reasonOpen}>
        <Field label="Submitting on someone's behalf?">
          <div className="flex gap-2">
            {[
              { v: false, label: 'No, this is for me' },
              { v: true,  label: 'Yes, on behalf' },
            ].map((o) => (
              <button key={String(o.v)} type="button"
                onClick={() => patch('submittedOnBehalf', o.v)}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-medium"
                style={{
                  background: f.submittedOnBehalf === o.v
                    ? 'rgb(var(--accent))' : 'rgb(var(--surface-elevated))',
                  color: f.submittedOnBehalf === o.v
                    ? '#fff' : 'rgb(var(--content-secondary))',
                }}>
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Urgency"
            hint={earliestTravelDate
              ? 'Auto-computed from your earliest travel date.'
              : 'Add at least one travel segment date below to compute urgency.'}>
            <UrgencyBadge urgency={f.urgency} hasDeparture={Boolean(earliestTravelDate)} />
          </Field>

          <Field label="Reason of Travel">
            <div className="relative" data-reason-dropdown>
              <button type="button" onClick={() => setReasonOpen((o) => !o)}
                className={`${inputCx} text-left flex items-center justify-between`}>
                <span className={f.reasonOfTravel ? '' : 'opacity-50'}>
                  {f.reasonOfTravel || 'Select a reason'}
                </span>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
              {reasonOpen && (
                <div
                  className="absolute z-[100] mt-1 w-full rounded-xl max-h-72 overflow-y-auto"
                  style={{
                    background: 'rgb(var(--surface-secondary))',
                    border: '1px solid rgb(var(--field-border))',
                    boxShadow: '0 12px 40px rgb(var(--shadow-color) / 0.2)',
                  }}
                >
                  <div className="sticky top-0 p-2 z-10"
                    style={{ background: 'rgb(var(--surface-secondary))' }}>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                        style={{ color: 'rgb(var(--content-muted))' }} />
                      <input value={reasonFilter}
                        onChange={(e) => setReasonFilter(e.target.value)}
                        placeholder="Search…"
                        className="form-input w-full pl-7 pr-2 py-1.5 rounded-lg text-xs outline-none"
                      />
                    </div>
                  </div>
                  {filteredReasons.map((opt) => (
                    <button key={opt} type="button"
                      onClick={() => { patch('reasonOfTravel', opt); setReasonOpen(false); setReasonFilter(''); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[rgb(var(--surface-elevated))]"
                      style={{ color: 'rgb(var(--content-primary))' }}>
                      {opt}
                    </button>
                  ))}
                  {filteredReasons.length === 0 && (
                    <p className="text-xs px-3 py-2" style={{ color: 'rgb(var(--content-muted))' }}>
                      No match.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Field>
        </div>

        {f.reasonOfTravel === 'Others' && (
          <Field label="Specify (free text)">
            <input value={f.reasonOfTravelOther}
              onChange={(e) => patch('reasonOfTravelOther', e.target.value)}
              className={inputCx}
              placeholder="Describe the reason" />
          </Field>
        )}
      </Section>

      {/* ── 2. Member identification + autofill ───────────────── */}
      <Section title="Member Identification" icon={User}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Employee ID" error={lookupErr ?? undefined}>
            <input value={f.employeeCode}
              onChange={(e) => patch('employeeCode', e.target.value.toUpperCase())}
              placeholder="e.g. PW0086"
              className={`${inputCx} font-mono`} />
          </Field>
          {f.submittedOnBehalf && (
            <Field label="Member PWID using this service" hint="Auto-filled from Employee ID">
              <input value={f.employeeCode} readOnly
                className={`${inputCx} font-mono opacity-80`} />
            </Field>
          )}
        </div>

        {f.fullName && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 gap-2 p-3 rounded-xl"
            style={{ background: 'rgb(var(--surface-elevated))' }}>
            {([
              ['Full Name', f.fullName],
              ['Email', f.email],
              // Designation is confidential — only Owner/Admin/Travel Team see it
              ...(canSeeDesignation ? [['Designation', f.designation]] : []),
              ['Department', f.departmentName],
            ] as Array<[string, string]>).map(([label, val]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide"
                  style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
                <p className="text-xs font-medium truncate"
                  style={{ color: 'rgb(var(--content-primary))' }}>{val || '—'}</p>
              </div>
            ))}
          </motion.div>
        )}

        {f.noOfApprovers > 0 && (() => {
          // Mirror the backend chain builder — middle slot depends on urgency,
          // blanks and submitter's own email get dropped.
          const middleEmail =
            f.urgency === UrgencyLevel.URGENT    ? f.hodEmail :
            f.urgency === UrgencyLevel.EMERGENCY ? f.cxoEmail :
                                                   f.l2Email;
          const middleLabel =
            f.urgency === UrgencyLevel.URGENT    ? 'HOD' :
            f.urgency === UrgencyLevel.EMERGENCY ? 'CXO' :
                                                   'L2';
          const me = (user?.email ?? '').toLowerCase();
          const chain: Array<{ label: string; email: string }> = [
            { label: 'L1',          email: f.l1Email },
            { label: middleLabel,   email: middleEmail },
            { label: 'L3',          email: f.l3Email },
          ].map(c => ({ ...c, email: (c.email ?? '').toLowerCase() }))
           .filter(c => c.email.length > 0 && c.email !== me);

          if (chain.length === 0) return null;
          return (
            <div className="p-3 rounded-xl"
              style={{ background: 'rgb(var(--accent-subtle))' }}>
              <p className="text-[10px] uppercase tracking-wide mb-1"
                style={{ color: 'rgb(var(--accent-text))' }}>
                Approval Chain ({chain.length} step{chain.length > 1 ? 's' : ''})
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {chain.map((c, i) => (
                  <span key={i} className="text-[11px] font-mono px-2 py-0.5 rounded"
                    style={{
                      background: 'rgb(var(--surface-base))',
                      color: 'rgb(var(--content-primary))',
                    }}>
                    {i + 1}. {c.label}: {c.email}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
        {f.noOfApprovers === 0 && f.fullName && (
          <div className="p-3 rounded-xl flex items-center gap-2"
            style={{ background: 'rgb(var(--status-success)/0.12)' }}>
            <CheckCircle2 className="w-4 h-4" style={{ color: 'rgb(var(--status-success))' }} />
            <p className="text-xs" style={{ color: 'rgb(var(--status-success))' }}>
              This member has 0 approval levels — request will be <strong>auto-approved</strong> on submit.
            </p>
          </div>
        )}

        {f.submittedOnBehalf && (
          <Field label="Cost Centre (acting on behalf)">
            <input value={f.onBehalfCostCentre}
              onChange={(e) => patch('onBehalfCostCentre', e.target.value)}
              className={inputCx} placeholder="Cost centre code" />
          </Field>
        )}

        {/* Expansion department → mandatory Center ID */}
        {f.departmentName === 'Expansion' && (
          <Field label="Center ID *"
            hint="Required for Expansion department — identifies the centre being visited.">
            <input value={f.expansionCenterId}
              onChange={(e) => patch('expansionCenterId', e.target.value)}
              className={inputCx}
              placeholder="e.g. PW-DEL-042" />
          </Field>
        )}
      </Section>

      {/* ── 3. Request For ────────────────────────────────────── */}
      <Section title="Request For" icon={Building2}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {REQUEST_FOR_CARDS.map(({ value, label, icon: Icon, sub }) => (
            <button key={value} type="button" onClick={() => patch('requestFor', value)}
              className="p-3 rounded-xl text-left transition-all"
              style={{
                background: f.requestFor === value
                  ? 'rgb(var(--accent-subtle))'
                  : 'rgb(var(--surface-elevated))',
                border: '1px solid ' + (f.requestFor === value
                  ? 'rgb(var(--accent))' : 'rgb(var(--border-subtle))'),
              }}>
              <Icon className="w-4 h-4 mb-2"
                style={{ color: f.requestFor === value ? 'rgb(var(--accent))' : 'rgb(var(--content-muted))' }} />
              <p className="text-xs font-semibold"
                style={{ color: 'rgb(var(--content-primary))' }}>{label}</p>
              <p className="text-[10px] mt-0.5"
                style={{ color: 'rgb(var(--content-muted))' }}>{sub}</p>
            </button>
          ))}
        </div>

        {showTypeOfRequest && (
          <Field label="Type of Request">
            <div className="flex gap-2">
              {[
                { v: RequestKind.NEW_REQUEST, label: 'New Request' },
                { v: RequestKind.EXTENSION,   label: 'Extension of Service' },
              ].map((o) => (
                <button key={o.v} type="button" onClick={() => patch('requestKind', o.v)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-medium"
                  style={{
                    background: f.requestKind === o.v ? 'rgb(var(--accent))' : 'rgb(var(--surface-elevated))',
                    color: f.requestKind === o.v ? '#fff' : 'rgb(var(--content-secondary))',
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {isExtension && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Extension Start Date">
              <input type="date" value={f.extensionStartDate}
                onChange={(e) => patch('extensionStartDate', e.target.value)}
                className={inputCx} />
            </Field>
            <Field label="Initial Request ID (UUID)">
              <input value={f.initialRequestId}
                onChange={(e) => patch('initialRequestId', e.target.value)}
                placeholder="Paste linked request UUID"
                className={`${inputCx} font-mono`} />
            </Field>
          </div>
        )}

        {f.requestFor && (
          <Field label="Reservation Type"
            hint="Determines what segments you'll need to add below.">
            <select value={f.reservationType}
              onChange={(e) => patch('reservationType', e.target.value as FormState['reservationType'])}
              className={inputCx}>
              <option value="TRAVEL">Travel only</option>
              <option value="STAY">Stay only</option>
              <option value="TRAVEL_AND_STAY">Travel & Stay</option>
            </select>
          </Field>
        )}
      </Section>

      {/* ── 4. Type-specific detail panels ────────────────────── */}
      {f.requestFor === RequestFor.STUDENT && (
        <Section title="Student Details" icon={GraduationCap}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Number of Students">
              <input type="number" value={f.studentDetails.noOfStudents}
                onChange={(e) => patch('studentDetails', { ...f.studentDetails, noOfStudents: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Student Sheet Link">
              <input value={f.studentDetails.sheetLink}
                onChange={(e) => patch('studentDetails', { ...f.studentDetails, sheetLink: e.target.value })}
                placeholder="https://..." className={inputCx} />
            </Field>
          </div>
          <Field label="Reason">
            <textarea rows={2} value={f.studentDetails.reason}
              onChange={(e) => patch('studentDetails', { ...f.studentDetails, reason: e.target.value })}
              className={inputCx} />
          </Field>
          <Field label="Remarks">
            <textarea rows={2} value={f.studentDetails.remarks}
              onChange={(e) => patch('studentDetails', { ...f.studentDetails, remarks: e.target.value })}
              className={inputCx} />
          </Field>
        </Section>
      )}

      {f.requestFor === RequestFor.GUEST && (
        <Section title="Guest Details" icon={UserPlus}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name of Guest">
              <input value={f.guestDetails.name}
                onChange={(e) => patch('guestDetails', { ...f.guestDetails, name: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Hosting Department">
              <input value={f.guestDetails.hostingDepartment}
                onChange={(e) => patch('guestDetails', { ...f.guestDetails, hostingDepartment: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Email">
              <input type="email" value={f.guestDetails.emailId}
                onChange={(e) => patch('guestDetails', { ...f.guestDetails, emailId: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Purpose">
              <input value={f.guestDetails.purpose}
                onChange={(e) => patch('guestDetails', { ...f.guestDetails, purpose: e.target.value })}
                className={inputCx} />
            </Field>
          </div>
          <Field label="Remarks">
            <textarea rows={2} value={f.guestDetails.remarks}
              onChange={(e) => patch('guestDetails', { ...f.guestDetails, remarks: e.target.value })}
              className={inputCx} />
          </Field>
        </Section>
      )}

      {f.requestFor === RequestFor.NEW_MEMBER && (
        <Section title="New Employee Details" icon={Users}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Employee Name">
              <input value={f.newMemberDetails.employeeName}
                onChange={(e) => patch('newMemberDetails', { ...f.newMemberDetails, employeeName: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Candidate ID">
              <input value={f.newMemberDetails.candidateId}
                onChange={(e) => patch('newMemberDetails', { ...f.newMemberDetails, candidateId: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Email">
              <input type="email" value={f.newMemberDetails.emailId}
                onChange={(e) => patch('newMemberDetails', { ...f.newMemberDetails, emailId: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Joining Department">
              <input value={f.newMemberDetails.joiningDepartment}
                onChange={(e) => patch('newMemberDetails', { ...f.newMemberDetails, joiningDepartment: e.target.value })}
                className={inputCx} />
            </Field>
          </div>
          <Field label="Remarks">
            <textarea rows={2} value={f.newMemberDetails.remarks}
              onChange={(e) => patch('newMemberDetails', { ...f.newMemberDetails, remarks: e.target.value })}
              className={inputCx} />
          </Field>
        </Section>
      )}

      {f.requestFor === RequestFor.EVENT && (
        <Section title="Event Details" icon={Calendar}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Event Name">
              <input value={f.eventDetails.eventName}
                onChange={(e) => patch('eventDetails', { ...f.eventDetails, eventName: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Number of Members">
              <input type="number" value={f.eventDetails.noOfMembers}
                onChange={(e) => patch('eventDetails', { ...f.eventDetails, noOfMembers: e.target.value })}
                className={inputCx} />
            </Field>
          </div>
          <Field label="Sheet Link">
            <input value={f.eventDetails.sheetLink}
              onChange={(e) => patch('eventDetails', { ...f.eventDetails, sheetLink: e.target.value })}
              placeholder="https://..." className={inputCx} />
          </Field>
          <Field label="Reason">
            <textarea rows={2} value={f.eventDetails.reason}
              onChange={(e) => patch('eventDetails', { ...f.eventDetails, reason: e.target.value })}
              className={inputCx} />
          </Field>
          <Field label="Remarks">
            <textarea rows={2} value={f.eventDetails.remarks}
              onChange={(e) => patch('eventDetails', { ...f.eventDetails, remarks: e.target.value })}
              className={inputCx} />
          </Field>
        </Section>
      )}

      {/* ── 5. Traveler's Details (for non-PW Member only) ────── */}
      {f.requestFor && f.requestFor !== RequestFor.PW_MEMBER && (
        <Section title="Traveler's Details" icon={User}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input value={f.travelerDetails.name}
                onChange={(e) => patch('travelerDetails', { ...f.travelerDetails, name: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Employee/ID Reference">
              <input value={f.travelerDetails.employeeId}
                onChange={(e) => patch('travelerDetails', { ...f.travelerDetails, employeeId: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Contact No.">
              <input value={f.travelerDetails.contactNo}
                onChange={(e) => patch('travelerDetails', { ...f.travelerDetails, contactNo: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Email">
              <input type="email" value={f.travelerDetails.emailId}
                onChange={(e) => patch('travelerDetails', { ...f.travelerDetails, emailId: e.target.value })}
                className={inputCx} />
            </Field>
            <Field label="Gender">
              <select value={f.travelerDetails.gender}
                onChange={(e) => patch('travelerDetails', { ...f.travelerDetails, gender: e.target.value })}
                className={inputCx}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Date of Birth">
              <input type="date" value={f.travelerDetails.dob}
                onChange={(e) => patch('travelerDetails', { ...f.travelerDetails, dob: e.target.value })}
                className={inputCx} />
            </Field>
          </div>
        </Section>
      )}

      {/* ── 6. Travel Segments (dynamic rows) ──────────────────── */}
      {f.requestFor && (
        <Section title="Travel Segments" icon={Plane}>
          <p className="text-[11px]" style={{ color: 'rgb(var(--content-muted))' }}>
            Add a row for every leg of the journey. For a round trip, add two
            segments (Delhi → Mumbai, then Mumbai → Delhi).
          </p>
          {f.travelSegments.map((s, idx) => (
            <div key={idx} className="rounded-xl p-3 space-y-3"
              style={{
                background: 'rgb(var(--surface-elevated))',
                border: '1px solid rgb(var(--border-subtle))',
              }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: 'rgb(var(--content-muted))' }}>
                  Segment {idx + 1}
                </span>
                {f.travelSegments.length > 1 && (
                  <button type="button"
                    onClick={() => setF((p) => ({
                      ...p,
                      travelSegments: p.travelSegments.filter((_, i) => i !== idx),
                    }))}
                    className="text-[11px] px-2 py-0.5 rounded"
                    style={{
                      background: 'rgb(var(--status-danger)/0.12)',
                      color: 'rgb(var(--status-danger))',
                    }}>
                    × Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From">
                  <input value={s.fromLocation}
                    onChange={(e) => setF((p) => ({
                      ...p,
                      travelSegments: p.travelSegments.map((row, i) =>
                        i === idx ? { ...row, fromLocation: e.target.value } : row),
                    }))}
                    placeholder="e.g. Delhi" className={inputCx} />
                </Field>
                <Field label="To">
                  <input value={s.toLocation}
                    onChange={(e) => setF((p) => ({
                      ...p,
                      travelSegments: p.travelSegments.map((row, i) =>
                        i === idx ? { ...row, toLocation: e.target.value } : row),
                    }))}
                    placeholder="e.g. Mumbai" className={inputCx} />
                </Field>
                <Field label="Travel Date">
                  <input type="date" value={s.travelDate}
                    onChange={(e) => setF((p) => ({
                      ...p,
                      travelSegments: p.travelSegments.map((row, i) =>
                        i === idx ? { ...row, travelDate: e.target.value } : row),
                    }))}
                    className={inputCx} />
                </Field>
                <Field label="Travel Mode">
                  <select value={s.travelMode}
                    onChange={(e) => setF((p) => ({
                      ...p,
                      travelSegments: p.travelSegments.map((row, i) =>
                        i === idx ? { ...row, travelMode: e.target.value as SegmentTravelMode } : row),
                    }))}
                    className={inputCx}>
                    {Object.values(SegmentTravelMode).map((m) => (
                      <option key={m} value={m}>{TRAVEL_MODE_LABEL[m]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Preferred Time (optional)">
                  <input value={s.preferredTime}
                    onChange={(e) => setF((p) => ({
                      ...p,
                      travelSegments: p.travelSegments.map((row, i) =>
                        i === idx ? { ...row, preferredTime: e.target.value } : row),
                    }))}
                    placeholder="e.g. After 7 PM" className={inputCx} />
                </Field>
                <Field label="Notes (optional)">
                  <input value={s.notes}
                    onChange={(e) => setF((p) => ({
                      ...p,
                      travelSegments: p.travelSegments.map((row, i) =>
                        i === idx ? { ...row, notes: e.target.value } : row),
                    }))}
                    className={inputCx} />
                </Field>
              </div>
            </div>
          ))}
          <button type="button"
            onClick={() => setF((p) => ({
              ...p,
              travelSegments: [
                ...p.travelSegments,
                { fromLocation: '', toLocation: '', travelDate: '', preferredTime: '',
                  travelMode: SegmentTravelMode.FLIGHT, notes: '' },
              ],
            }))}
            className="w-full px-3 py-2 rounded-xl text-xs font-semibold"
            style={{
              background: 'rgb(var(--accent-subtle))',
              color:      'rgb(var(--accent-text))',
              border:     '1px dashed rgb(var(--accent))',
            }}>
            + Add Travel Segment
          </button>
        </Section>
      )}

      {/* ── 7. Accommodation Segments (optional, dynamic rows) ── */}
      {f.requestFor && (
        <Section title="Accommodation Segments" icon={Hotel}>
          {f.accommodationSegments.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'rgb(var(--content-muted))' }}>
              No stays added. Click below to add a hotel / service apartment requirement.
            </p>
          ) : (
            f.accommodationSegments.map((a, idx) => (
              <div key={idx} className="rounded-xl p-3 space-y-3"
                style={{
                  background: 'rgb(var(--surface-elevated))',
                  border: '1px solid rgb(var(--border-subtle))',
                }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: 'rgb(var(--content-muted))' }}>
                    Stay {idx + 1}
                  </span>
                  <button type="button"
                    onClick={() => setF((p) => ({
                      ...p,
                      accommodationSegments: p.accommodationSegments.filter((_, i) => i !== idx),
                    }))}
                    className="text-[11px] px-2 py-0.5 rounded"
                    style={{
                      background: 'rgb(var(--status-danger)/0.12)',
                      color: 'rgb(var(--status-danger))',
                    }}>
                    × Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City">
                    <input value={a.city}
                      onChange={(e) => setF((p) => ({
                        ...p,
                        accommodationSegments: p.accommodationSegments.map((row, i) =>
                          i === idx ? { ...row, city: e.target.value } : row),
                      }))}
                      placeholder="e.g. Mumbai" className={inputCx} />
                  </Field>
                  <Field label="Center (optional)">
                    <input value={a.center}
                      onChange={(e) => setF((p) => ({
                        ...p,
                        accommodationSegments: p.accommodationSegments.map((row, i) =>
                          i === idx ? { ...row, center: e.target.value } : row),
                      }))}
                      placeholder="Visiting centre / branch" className={inputCx} />
                  </Field>
                  <Field label="Check-In Date">
                    <input type="date" value={a.checkInDate}
                      onChange={(e) => setF((p) => ({
                        ...p,
                        accommodationSegments: p.accommodationSegments.map((row, i) =>
                          i === idx ? { ...row, checkInDate: e.target.value } : row),
                      }))}
                      className={inputCx} />
                  </Field>
                  <Field label="Check-Out Date">
                    <input type="date" value={a.checkOutDate}
                      onChange={(e) => setF((p) => ({
                        ...p,
                        accommodationSegments: p.accommodationSegments.map((row, i) =>
                          i === idx ? { ...row, checkOutDate: e.target.value } : row),
                      }))}
                      className={inputCx} />
                  </Field>
                  <Field label="Hotel Requirement">
                    <select value={a.hotelRequirement}
                      onChange={(e) => setF((p) => ({
                        ...p,
                        accommodationSegments: p.accommodationSegments.map((row, i) =>
                          i === idx ? { ...row, hotelRequirement: e.target.value as HotelRequirement } : row),
                      }))}
                      className={inputCx}>
                      {Object.values(HotelRequirement).map((h) => (
                        <option key={h} value={h}>{HOTEL_REQ_LABEL[h]}</option>
                      ))}
                    </select>
                  </Field>
                  {a.hotelRequirement === HotelRequirement.OTHER && (
                    <Field label="Specify Requirement">
                      <input value={a.hotelRequirementOther}
                        onChange={(e) => setF((p) => ({
                          ...p,
                          accommodationSegments: p.accommodationSegments.map((row, i) =>
                            i === idx ? { ...row, hotelRequirementOther: e.target.value } : row),
                        }))}
                        className={inputCx} />
                    </Field>
                  )}
                </div>
                <Field label="Notes (optional)">
                  <input value={a.notes}
                    onChange={(e) => setF((p) => ({
                      ...p,
                      accommodationSegments: p.accommodationSegments.map((row, i) =>
                        i === idx ? { ...row, notes: e.target.value } : row),
                    }))}
                    className={inputCx} />
                </Field>
              </div>
            ))
          )}
          <button type="button"
            onClick={() => setF((p) => ({
              ...p,
              accommodationSegments: [
                ...p.accommodationSegments,
                { city: '', center: '', checkInDate: '', checkOutDate: '',
                  hotelRequirement: HotelRequirement.NON_SHARING,
                  hotelRequirementOther: '', notes: '' },
              ],
            }))}
            className="w-full px-3 py-2 rounded-xl text-xs font-semibold"
            style={{
              background: 'rgb(var(--accent-subtle))',
              color:      'rgb(var(--accent-text))',
              border:     '1px dashed rgb(var(--accent))',
            }}>
            + Add Accommodation
          </button>
        </Section>
      )}

      {/* ── 8. Purpose & Remarks (request-level) ──────────────── */}
      {f.requestFor && (
        <Section title="Purpose & Remarks" icon={Building2}>
          <Field label="Purpose of trip">
            <textarea rows={2} value={f.purpose}
              onChange={(e) => patch('purpose', e.target.value)}
              placeholder="Why is this trip needed?"
              className={inputCx} />
          </Field>
          <Field label="Remarks (optional)">
            <textarea rows={2} value={f.remarks}
              onChange={(e) => patch('remarks', e.target.value)}
              className={inputCx} />
          </Field>
        </Section>
      )}

      {/* ── Submit ────────────────────────────────────────────── */}
      <div className="sticky bottom-4 z-10">
        <motion.div className="glass p-4 flex items-center justify-between gap-3"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex-1 min-w-0">
            {submitError && (
              <div className="flex items-center gap-2 text-xs"
                style={{ color: 'rgb(var(--status-danger))' }}>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{submitError}</span>
              </div>
            )}
            {!submitError && f.noOfApprovers === 0 && f.fullName && (
              <p className="text-xs" style={{ color: 'rgb(var(--status-success))' }}>
                Will be auto-approved on submit.
              </p>
            )}
            {!submitError && f.noOfApprovers > 0 && (
              <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
                Will route to {f.noOfApprovers} approver(s) in sequence.
              </p>
            )}
          </div>
          <button type="button" disabled={submitting} onClick={submit}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'rgb(var(--accent))' }}>
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
