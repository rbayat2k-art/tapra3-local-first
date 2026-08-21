import React, { useState } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useFoundationSession } from './FoundationSessionContext';

export function FoundationPasswordChange() {
  const { changePassword, logout, error } = useFoundationSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setLocalError('تکرار رمز عبور با رمز جدید یکسان نیست.');
      return;
    }
    setSubmitting(true); setLocalError(null);
    try { await changePassword(currentPassword, newPassword); }
    catch { /* Provider error is rendered below. */ }
    finally { setSubmitting(false); }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 dir-rtl">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl border border-amber-700/50 bg-slate-900 p-7 shadow-2xl space-y-5">
        <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-amber-600 flex items-center justify-center"><KeyRound /></div><div><h1 className="text-xl font-extrabold">تغییر رمز موقت</h1><p className="text-xs text-slate-400 mt-1">پیش از ورود به محیط کاری، credential شخصی خود را ثبت کنید.</p></div></div>
        <label className="block text-sm font-bold">رمز موقت<input aria-label="رمز موقت" dir="ltr" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-left" /></label>
        <label className="block text-sm font-bold">رمز جدید<input aria-label="رمز جدید" dir="ltr" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={12} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-left" /></label>
        <label className="block text-sm font-bold">تکرار رمز جدید<input aria-label="تکرار رمز جدید" dir="ltr" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} type="password" minLength={12} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-left" /></label>
        <p className="text-xs text-slate-400">حداقل ۱۲ نویسه و شامل حرف کوچک، حرف بزرگ، عدد و نماد.</p>
        {(localError || error) && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{localError || error}</p>}
        <button disabled={submitting} className="w-full rounded-xl bg-amber-600 p-3 font-bold text-slate-950 disabled:opacity-60 flex items-center justify-center gap-2">{submitting ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}ثبت امن رمز جدید</button>
        <button type="button" onClick={() => void logout()} className="w-full text-xs text-slate-400 underline">خروج بدون تغییر</button>
      </form>
    </main>
  );
}
