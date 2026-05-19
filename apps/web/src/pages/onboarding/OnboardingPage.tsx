import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plane, Building2, User, ChevronRight, ChevronLeft, CheckCircle, Phone, Briefcase } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { authApi, departmentApi } from '../../lib/api';
import { GradeLevel } from '@travel-os/shared-types';
import { AxiosError } from 'axios';

interface Department  { id: string; name: string; code: string; }
interface CostCentre  { id: string; code: string; name: string; departmentId: string; }

const STEPS = [
  { id: 1, label: 'Your Profile',  icon: User,      desc: 'Tell us about your role' },
  { id: 2, label: 'Department',    icon: Building2, desc: 'Set your team & cost centre' },
  { id: 3, label: 'All Set!',      icon: CheckCircle, desc: 'Review and confirm' },
];

const GRADE_INFO: Record<GradeLevel, { label: string; perks: string[] }> = {
  [GradeLevel.L1]: { label: 'L1 — Junior',   perks: ['Bus & Train travel', '₹2,000/night hotel', '₹500 daily allowance'] },
  [GradeLevel.L2]: { label: 'L2 — Associate', perks: ['Bus, Train & Cab travel', '₹3,000/night hotel', '₹800 daily allowance'] },
  [GradeLevel.L3]: { label: 'L3 — Senior',    perks: ['Economy Flights', '₹4,500/night hotel', '₹1,200 daily allowance'] },
  [GradeLevel.L4]: { label: 'L4 — Lead',      perks: ['Economy Flights + Cab', '₹6,000/night hotel', '₹1,800 daily allowance'] },
  [GradeLevel.L5]: { label: 'L5 — Manager',   perks: ['Business Class Flights', '₹10,000/night hotel', '₹3,000 daily allowance'] },
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { employee, markOnboardingComplete } = useAuthStore();

  const [step, setStep]               = useState(1);
  const [designation, setDesignation] = useState('');
  const [phone, setPhone]             = useState('');
  const [grade, setGrade]             = useState<GradeLevel | ''>('');
  const [deptId, setDeptId]           = useState('');
  const [ccId, setCcId]               = useState('');
  const [departments, setDepts]       = useState<Department[]>([]);
  const [costCentres, setCostCentres] = useState<CostCentre[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [submitted, setSubmitted]     = useState(false);

  useEffect(() => {
    departmentApi.list().then((r) => setDepts(r.data.data)).catch(() => {});
    departmentApi.costCentres().then((r) => setCostCentres(r.data.data)).catch(() => {});
  }, []);

  const filteredCCs = costCentres.filter((cc) => cc.departmentId === deptId);

  const canNext = () => {
    if (step === 1) return designation.trim().length > 0 && grade !== '' && /^[6-9]\d{9}$/.test(phone);
    if (step === 2) return deptId !== '' && ccId !== '';
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      await authApi.completeOnboarding({ designation, departmentId: deptId, costCentreId: ccId, phone, gradeLevel: grade });
      markOnboardingComplete();
      setSubmitted(true);
      setTimeout(() => navigate('/dashboard', { replace: true }), 1800);
    } catch (err: unknown) {
      const e = err as AxiosError<{ error: { message: string } }>;
      setError(e.response?.data?.error?.message ?? 'Setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:  (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  };
  const [dir, setDir] = useState(1);

  const go = (nextStep: number) => {
    setDir(nextStep > step ? 1 : -1);
    setStep(nextStep);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'rgb(var(--surface-primary))' }}>
        <motion.div
          className="flex flex-col items-center gap-6 text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <motion.div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgb(var(--status-success) / 0.15)' }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.6 }}
          >
            <CheckCircle className="w-10 h-10" style={{ color: 'rgb(var(--status-success))' }} />
          </motion.div>
          <div>
            <h2 className="font-display text-2xl font-bold mb-2" style={{ color: 'rgb(var(--content-primary))' }}>
              Welcome aboard!
            </h2>
            <p style={{ color: 'rgb(var(--content-secondary))' }}>
              Redirecting you to your dashboard…
            </p>
          </div>
          <motion.div className="flex gap-1.5">
            {[0,1,2].map((i) => (
              <motion.div key={i} className="w-2 h-2 rounded-full"
                style={{ background: 'rgb(var(--accent))' }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }} />
            ))}
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'rgb(var(--surface-primary))' }}>

      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-10 blur-[100px]"
          style={{ background: 'rgb(var(--accent))' }} />
      </div>

      <div className="w-full max-w-lg relative z-10">
        {/* Header */}
        <motion.div className="text-center mb-8" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgb(var(--accent))' }}>
              <Plane className="w-4.5 h-4.5 text-white" fill="currentColor" />
            </div>
            <span className="font-display font-bold text-lg" style={{ color: 'rgb(var(--content-primary))' }}>
              Travel OS
            </span>
          </div>
          <h1 className="font-display text-2xl font-bold mb-1.5" style={{ color: 'rgb(var(--content-primary))' }}>
            Set up your profile
          </h1>
          <p className="text-sm" style={{ color: 'rgb(var(--content-secondary))' }}>
            This takes about 2 minutes and only happens once
          </p>
        </motion.div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className={`flex flex-col items-center gap-1.5 flex-1 ${i < STEPS.length - 1 ? '' : ''}`}>
                <motion.div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  animate={{
                    background: step > s.id ? 'rgb(var(--status-success))' :
                                step === s.id ? 'rgb(var(--accent))' : 'rgb(var(--surface-elevated))',
                    color: step >= s.id ? 'white' : 'rgb(var(--content-muted))',
                  }}
                >
                  {step > s.id ? <CheckCircle className="w-4 h-4" /> : s.id}
                </motion.div>
                <p className="text-[10px] font-medium hidden sm:block"
                  style={{ color: step === s.id ? 'rgb(var(--content-primary))' : 'rgb(var(--content-muted))' }}>
                  {s.label}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <div className="h-px flex-1 mx-2 transition-colors duration-500"
                  style={{ background: step > s.id ? 'rgb(var(--status-success))' : 'rgb(var(--border))' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="glass p-6 overflow-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            >
              {/* Step 1: Profile */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display font-bold text-lg mb-1" style={{ color: 'rgb(var(--content-primary))' }}>
                      Your Profile
                    </h2>
                    <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
                      Basic info to set up your travel policy
                    </p>
                  </div>

                  {/* Designation */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
                      Job Designation *
                    </label>
                    <input
                      type="text" value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Senior Software Engineer"
                      className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                      style={{
                        background: 'rgb(var(--surface-elevated))',
                        border: '1.5px solid rgb(var(--border))',
                        color: 'rgb(var(--content-primary))',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = 'rgb(var(--accent))')}
                      onBlur={(e)  => (e.target.style.borderColor = 'rgb(var(--border))')}
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
                      Mobile Number *
                    </label>
                    <div className="flex gap-2">
                      <div className="px-3 py-3 rounded-xl text-sm font-medium flex-shrink-0 border"
                        style={{
                          background: 'rgb(var(--surface-elevated))',
                          border: '1.5px solid rgb(var(--border))',
                          color: 'rgb(var(--content-muted))',
                        }}>
                        +91
                      </div>
                      <input
                        type="tel" value={phone} maxLength={10}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="10-digit mobile number"
                        className="flex-1 px-4 py-3 rounded-xl text-sm outline-none transition-all font-mono"
                        style={{
                          background: 'rgb(var(--surface-elevated))',
                          border: '1.5px solid rgb(var(--border))',
                          color: 'rgb(var(--content-primary))',
                        }}
                        onFocus={(e) => (e.target.style.borderColor = 'rgb(var(--accent))')}
                        onBlur={(e)  => (e.target.style.borderColor = 'rgb(var(--border))')}
                      />
                    </div>
                    {phone && !/^[6-9]\d{9}$/.test(phone) && (
                      <p className="text-xs mt-1" style={{ color: 'rgb(var(--status-danger))' }}>
                        Enter a valid 10-digit Indian mobile number
                      </p>
                    )}
                  </div>

                  {/* Grade */}
                  <div>
                    <label className="block text-xs font-medium mb-2" style={{ color: 'rgb(var(--content-secondary))' }}>
                      Grade Level * <span className="ml-1 text-[10px]" style={{ color: 'rgb(var(--content-muted))' }}>
                        — determines your travel policy
                      </span>
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {Object.entries(GRADE_INFO).map(([g, info]) => (
                        <motion.button
                          key={g} type="button"
                          onClick={() => setGrade(g as GradeLevel)}
                          className="flex items-start gap-3 p-3 rounded-xl text-left transition-all"
                          style={{
                            background: grade === g ? 'rgb(var(--accent-subtle))' : 'rgb(var(--surface-elevated))',
                            border: grade === g ? '1.5px solid rgb(var(--accent) / 0.4)' : '1.5px solid rgb(var(--border))',
                          }}
                          whileHover={{ scale: 1.005 }}
                          whileTap={{ scale: 0.995 }}
                        >
                          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                            style={{ background: grade === g ? 'rgb(var(--accent))' : 'rgb(var(--surface-overlay))', color: grade === g ? 'white' : 'rgb(var(--content-muted))' }}>
                            {g}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                              {info.label}
                            </p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'rgb(var(--content-muted))' }}>
                              {info.perks.join(' · ')}
                            </p>
                          </div>
                          {grade === g && (
                            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'rgb(var(--accent))' }} />
                          )}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Department */}
              {step === 2 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display font-bold text-lg mb-1" style={{ color: 'rgb(var(--content-primary))' }}>
                      Department & Cost Centre
                    </h2>
                    <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
                      Budget tracking is linked to your cost centre
                    </p>
                  </div>

                  {/* Department */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
                      Department *
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {departments.map((dept) => (
                        <motion.button
                          key={dept.id} type="button"
                          onClick={() => { setDeptId(dept.id); setCcId(''); }}
                          className="p-3 rounded-xl text-left transition-all"
                          style={{
                            background: deptId === dept.id ? 'rgb(var(--accent-subtle))' : 'rgb(var(--surface-elevated))',
                            border: deptId === dept.id ? '1.5px solid rgb(var(--accent) / 0.4)' : '1.5px solid rgb(var(--border))',
                          }}
                          whileHover={{ scale: 1.01 }}
                        >
                          <p className="text-xs font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                            {dept.name}
                          </p>
                          <p className="text-[10px] mt-0.5 font-mono" style={{ color: 'rgb(var(--content-muted))' }}>
                            {dept.code}
                          </p>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Cost Centre */}
                  <AnimatePresence>
                    {deptId && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                      >
                        <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgb(var(--content-secondary))' }}>
                          Cost Centre *
                        </label>
                        <div className="space-y-2">
                          {filteredCCs.map((cc) => (
                            <motion.button
                              key={cc.id} type="button"
                              onClick={() => setCcId(cc.id)}
                              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                              style={{
                                background: ccId === cc.id ? 'rgb(var(--accent-subtle))' : 'rgb(var(--surface-elevated))',
                                border: ccId === cc.id ? '1.5px solid rgb(var(--accent) / 0.4)' : '1.5px solid rgb(var(--border))',
                              }}
                              whileHover={{ scale: 1.005 }}
                            >
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgb(var(--surface-overlay))' }}>
                                <Briefcase className="w-3.5 h-3.5" style={{ color: 'rgb(var(--content-muted))' }} />
                              </div>
                              <div>
                                <p className="text-xs font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>
                                  {cc.name}
                                </p>
                                <p className="text-[10px] font-mono" style={{ color: 'rgb(var(--content-muted))' }}>
                                  {cc.code}
                                </p>
                              </div>
                              {ccId === cc.id && (
                                <CheckCircle className="w-4 h-4 ml-auto" style={{ color: 'rgb(var(--accent))' }} />
                              )}
                            </motion.button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Step 3: Review */}
              {step === 3 && (
                <div className="space-y-5">
                  <div>
                    <h2 className="font-display font-bold text-lg mb-1" style={{ color: 'rgb(var(--content-primary))' }}>
                      Confirm your setup
                    </h2>
                    <p className="text-xs" style={{ color: 'rgb(var(--content-muted))' }}>
                      Review before we finalize your travel profile
                    </p>
                  </div>

                  <div className="space-y-3">
                    {[
                      { label: 'Designation',   value: designation, icon: User },
                      { label: 'Mobile',        value: `+91 ${phone}`, icon: Phone },
                      { label: 'Grade Level',   value: grade ? GRADE_INFO[grade as GradeLevel].label : '', icon: Briefcase },
                      { label: 'Department',    value: departments.find((d) => d.id === deptId)?.name ?? '', icon: Building2 },
                      { label: 'Cost Centre',   value: costCentres.find((c) => c.id === ccId)?.name ?? '', icon: Building2 },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="flex items-center gap-3 p-3.5 rounded-xl"
                        style={{ background: 'rgb(var(--surface-elevated))' }}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: 'rgb(var(--accent-subtle))' }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: 'rgb(var(--accent))' }} />
                        </div>
                        <div>
                          <p className="text-[10px]" style={{ color: 'rgb(var(--content-muted))' }}>{label}</p>
                          <p className="text-sm font-semibold" style={{ color: 'rgb(var(--content-primary))' }}>{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <p className="text-xs text-center p-3 rounded-xl"
                      style={{ background: 'rgb(var(--status-danger)/0.1)', color: 'rgb(var(--status-danger))' }}>
                      {error}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <button
                onClick={() => go(step - 1)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                style={{ background: 'rgb(var(--surface-elevated))', color: 'rgb(var(--content-secondary))' }}
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <motion.button
              onClick={step === 3 ? handleSubmit : () => go(step + 1)}
              disabled={!canNext() || loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: canNext() && !loading ? 'rgb(var(--accent))' : 'rgb(var(--surface-elevated))',
                color: canNext() && !loading ? 'white' : 'rgb(var(--content-muted))',
                cursor: canNext() && !loading ? 'pointer' : 'not-allowed',
              }}
              whileHover={canNext() ? { scale: 1.01 } : {}}
              whileTap={canNext() ? { scale: 0.98 } : {}}
            >
              {loading ? (
                <>
                  <motion.div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
                  Saving…
                </>
              ) : step === 3 ? (
                <><CheckCircle className="w-4 h-4" /> Complete Setup</>
              ) : (
                <>Continue <ChevronRight className="w-4 h-4" /></>
              )}
            </motion.button>
          </div>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'rgb(var(--content-muted))' }}>
          Step {step} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
