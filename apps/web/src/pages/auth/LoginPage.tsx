import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Plane, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../lib/api';
import { AxiosError } from 'axios';

// ─── Floating particle component ─────────────────────────────
function Particle({ delay, x, size }: { delay: number; x: number; size: number }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: `${x}%`,
        bottom: '-20px',
        width: size,
        height: size,
        background: `radial-gradient(circle, rgb(var(--accent) / 0.6), transparent)`,
      }}
      animate={{
        y: [0, -window.innerHeight - 40],
        opacity: [0, 0.8, 0.8, 0],
        scale: [0.5, 1, 0.8, 0.3],
      }}
      transition={{
        duration: 8 + Math.random() * 4,
        delay,
        repeat: Infinity,
        ease: 'easeOut',
      }}
    />
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();

  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [focusedField, setFocused] = useState<'email' | 'password' | null>(null);

  const sessionExpired = searchParams.get('session') === 'expired';
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const particles = Array.from({ length: 18 }, (_, i) => ({
    delay: i * 0.5,
    x: (i / 18) * 100 + Math.random() * 5,
    size: 3 + Math.random() * 6,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      const res = await authApi.login({ email: email.toLowerCase().trim(), password });
      const { accessToken, user, employee, requiresOnboarding } = res.data.data;

      setAuth({ accessToken, user, employee, requiresOnboarding });
      navigate(requiresOnboarding ? '/onboarding' : '/dashboard', { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      setError(
        axiosErr.response?.data?.error?.message ||
        'Unable to sign in. Please check your credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Demo quick-fill
  const fillDemo = (role: string) => {
    const demos: Record<string, { email: string; pass: string }> = {
      admin:   { email: 'superadmin@company.com',  pass: 'Travel@123' },
      desk:    { email: 'travel.desk@company.com', pass: 'Travel@123' },
      finance: { email: 'finance@company.com',     pass: 'Travel@123' },
      manager: { email: 'manager.eng@company.com', pass: 'Travel@123' },
      emp:     { email: 'emp.eng@company.com',     pass: 'Travel@123' },
    };
    setEmail(demos[role].email);
    setPassword(demos[role].pass);
    setError(null);
  };

  return (
    <div
      className="min-h-screen flex relative overflow-hidden"
      style={{ background: 'rgb(var(--surface-primary))' }}
    >
      {/* ── Animated background ──────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Radial glow blobs */}
        <div
          className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-20 blur-[120px]"
          style={{ background: 'rgb(var(--accent))' }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-15 blur-[100px]"
          style={{ background: 'rgb(var(--status-info))' }}
        />
        {/* Floating particles */}
        {particles.map((p, i) => (
          <Particle key={i} {...p} />
        ))}
        {/* Grid lines */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgb(var(--accent)) 1px, transparent 1px),
                              linear-gradient(90deg, rgb(var(--accent)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* ── Left panel: Branding ──────────────────────────────── */}
      <motion.div
        className="hidden lg:flex flex-col justify-between w-1/2 p-16 relative z-10"
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgb(var(--accent))' }}
          >
            <Plane className="w-5 h-5 text-white" fill="currentColor" />
          </div>
          <span className="font-display font-bold text-xl" style={{ color: 'rgb(var(--content-primary))' }}>
            Travel OS
          </span>
        </div>

        {/* Hero text */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
          >
            <p className="text-sm font-medium tracking-widest uppercase mb-4" style={{ color: 'rgb(var(--accent))' }}>
              Enterprise Travel Intelligence
            </p>
            <h1 className="font-display text-5xl font-bold leading-[1.1]" style={{ color: 'rgb(var(--content-primary))' }}>
              Every journey.<br />
              <span className="gradient-text">Governed.</span><br />
              Optimised.
            </h1>
          </motion.div>

          <motion.p
            className="text-lg max-w-md leading-relaxed"
            style={{ color: 'rgb(var(--content-secondary))' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Full-cycle travel lifecycle management — from trip request
            to ERP reconciliation. Built for enterprises that move fast.
          </motion.p>

          {/* Stats */}
          <motion.div
            className="grid grid-cols-3 gap-6 pt-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            {[
              { label: 'Cost Savings', value: '28%' },
              { label: 'Policy Compliance', value: '99.1%' },
              { label: 'Approval SLA', value: '< 4h' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-display text-3xl font-bold" style={{ color: 'rgb(var(--content-primary))' }}>
                  {stat.value}
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgb(var(--content-muted))' }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Footer note */}
        <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
          © 2024 Travel OS · Enterprise Edition · v1.0.0
        </p>
      </motion.div>

      {/* ── Right panel: Login form ───────────────────────────── */}
      <motion.div
        className="flex-1 flex items-center justify-center p-8 relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10 justify-center">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgb(var(--accent))' }}
            >
              <Plane className="w-4 h-4 text-white" fill="currentColor" />
            </div>
            <span className="font-display font-bold text-lg" style={{ color: 'rgb(var(--content-primary))' }}>
              Travel OS
            </span>
          </div>

          {/* Card */}
          <motion.div
            className="glass p-8"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-8">
              <h2
                className="font-display text-2xl font-bold mb-1.5"
                style={{ color: 'rgb(var(--content-primary))' }}
              >
                Welcome back
              </h2>
              <p className="text-sm" style={{ color: 'rgb(var(--content-secondary))' }}>
                Sign in to your Travel OS workspace
              </p>
            </div>

            {/* Session expired alert */}
            <AnimatePresence>
              {sessionExpired && (
                <motion.div
                  className="flex items-center gap-2 p-3 rounded-xl mb-5 text-sm"
                  style={{
                    background: 'rgb(var(--status-warning) / 0.1)',
                    border: '1px solid rgb(var(--status-warning) / 0.3)',
                    color: 'rgb(var(--status-warning))',
                  }}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Your session expired. Please sign in again.
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'rgb(var(--content-secondary))' }}
                >
                  Work Email
                </label>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                  style={{
                    background: 'rgb(var(--surface-elevated))',
                    border: focusedField === 'email'
                      ? '1.5px solid rgb(var(--accent))'
                      : '1.5px solid rgb(var(--border))',
                    color: 'rgb(var(--content-primary))',
                    boxShadow: focusedField === 'email'
                      ? '0 0 0 3px rgb(var(--accent) / 0.1)'
                      : 'none',
                  }}
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    className="text-xs font-medium"
                    style={{ color: 'rgb(var(--content-secondary))' }}
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    className="text-xs hover:underline"
                    style={{ color: 'rgb(var(--accent-text))' }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full px-4 py-3 pr-11 rounded-xl text-sm outline-none transition-all duration-200"
                    style={{
                      background: 'rgb(var(--surface-elevated))',
                      border: focusedField === 'password'
                        ? '1.5px solid rgb(var(--accent))'
                        : '1.5px solid rgb(var(--border))',
                      color: 'rgb(var(--content-primary))',
                      boxShadow: focusedField === 'password'
                        ? '0 0 0 3px rgb(var(--accent) / 0.1)'
                        : 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors"
                    style={{ color: 'rgb(var(--content-muted))' }}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    className="flex items-center gap-2 p-3 rounded-xl text-sm"
                    style={{
                      background: 'rgb(var(--status-danger) / 0.1)',
                      border: '1px solid rgb(var(--status-danger) / 0.3)',
                      color: 'rgb(var(--status-danger))',
                    }}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 mt-2"
                style={{
                  background: loading || !email || !password
                    ? 'rgb(var(--surface-elevated))'
                    : 'rgb(var(--accent))',
                  color: loading || !email || !password
                    ? 'rgb(var(--content-muted))'
                    : 'white',
                  cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                }}
                whileHover={!loading && email && password ? { scale: 1.01 } : {}}
                whileTap={!loading && email && password ? { scale: 0.98 } : {}}
              >
                {loading ? (
                  <>
                    <motion.div
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </form>
          </motion.div>

          {/* Demo Accounts */}
          <motion.div
            className="mt-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px" style={{ background: 'rgb(var(--border))' }} />
              <span className="text-xs flex items-center gap-1" style={{ color: 'rgb(var(--content-muted))' }}>
                <Sparkles className="w-3 h-3" /> Demo Accounts
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgb(var(--border))' }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Super Admin', role: 'admin', color: 'var(--status-danger)' },
                { label: 'Travel Desk', role: 'desk',  color: 'var(--status-info)' },
                { label: 'Finance',     role: 'finance', color: 'var(--status-success)' },
                { label: 'Manager L1', role: 'manager', color: 'var(--status-warning)' },
                { label: 'Employee L3', role: 'emp',   color: 'var(--accent)' },
              ].map((d) => (
                <button
                  key={d.role}
                  onClick={() => fillDemo(d.role)}
                  className="px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 text-left"
                  style={{
                    background: 'rgb(var(--surface-elevated))',
                    border: '1px solid rgb(var(--border))',
                    color: `rgb(${d.color})`,
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-center text-xs mt-3" style={{ color: 'rgb(var(--content-muted))' }}>
              Password for all demo accounts: <span className="font-mono" style={{ color: 'rgb(var(--content-secondary))' }}>Travel@123</span>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
