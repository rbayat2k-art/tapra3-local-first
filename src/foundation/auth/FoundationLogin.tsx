import React, { useState } from 'react';
import { Building2, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import { useFoundationSession } from './FoundationSessionContext';

export function FoundationLogin() {
  const { login, error } = useFoundationSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try { await login(email, password); } catch { /* Error is shown by the provider. */ }
    finally { setSubmitting(false); }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 dir-rtl">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center"><Building2 /></div>
          <div><h1 className="text-xl font-extrabold">ورود امن به تپرا</h1><p className="text-xs text-slate-400 mt-1">سامانه یکپارچه عملیات</p></div>
        </div>
        <label className="block text-sm font-bold">ایمیل
          <input aria-label="ایمیل" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-left" />
        </label>
        <label className="block text-sm font-bold">رمز عبور
          <input aria-label="رمز عبور" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-left" />
        </label>
        {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        <button disabled={submitting} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-60 flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />} ورود
        </button>
        <p className="text-xs text-slate-400 flex gap-2"><ShieldCheck size={16} className="text-emerald-400 shrink-0" />نشست شما در سرور نگهداری می‌شود و اطلاعات ورود در مرورگر ذخیره نمی‌شود.</p>
      </form>
    </main>
  );
}
