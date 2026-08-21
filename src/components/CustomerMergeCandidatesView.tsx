import React, { useState } from 'react';
import { Customer, User, SystemRole, SystemPermission, CustomerMergeRequest } from '../types';
import { getJalaliNow } from '../utils/persianDate';
import {
  findMergeCandidates, normalizeName, normalizePhone, MergeCandidate,
  toCustomerSearchResultView, toCustomerComparisonView
} from '../utils/customerIdentity';
import { hasPermission } from '../utils/permissions';
import { logAudit } from '../utils/auditLog';
import { Search, GitMerge, Phone, MapPin, User as UserIcon, Clock, ShieldAlert, CheckSquare, Square } from 'lucide-react';

interface CustomerMergeCandidatesViewProps {
  customers: Customer[];
  users: User[];
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  mergeRequests: CustomerMergeRequest[];
  onUpdateMergeRequests: (requests: CustomerMergeRequest[]) => void;
  impersonatorAdmin?: User | null;
  initialTargetCustomerId?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'در انتظار بررسی مدیر داده', tone: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  approved: { label: 'تأییدشده و ادغام‌شده', tone: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  rejected: { label: 'رد شده', tone: 'bg-rose-500/10 text-rose-400 border-rose-500/30' }
};

export const CustomerMergeCandidatesView: React.FC<CustomerMergeCandidatesViewProps> = ({
  customers, users, currentUser, roles, effectivePermissions, mergeRequests, onUpdateMergeRequests,
  impersonatorAdmin = null, initialTargetCustomerId = null
}) => {
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState<string | null>(initialTargetCustomerId);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [motherId, setMotherId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  if (!currentUser) return null;

  const canRequest = hasPermission(effectivePermissions, ['request_customer_merge']);
  if (!canRequest) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400 flex items-center gap-2" dir="rtl">
        <ShieldAlert className="w-4 h-4 text-rose-400" />
        شما مجوز درخواست ادغام پروفایل مشتری را ندارید.
      </div>
    );
  }

  const target = targetId ? customers.find((c) => c.id === targetId) || null : null;

  // هرگز Customer خام — فقط از View Model حداقلی (همان مسیر جست‌وجوی سراسری) استفاده می‌شود.
  // داشتن صرفاً request_customer_merge کافی نیست برای دیدن شمارهٔ/آدرس کامل.
  const searchResults = (() => {
    const q = normalizeName(query.trim());
    const qPhone = normalizePhone(query.trim());
    if (!q && !qPhone) return [];
    return customers
      .filter((c) => !c.isAbsorbed)
      .filter((c) => {
        const names = [c.fullName, ...(c.nameEntries || []).map((e) => e.value)].filter(Boolean).map((n) => normalizeName(n as string));
        const phones = [c.phone1, c.phone2, ...(c.phoneEntries || []).map((e) => e.value)].filter(Boolean).map((p) => normalizePhone(p as string));
        return (q && names.some((n) => n.includes(q))) || (qPhone && phones.some((p) => p.includes(qPhone)));
      })
      .slice(0, 15)
      .map((c) => toCustomerSearchResultView(c, effectivePermissions));
  })();

  const targetView = target ? toCustomerSearchResultView(target, effectivePermissions) : null;
  const candidates: MergeCandidate[] = target ? findMergeCandidates(target, customers) : [];
  const selectedCandidates = candidates.filter((c) => selectedCandidateIds.has(c.customer.id));
  const motherOptions = target ? [{ id: target.id, view: targetView! }, ...selectedCandidates.map((c) => ({ id: c.customer.id, view: toCustomerSearchResultView(c.customer, effectivePermissions) }))] : [];

  const myRequests = mergeRequests.filter((r) => r.requesterId === currentUser.id).slice(0, 20);

  const handleSelectTarget = (id: string) => {
    setTargetId(id);
    setSelectedCandidateIds(new Set());
    setMotherId(id);
    setReason('');
    setQuery('');
  };

  const toggleCandidate = (id: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!target || selectedCandidates.length === 0 || !motherId) return;
    if (!reason.trim()) {
      alert('ذکر دلیل انتخاب پروفایل مادر (کدام پروفایل باید اطلاعات دقیق‌تری داشته باشد) الزامی است.');
      return;
    }
    // حداقل دو پروفایل، بدون تکراری — انتخاب از میان candidates تضمین می‌کند پروفایل جذب‌شده یا
    // خودِ پروفایل مبدأ در این فهرست نباشد؛ Set هم به‌طور طبیعی از انتخاب تکراری جلوگیری می‌کند.
    const profileIds = Array.from(new Set([target.id, ...selectedCandidates.map((c) => c.customer.id)]));
    if (profileIds.length < 2) return;

    const now = getJalaliNow();
    const bestMatch = [...selectedCandidates].sort((a, b) => b.overallScore - a.overallScore)[0];
    const newRequest: CustomerMergeRequest = {
      id: `mreq_${Date.now()}`,
      requestNumber: `MRQ-${Date.now().toString(36).toUpperCase()}`,
      idempotencyKey: `merge_req_${profileIds.join('_')}_${Date.now()}`,
      profileIds,
      motherProfileId: motherId,
      motherProfileReason: reason.trim(),
      matchType: bestMatch.matchType,
      overallScore: bestMatch.overallScore,
      reasons: bestMatch.reasons,
      requesterId: currentUser.id,
      requesterName: currentUser.fullName,
      requesterRole: currentUser.roleTitle,
      requestedAt: now,
      status: 'pending'
    };
    onUpdateMergeRequests([newRequest, ...mergeRequests]);
    logAudit({
      action: 'customer_merge_requested', effectiveUser: currentUser, impersonatorAdmin, roles,
      permissionUsed: 'request_customer_merge', targetId: newRequest.id,
      details: `درخواست ادغام ${profileIds.length} پروفایل (${newRequest.requestNumber})`
    });
    alert('درخواست ادغام ثبت شد و برای تصمیم‌گیری نهایی به کارتابل مدیر داده ارسال شد. تا آن زمان هیچ ادغامی انجام نمی‌شود.');
    setSelectedCandidateIds(new Set());
    setReason('');
  };

  return (
    <div className="max-w-3xl space-y-6" dir="rtl">
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-3">
        <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center shrink-0">
          <GitMerge className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-white">درخواست ادغام پروفایل‌های مشابه</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            یک پروفایل را انتخاب کنید، یک یا چند پروفایل مشابه را از فهرست پیشنهادی تیک بزنید و درخواست ادغام ثبت کنید — تصمیم نهایی همیشه با مدیر داده است.
          </p>
        </div>
      </div>

      {!target || !targetView ? (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            جستجوی پروفایل مبدأ (نام یا شماره تماس)
          </label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بخشی از نام یا شماره تماس..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
          <div className="space-y-1.5">
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => handleSelectTarget(r.id)}
                className="w-full text-right p-3 bg-slate-950/70 border border-slate-800 hover:border-indigo-500/50 rounded-xl flex items-center justify-between gap-2 transition cursor-pointer"
              >
                <span className="text-xs font-bold text-white">{r.displayName}</span>
                <span className="text-[10px] text-slate-500 font-mono" dir="ltr">{r.displayPhone}</span>
              </button>
            ))}
            {query.trim() && searchResults.length === 0 && (
              <p className="text-[11px] text-slate-500">نتیجه‌ای یافت نشد.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-indigo-500/30 rounded-2xl flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] text-slate-500">پروفایل مبدأ</p>
              <p className="text-sm font-bold text-white">{targetView.displayName} <span className="text-slate-500 font-mono text-[11px]" dir="ltr">{targetView.displayPhone}</span></p>
            </div>
            <button onClick={() => { setTargetId(null); setSelectedCandidateIds(new Set()); }} className="text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer">تغییر پروفایل مبدأ</button>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-300">پروفایل‌های مشابه پیشنهادی — {selectedCandidateIds.size > 0 ? `${selectedCandidateIds.size} مورد انتخاب‌شده از ${candidates.length}` : `${candidates.length} مورد`}</div>
            {candidates.length === 0 ? (
              <p className="text-[11px] text-slate-500 p-4 border border-dashed border-slate-800 rounded-2xl text-center">هیچ پروفایل مشابهی (بر اساس شمارهٔ مشترک یا شباهت بالای نام/آدرس) یافت نشد.</p>
            ) : candidates.map((cand) => {
              const view = toCustomerComparisonView(cand, effectivePermissions);
              const isSelected = selectedCandidateIds.has(cand.customer.id);
              return (
                <button
                  key={cand.customer.id}
                  onClick={() => toggleCandidate(cand.customer.id)}
                  className={`w-full text-right p-3.5 border rounded-xl space-y-1.5 cursor-pointer transition ${isSelected ? 'bg-indigo-950/40 border-indigo-500' : 'bg-slate-950/70 border-slate-800 hover:border-indigo-500/50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                      {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> : <Square className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
                      {view.displayName}
                      <span className="text-slate-500 font-mono text-[10px]" dir="ltr">{view.displayPhone}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                      امتیاز تطبیق {view.overallScore}٪ — {view.matchType === 'exact_phone_similarity' ? 'شمارهٔ مشترک' : 'شباهت نام/آدرس'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                    {view.reasons.map((r) => (
                      <span key={r.field} className="flex items-center gap-1">
                        {r.field === 'phone' ? <Phone className="w-3 h-3" /> : r.field === 'address' ? <MapPin className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                        {r.note}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedCandidates.length > 0 && (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <div className="text-xs font-bold text-slate-300">ثبت درخواست ادغام ({motherOptions.length} پروفایل)</div>
              <div>
                <p className="text-[11px] text-slate-400 mb-1.5">کدام پروفایل باید به‌عنوان «پروفایل مادر» (اطلاعات پایه) در نظر گرفته شود؟</p>
                <div className="flex flex-wrap gap-2">
                  {motherOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setMotherId(opt.id)}
                      className={`flex-1 min-w-[140px] px-3 py-2 rounded-xl text-[11px] font-bold border cursor-pointer ${motherId === opt.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}
                    >
                      {opt.view.displayName}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="دلیل انتخاب پروفایل مادر و توضیح علت درخواست ادغام را بنویسید..."
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[10px] text-slate-500">این فقط یک درخواست است — تصمیم نهایی و اجرای ادغام تنها با مدیر داده خواهد بود.</p>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <GitMerge className="w-4 h-4" />
                ثبت درخواست ادغام
              </button>
            </div>
          )}
        </div>
      )}

      {hasPermission(effectivePermissions, ['view_own_merge_requests']) && myRequests.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-300">درخواست‌های ادغام ثبت‌شدهٔ من</div>
          <div className="space-y-1.5">
            {myRequests.map((r) => (
              <div key={r.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-2 text-[11px]">
                <div>
                  <span className="font-bold text-white">{r.requestNumber}</span>
                  <span className="text-slate-500 mr-2">{r.profileIds.length} پروفایل — {r.motherProfileReason}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-mono flex items-center gap-1" dir="ltr"><Clock className="w-3 h-3" />{r.requestedAt}</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold border ${STATUS_LABELS[r.status].tone}`}>{STATUS_LABELS[r.status].label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
