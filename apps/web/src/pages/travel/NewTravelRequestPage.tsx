import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Plane, User, Users, GraduationCap, UserPlus, Calendar, Building2,
  AlertTriangle, CheckCircle2, ChevronDown, Search, Hotel, Clock,
} from 'lucide-react';
import {
  REASON_OF_TRAVEL_OPTIONS, RequestFor, RequestKind, UrgencyLevel, UserRole,
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
  noOfApprovers: number;

  // Type
  requestFor: RequestFor | '';
  requestKind: RequestKind;
  reservationType: 'TRAVEL' | 'STAY' | 'TRAVEL_AND_STAY';
  needsStay: boolean;
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

  // Booking
  bookingBoarding: string;
  bookingVisitingReason: string;
  bookingDestination: string;
  bookingDepartureDate: string;
  bookingPreferredTime: string;
  bookingPurpose: string;
  bookingRemarks: string;

  // Stay
  stayVisitingCenter: string;
  stayLocation: string;
  stayCheckIn: string;
  stayCheckOut: string;
  stayRemarks: string;
}

const initial: FormState = {
  submittedOnBehalf: false,
  urgency: UrgencyLevel.NORMAL,
  reasonOfTravel: '',
  reasonOfTravelOther: '',
  employeeCode: '',
  onBehalfCostCentre: '',
  fullName: '', email: '', designation: '', departmentName: '',
  l1Email: '', l2Email: '', l3Email: '', noOfApprovers: 0,
  requestFor: '', requestKind: RequestKind.NEW_REQUEST,
  reservationType: 'TRAVEL', needsStay: false,
  extensionStartDate: '', initialRequestId: '',
  studentDetails:   { noOfStudents: '', sheetLink: '', reason: '', remarks: '' },
  guestDetails:     { name: '', hostingDepartment: '', emailId: '', purpose: '', remarks: '' },
  newMemberDetails: { employeeName: '', candidateId: '', emailId: '', joiningDepartment: '', remarks: '' },
  eventDetails:     { eventName: '', noOfMembers: '', sheetLink: '', reason: '', remarks: '' },
  travelerDetails:  { name: '', employeeId: '', contactNo: '', emailId: '', gender: '', dob: '' },
  bookingBoarding: '', bookingVisitingReason: '', bookingDestination: '',
  bookingDepartureDate: '', bookingPreferredTime: '', bookingPurpose: '', bookingRemarks: '',
  stayVisitingCenter: '', stayLocation: '', stayCheckIn: '', stayCheckOut: '', stayRemarks: '',
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
      patch('l3Email', ''); patch('noOfApprovers', 0);
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
          noOfApprovers: Number(d.no_of_approvers ?? 0),
        }));
        setLookupErr(null);
      } catch (err: unknown) {
        const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
        setLookupErr(apiErr.response?.data?.error?.message ?? 'Could not find that Employee ID.');
        setF((p) => ({ ...p, fullName: '', email: '', designation: '',
          departmentName: '', l1Email: '', l2Email: '', l3Email: '', noOfApprovers: 0 }));
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

  const showStayBlock = (f.requestFor && f.reservationType === 'TRAVEL' && f.needsStay) ||
                        f.reservationType === 'STAY' || f.reservationType === 'TRAVEL_AND_STAY';

  const showTypeOfRequest =
    f.requestFor === RequestFor.PW_MEMBER ||
    f.requestFor === RequestFor.GUEST ||
    f.requestFor === RequestFor.NEW_MEMBER;

  const isExtension = showTypeOfRequest && f.requestKind === RequestKind.EXTENSION;

  // ── Final validate ──
  function valid(): string | null {
    if (!f.reasonOfTravel) return 'Reason of travel is required.';
    if (f.reasonOfTravel === 'Others' && f.reasonOfTravelOther.trim().length < 3)
      return 'Specify the reason in the text box.';
    if (!f.employeeCode || !f.fullName) return 'Enter a valid Employee ID.';
    if (!f.requestFor) return 'Pick a Request For category.';
    if (isExtension && (!f.initialRequestId || !f.extensionStartDate))
      return 'Extension requires Initial Request ID and start date.';
    if (!f.bookingDestination || !f.bookingDepartureDate)
      return 'Booking destination & departure date are required.';
    if (showStayBlock && (!f.stayCheckIn || !f.stayCheckOut))
      return 'Stay check-in and check-out are required when a stay is needed.';
    if (f.submittedOnBehalf && !f.onBehalfCostCentre.trim())
      return 'On-behalf cost centre is required.';
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
        needsStay: f.needsStay,
        extensionStartDate: isExtension ? f.extensionStartDate : null,
        initialRequestId: isExtension ? f.initialRequestId : null,
        studentDetails:    f.requestFor === RequestFor.STUDENT    ? f.studentDetails    : null,
        guestDetails:      f.requestFor === RequestFor.GUEST      ? f.guestDetails      : null,
        newMemberDetails:  f.requestFor === RequestFor.NEW_MEMBER ? f.newMemberDetails  : null,
        eventDetails:      f.requestFor === RequestFor.EVENT      ? f.eventDetails      : null,
        travelerDetails:   f.requestFor !== RequestFor.PW_MEMBER  ? f.travelerDetails   : null,
        bookingBoarding:       f.bookingBoarding,
        bookingVisitingReason: f.bookingVisitingReason,
        bookingDestination:    f.bookingDestination,
        bookingDepartureDate:  f.bookingDepartureDate,
        bookingPreferredTime:  f.bookingPreferredTime,
        bookingPurpose:        f.bookingPurpose,
        bookingRemarks:        f.bookingRemarks,
        stayVisitingCenter: showStayBlock ? f.stayVisitingCenter : null,
        stayLocation:       showStayBlock ? f.stayLocation       : null,
        stayCheckIn:        showStayBlock ? f.stayCheckIn        : null,
        stayCheckOut:       showStayBlock ? f.stayCheckOut       : null,
        stayRemarks:        showStayBlock ? f.stayRemarks        : null,
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
          <Field label="Urgency">
            <div className="flex gap-2">
              {[
                { v: UrgencyLevel.NORMAL, label: 'Normal · 3+ days' },
                { v: UrgencyLevel.URGENT, label: 'Urgent · ≤ 3 days' },
              ].map((o) => (
                <button key={o.v} type="button" onClick={() => patch('urgency', o.v)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-medium"
                  style={{
                    background: f.urgency === o.v ? 'rgb(var(--accent))' : 'rgb(var(--surface-elevated))',
                    color: f.urgency === o.v ? '#fff' : 'rgb(var(--content-secondary))',
                  }}>
                  {o.label}
                </button>
              ))}
            </div>
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
            {[
              ['Full Name', f.fullName],
              ['Email', f.email],
              ['Designation', f.designation],
              ['Department', f.departmentName],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-[10px] uppercase tracking-wide"
                  style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
                <p className="text-xs font-medium truncate"
                  style={{ color: 'rgb(var(--content-primary))' }}>{val || '—'}</p>
              </div>
            ))}
          </motion.div>
        )}

        {f.noOfApprovers > 0 && (
          <div className="p-3 rounded-xl"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <p className="text-[10px] uppercase tracking-wide mb-1"
              style={{ color: 'rgb(var(--accent-text))' }}>Approval Chain ({f.noOfApprovers} level{f.noOfApprovers > 1 ? 's' : ''})</p>
            <div className="flex items-center gap-2 flex-wrap">
              {[f.l1Email, f.l2Email, f.l3Email].slice(0, f.noOfApprovers).map((e, i) => (
                <span key={i} className="text-[11px] font-mono px-2 py-0.5 rounded"
                  style={{
                    background: 'rgb(var(--surface-base))',
                    color: 'rgb(var(--content-primary))',
                  }}>
                  L{i + 1}: {e || '—'}
                </span>
              ))}
            </div>
          </div>
        )}
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
              className={inputCx}              placeholder="Cost centre code" />
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
          <div className="grid grid-cols-2 gap-3 mt-1">
            <Field label="Reservation">
              <select value={f.reservationType}
                onChange={(e) => patch('reservationType', e.target.value as FormState['reservationType'])}
                className={inputCx}>
                <option value="TRAVEL">Travel</option>
                <option value="STAY">Stay</option>
                <option value="TRAVEL_AND_STAY">Travel & Stay</option>
              </select>
            </Field>
            {f.reservationType !== 'STAY' && (
              <Field label="Need of Stay">
                <div className="flex gap-2">
                  {[true, false].map((b) => (
                    <button key={String(b)} type="button" onClick={() => patch('needsStay', b)}
                      className="flex-1 px-3 py-2 rounded-xl text-xs font-medium"
                      style={{
                        background: f.needsStay === b ? 'rgb(var(--accent))' : 'rgb(var(--surface-elevated))',
                        color: f.needsStay === b ? '#fff' : 'rgb(var(--content-secondary))',
                      }}>
                      {b ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </Field>
            )}
          </div>
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

      {/* ── 6. Booking Details ─────────────────────────────────── */}
      {f.requestFor && f.reservationType !== 'STAY' && (
        <Section title="Booking Details" icon={Plane}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Boarding (origin)">
              <input value={f.bookingBoarding}
                onChange={(e) => patch('bookingBoarding', e.target.value)}
                placeholder="e.g. Delhi"
                className={inputCx} />
            </Field>
            <Field label="Destination">
              <input value={f.bookingDestination}
                onChange={(e) => patch('bookingDestination', e.target.value)}
                placeholder="e.g. Mumbai"
                className={inputCx} />
            </Field>
            <Field label="Departure Date">
              <input type="date" value={f.bookingDepartureDate}
                onChange={(e) => patch('bookingDepartureDate', e.target.value)}
                className={inputCx} />
            </Field>
            <Field label="Preferred Time">
              <input value={f.bookingPreferredTime}
                onChange={(e) => patch('bookingPreferredTime', e.target.value)}
                placeholder="e.g. After 7 PM"
                className={inputCx} />
            </Field>
          </div>
          <Field label="Visiting Reason">
            <input value={f.bookingVisitingReason}
              onChange={(e) => patch('bookingVisitingReason', e.target.value)}
              className={inputCx} />
          </Field>
          <Field label="Purpose">
            <textarea rows={2} value={f.bookingPurpose}
              onChange={(e) => patch('bookingPurpose', e.target.value)}
              className={inputCx} />
          </Field>
          <Field label="Remarks">
            <textarea rows={2} value={f.bookingRemarks}
              onChange={(e) => patch('bookingRemarks', e.target.value)}
              className={inputCx} />
          </Field>
        </Section>
      )}

      {/* ── 7. Stay Booking Details ─────────────────────────────── */}
      {showStayBlock && (
        <Section title="Stay Booking Details" icon={Hotel}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Visiting Center">
              <input value={f.stayVisitingCenter}
                onChange={(e) => patch('stayVisitingCenter', e.target.value)}
                className={inputCx} />
            </Field>
            <Field label="Location">
              <input value={f.stayLocation}
                onChange={(e) => patch('stayLocation', e.target.value)}
                className={inputCx} />
            </Field>
            <Field label="Check-In Date">
              <input type="date" value={f.stayCheckIn}
                onChange={(e) => patch('stayCheckIn', e.target.value)}
                className={inputCx} />
            </Field>
            <Field label="Check-Out Date">
              <input type="date" value={f.stayCheckOut}
                onChange={(e) => patch('stayCheckOut', e.target.value)}
                className={inputCx} />
            </Field>
          </div>
          <Field label="Remarks">
            <textarea rows={2} value={f.stayRemarks}
              onChange={(e) => patch('stayRemarks', e.target.value)}
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
