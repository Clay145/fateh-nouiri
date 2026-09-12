import React, { useState } from 'react';
import { ShieldCheck, Lock, Eye, EyeOff, ArrowRight, Sparkles, KeyRound } from 'lucide-react';
import { loginAdmin } from '../services/orderService';

interface AdminAuthGateProps {
  onAuthenticated: () => void;
  onExit: () => void;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({ onAuthenticated, onExit }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('يرجى إدخال كلمة مرور الإدارة');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const success = await loginAdmin(password.trim());
      if (success) {
        onAuthenticated();
      } else {
        setErrorMsg('كلمة المرور غير صحيحة. الوصول مقتصر على المشرف فقط.');
      }
    } catch {
      setErrorMsg('حدث خطأ أثناء التحقق. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-[#7dd3fc]/30 selection:text-[#7dd3fc]">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-[#38bdf8]/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-[#818cf8]/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Security Gate Card */}
      <div className="w-full max-w-md bg-[#0f172a]/95 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 text-right">
        {/* Top security icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-sky-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-6 text-[#7dd3fc] shadow-[0_0_25px_rgba(56,189,248,0.15)]">
          <Lock className="w-8 h-8" />
        </div>

        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>بوابة الإدارة المخصصة</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            لوحة تحكم المشرف والطلبات
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
            هذه الصفحة مخصصة لمدير متجر Theoria فقط. يرجى إدخال مفتاح الإدارة لعرض بيانات العملاء والطلبات لحظياً.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>كلمة مرور المشرف</span>
              <span className="text-[11px] text-slate-500 font-normal">الافتراضية: theoria2026</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="أدخل رمز المشرف..."
                className="w-full pl-10 pr-10 py-3 bg-[#090d16] border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-[#7dd3fc] focus:ring-1 focus:ring-[#7dd3fc] transition text-left tracking-wider font-mono placeholder:text-slate-600 placeholder:text-right placeholder:font-sans"
              />
              <KeyRound className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5 pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-3 text-slate-500 hover:text-slate-300 p-1"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-[#7dd3fc] to-[#38bdf8] text-slate-950 hover:brightness-110 active:scale-[0.99] transition shadow-[0_0_20px_rgba(56,189,248,0.25)] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>تسجيل الدخول إلى لوحة الإدارة</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <button
            onClick={onExit}
            className="flex items-center gap-1 text-slate-400 hover:text-[#7dd3fc] transition font-semibold"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>الرجوع إلى المتجر العام</span>
          </button>
          <span className="text-[11px] text-slate-600">Theoria Store Ops</span>
        </div>
      </div>
    </div>
  );
};
