import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, Phone, Plane } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../lib/api';
import { AxiosError } from 'axios';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { employee, markOnboardingComplete } = useAuthStore();

  const [phone, setPhone]         = useState(employee?.designation ? '' : '');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [submitted, setSubmitted] = useState(false);

  const phoneValid = /^[6-9]\d{9}$/.test(phone);

  async function handleSubmit() {
    if (!phoneValid) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await authApi.completeOnboarding({ phone });
      markOnboardingComplete();
      setSubmitted(true);
      setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
    } catch (err: unknown) {
      const e = err as AxiosError<{ error: { message: string } }>;
      setError(e.response?.data?.error?.message ?? 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'rgb(var(--surface-base))' }}>
        <motion.div className="glass p-10 text-center max-w-md"
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: 'rgb(var(--status-success))' }} />
          <h1 className="font-display text-2xl font-bold mb-2"
            style={{ color: 'rgb(var(--content-primary))' }}>
            All set, {employee?.name?.split(' ')[0]}!
          </h1>
          <p className="text-sm" style={{ color: 'rgb(var(--content-muted))' }}>
            Taking you to your dashboard…
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'rgb(var(--surface-base))' }}>
      <motion.div className="glass p-8 w-full max-w-md"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent-subtle))' }}>
            <Plane className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold"
              style={{ color: 'rgb(var(--content-primary))' }}>
              Welcome to Travel OS
            </h1>
            <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
              Just one quick step before you start
            </p>
          </div>
        </div>

        {/* Pre-filled summary from Members Master */}
        <div className="space-y-2 mb-6">
          {[
            { label: 'Name',         value: employee?.name },
            { label: 'Employee ID',  value: employee?.employeeCode },
            { label: 'Designation',  value: employee?.designation },
            { label: 'Department',   value: employee?.departmentName },
            { label: 'Approval Levels', value: employee?.noOfApprovers === 0 ? 'Auto-approved' : `${employee?.noOfApprovers} level(s)` },
          ].map(({ label, value }) => value && (
            <div key={label} className="flex items-center justify-between p-2.5 rounded-xl"
              style={{ background: 'rgb(var(--surface-elevated))' }}>
              <span className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>{label}</span>
              <span className="text-xs font-medium" style={{ color: 'rgb(var(--content-primary))' }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <label className="text-xs font-medium block mb-1.5"
          style={{ color: 'rgb(var(--content-secondary))' }}>
          Confirm Your Mobile Number
        </label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'rgb(var(--content-muted))' }} />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
            placeholder="10-digit mobile"
            className="w-full pl-10 pr-3 py-2.5 rounded-xl text-sm font-mono outline-none"
            style={{
              background: 'rgb(var(--surface-elevated))',
              border:     '1px solid rgb(var(--border-subtle))',
              color:      'rgb(var(--content-primary))',
            }}
          />
        </div>

        {error && (
          <p className="text-xs mt-2" style={{ color: 'rgb(var(--status-danger))' }}>{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!phoneValid || loading}
          className="w-full mt-5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'rgb(var(--accent))' }}
        >
          {loading ? 'Saving…' : 'Continue to Dashboard'}
        </button>
      </motion.div>
    </div>
  );
}
