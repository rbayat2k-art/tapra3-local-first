import React, { useState } from 'react';
import {
  Customer, User, SystemRole, SystemPermission,
  CustomerMergeRequest, CustomerMergeEvent, CustomerSplitEvent, CustomerEntryConflict,
  CustomerPhoneEntry, CustomerNameEntry, CustomerAddressEntry
} from '../types';
import { getJalaliNow } from '../utils/persianDate';
import {
  previewSplit,
  decideMergeApproval, decideMergeRejection, decideSplitExecution,
  decideConflictResolutionAttach, decideConflictResolutionCreateNew, decideConflictResolutionDismiss
} from '../utils/customerIdentity';
import { hasPermission } from '../utils/permissions';
import { logAudit } from '../utils/auditLog';
import { storage } from '../utils/storage';
import {
  Inbox, GitMerge, GitBranch, CheckCircle2, XCircle, AlertTriangle, History,
  Phone, MapPin, Clock, ShieldAlert
} from 'lucide-react';

interface CustomerMergeReviewQueueViewProps {
  customers: Customer[];
  users: User[];
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  mergeRequests: CustomerMergeRequest[];
  onUpdateMergeRequests: (requests: CustomerMergeRequest[]) => void;
  mergeEvents: CustomerMergeEvent[];
  onUpdateMergeEvents: (events: CustomerMergeEvent[]) => void;
  splitEvents: CustomerSplitEvent[];
  onUpdateSplitEvents: (events: CustomerSplitEvent[]) => void;
  entryConflicts: CustomerEntryConflict[];
  onUpdateEntryConflicts: (conflicts: CustomerEntryConflict[]) => void;
  onUpdateCustomers: (customers: Customer[]) => void;
  impersonatorAdmin?: User | null;
}

type TabId = 'merge_queue' | 'conflict_queue' | 'history';

export const CustomerMergeReviewQueueView: React.FC<CustomerMergeReviewQueueViewProps> = ({
  customers, currentUser, roles, effectivePermissions,
  mergeRequests, onUpdateMergeRequests, mergeEvents, onUpdateMergeEvents,
  splitEvents, onUpdateSplitEvents, entryConflicts, onUpdateEntryConflicts,
  onUpdateCustomers, impersonatorAdmin = null
}) => {
  const [tab, setTab] = useState<TabId>('merge_queue');
  const [rejectDraftByRequestId, setRejectDraftByRequestId] = useState<Record<string, string>>({});
  const [conflictNoteById, setConflictNoteById] = useState<Record<string, string>>({});
  const [splitOpenEventId, setSplitOpenEventId] = useState<string | null>(null);
  const [splitReason, setSplitReason] = useState('');
  const [splitDestinations, setSplitDestinations] = useState<Record<string, string>>({});

  if (!currentUser) return null;

  const canReviewMerge = hasPermission(effectivePermissions, ['review_customer_merge_queue']);
  const canDecideMerge = hasPermission(effectivePermissions, ['approve_reject_customer_merge']);
  const canReviewConflict = hasPermission(effectivePermissions, ['review_customer_entry_conflict']);
  const canSplit = hasPermission(effectivePermissions, ['split_customer_merge']);
  const canViewAudit = hasPermission(effectivePermissions, ['view_customer_identity_audit']);

  if (!canReviewMerge && !canReviewConflict && !canViewAudit) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400 flex items-center gap-2" dir="rtl">
        <ShieldAlert className="w-4 h-4 text-rose-400" />
        شما مجوز دسترسی به کارتابل ادغام/تعارض مدیر داده را ندارید.
      </div>
    );
  }

  const customerLabel = (id: string) => {
    const c = customers.find((x) => x.id === id);
    return c ? `${c.fullName || 'بدون نام'} (${c.phone1 || '—'})` : id;
  };

  const pendingMergeRequests = mergeRequests.filter((r) => r.status === 'pending');
  const pendingConflicts = entryConflicts.filter((c) => c.status === 'pending');

  // الگوی صحیح Handler در سراسر این فایل: ۱) decide* هم Permission هم وضعیت جاری (Stale) را
  // بررسی می‌کند ۲) فقط در موفقیت Transaction دامنه اجرا می‌شود ۳) Audit فقط پس از دانستن نتیجهٔ
  // واقعی Transaction ثبت می‌شود — هیچ Audit موفقیتی برای عملیات Rollback‌شده باقی نمی‌ماند.
  const handleApproveMerge = (requestId: string) => {
    const latest = mergeRequests.find((r) => r.id === requestId);
    if (!latest) return;
    const now = getJalaliNow();
    const outcome = decideMergeApproval(latest, customers, mergeEvents, effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, now);
    if (outcome.ok === false) {
      logAudit({ action: 'customer_merge_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'approve_reject_customer_merge', targetId: latest.id, details: `شکست: ${outcome.errorCode} — ${outcome.message}` });
      alert(outcome.message);
      return;
    }
    const updatedRequests = mergeRequests.map((r) => (r.id === latest.id ? outcome.data.updatedRequest : r));
    const updatedEvents = [...mergeEvents, outcome.data.event];
    const tx = storage.saveCustomerIdentityTransaction({ customers: outcome.data.updatedCustomers, mergeRequests: updatedRequests, mergeEvents: updatedEvents });
    if (tx.ok === false) {
      logAudit({ action: 'customer_merge_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'approve_reject_customer_merge', targetId: latest.id, details: `شکست ذخیره‌سازی تراکنشی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی تراکنشی ادغام: ' + tx.error);
      return;
    }
    logAudit({ action: 'customer_merge_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'approve_reject_customer_merge', targetId: latest.id, details: `تأیید و اجرای ادغام — رویداد ${outcome.data.event.id}` });
    onUpdateCustomers(outcome.data.updatedCustomers);
    onUpdateMergeRequests(updatedRequests);
    onUpdateMergeEvents(updatedEvents);
    alert('ادغام با موفقیت تأیید و اجرا شد.');
  };

  const handleRejectMerge = (requestId: string) => {
    const latest = mergeRequests.find((r) => r.id === requestId);
    if (!latest) return;
    const note = (rejectDraftByRequestId[requestId] || '').trim();
    const now = getJalaliNow();
    const outcome = decideMergeRejection(latest, note, effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, now);
    if (outcome.ok === false) {
      logAudit({ action: 'customer_merge_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'approve_reject_customer_merge', targetId: latest.id, details: `شکست: ${outcome.errorCode} — ${outcome.message}` });
      alert(outcome.message);
      return;
    }
    const updatedRequests = mergeRequests.map((r) => (r.id === latest.id ? outcome.data.updatedRequest : r));
    const tx = storage.saveCustomerIdentityTransaction({ mergeRequests: updatedRequests });
    if (tx.ok === false) {
      logAudit({ action: 'customer_merge_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'approve_reject_customer_merge', targetId: latest.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'customer_merge_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'approve_reject_customer_merge', targetId: latest.id, details: `رد درخواست ادغام: ${note}` });
    onUpdateMergeRequests(updatedRequests);
    setRejectDraftByRequestId((prev) => ({ ...prev, [requestId]: '' }));
  };

  // --- بررسی تعارض ورود اطلاعات ---
  const handleAttachConflictTo = (conflict: CustomerEntryConflict, targetCustomerId: string) => {
    const latest = entryConflicts.find((c) => c.id === conflict.id);
    if (!latest) return;
    const target = customers.find((c) => c.id === targetCustomerId);
    if (!target) return;
    const now = getJalaliNow();
    const outcome = decideConflictResolutionAttach(latest, target, effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, now);
    if (outcome.ok === false) {
      logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `شکست: ${outcome.errorCode} — ${outcome.message}` });
      alert(outcome.message);
      return;
    }
    const updatedCustomers = customers.map((c) => (c.id === target.id ? outcome.data.updatedCustomer : c));
    const updatedConflicts = entryConflicts.map((c) => (c.id === latest.id ? outcome.data.updatedConflict : c));
    const tx = storage.saveCustomerIdentityTransaction({ customers: updatedCustomers, entryConflicts: updatedConflicts });
    if (tx.ok === false) {
      logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `اتصال به پروفایل ${target.id}` });
    onUpdateCustomers(updatedCustomers);
    onUpdateEntryConflicts(updatedConflicts);
  };

  const handleCreateProfileFromConflict = (conflict: CustomerEntryConflict) => {
    const latest = entryConflicts.find((c) => c.id === conflict.id);
    if (!latest) return;
    const now = getJalaliNow();
    const outcome = decideConflictResolutionCreateNew(latest, effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, now);
    if (outcome.ok === false) {
      logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `شکست: ${outcome.errorCode} — ${outcome.message}` });
      alert(outcome.message);
      return;
    }
    const updatedCustomers = [outcome.data.newCustomer, ...customers];
    const updatedConflicts = entryConflicts.map((c) => (c.id === latest.id ? outcome.data.updatedConflict : c));
    const tx = storage.saveCustomerIdentityTransaction({ customers: updatedCustomers, entryConflicts: updatedConflicts });
    if (tx.ok === false) {
      logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `ایجاد پروفایل مستقل جدید ${outcome.data.newCustomer.id}` });
    onUpdateCustomers(updatedCustomers);
    onUpdateEntryConflicts(updatedConflicts);
  };

  const handleDismissConflict = (conflict: CustomerEntryConflict) => {
    const latest = entryConflicts.find((c) => c.id === conflict.id);
    if (!latest) return;
    const note = (conflictNoteById[conflict.id] || '').trim();
    const now = getJalaliNow();
    const outcome = decideConflictResolutionDismiss(latest, note, effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, now);
    if (outcome.ok === false) {
      logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `شکست: ${outcome.errorCode} — ${outcome.message}` });
      alert(outcome.message);
      return;
    }
    const updatedConflicts = entryConflicts.map((c) => (c.id === latest.id ? outcome.data.updatedConflict : c));
    const tx = storage.saveCustomerIdentityTransaction({ entryConflicts: updatedConflicts });
    if (tx.ok === false) {
      logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'customer_entry_conflict_resolved', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_entry_conflict', targetId: latest.id, details: `رد ورودی: ${note}` });
    onUpdateEntryConflicts(updatedConflicts);
    setConflictNoteById((prev) => ({ ...prev, [conflict.id]: '' }));
  };

  // --- تاریخچه و Split ---
  const splitOf = (eventId: string) => splitEvents.find((s) => s.originalMergeEventId === eventId);
  const openSplitPanel = (event: CustomerMergeEvent) => {
    setSplitOpenEventId(event.id);
    setSplitReason('');
    setSplitDestinations({});
  };

  const handleExecuteSplit = (event: CustomerMergeEvent) => {
    const now = getJalaliNow();
    const idempotencyKey = `split_${event.id}_${Date.now()}`;
    const outcome = decideSplitExecution(
      event, customers, splitEvents, effectivePermissions,
      { id: currentUser.id }, { id: currentUser.id, fullName: currentUser.fullName }, splitReason, splitDestinations, idempotencyKey, now
    );
    if (outcome.ok === false) {
      logAudit({ action: 'customer_split_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'split_customer_merge', targetId: event.id, details: `شکست: ${outcome.errorCode} — ${outcome.message}` });
      alert(outcome.message);
      return;
    }
    const updatedSplitEvents = [...splitEvents, outcome.data.splitEvent];
    const tx = storage.saveCustomerIdentityTransaction({ customers: outcome.data.updatedCustomers, splitEvents: updatedSplitEvents });
    if (tx.ok === false) {
      logAudit({ action: 'customer_split_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'split_customer_merge', targetId: event.id, details: `شکست ذخیره‌سازی تراکنشی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی تراکنشی جداسازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'customer_split_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'split_customer_merge', targetId: event.id, details: `اجرای جداسازی — رویداد ${outcome.data.splitEvent.id}` });
    onUpdateCustomers(outcome.data.updatedCustomers);
    onUpdateSplitEvents(updatedSplitEvents);
    alert('جداسازی با موفقیت اجرا شد.');
    setSplitOpenEventId(null);
  };

  const tabs: { id: TabId; label: string; count: number; visible: boolean }[] = [
    { id: 'merge_queue', label: 'صف ادغام', count: pendingMergeRequests.length, visible: canReviewMerge },
    { id: 'conflict_queue', label: 'صف تعارض ورود اطلاعات', count: pendingConflicts.length, visible: canReviewConflict },
    { id: 'history', label: 'تاریخچهٔ ادغام/جداسازی', count: mergeEvents.length, visible: canViewAudit || canSplit }
  ];

  return (
    <div className="max-w-4xl space-y-6" dir="rtl">
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-3">
        <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Inbox className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-white">کارتابل مدیر داده — ادغام و تعارض ورود اطلاعات</h2>
          <p className="text-xs text-slate-400 mt-0.5">تصمیم نهایی ادغام/جداسازی پروفایل مشتری فقط اینجا انجام می‌شود.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800">
        {tabs.filter((t) => t.visible).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px cursor-pointer transition ${tab === t.id ? 'border-indigo-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            {t.label} {t.count > 0 && <span className="mr-1 px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === 'merge_queue' && canReviewMerge && (
        <div className="space-y-3">
          {pendingMergeRequests.length === 0 ? (
            <p className="text-[11px] text-slate-500 p-8 text-center border border-dashed border-slate-800 rounded-2xl">صف ادغام خالی است.</p>
          ) : pendingMergeRequests.map((r) => (
            <div key={r.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-white">{r.requestNumber}</span>
                <span className="text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /><span className="font-mono" dir="ltr">{r.requestedAt}</span> — درخواست‌دهنده: {r.requesterName}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {r.profileIds.map((pid) => {
                  const c = customers.find((x) => x.id === pid);
                  return (
                    <div key={pid} className={`p-3 rounded-xl border text-[11px] space-y-1 ${pid === r.motherProfileId ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-800 bg-slate-950/70'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{c?.fullName || 'بدون نام'}</span>
                        {pid === r.motherProfileId && <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-bold text-[10px]">پروفایل مادر</span>}
                      </div>
                      <div className="text-slate-400 font-mono" dir="ltr">{c?.phone1}{c?.phone2 ? ` / ${c.phone2}` : ''}</div>
                      {c?.address && <div className="text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{[c.province, c.city, c.address].filter(Boolean).join('، ')}</div>}
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-slate-400"><strong className="text-slate-300">دلیل:</strong> {r.motherProfileReason}</div>
              <div className="text-[10px] text-slate-500">امتیاز تطبیق: {r.overallScore}٪ — {r.matchType === 'exact_phone_similarity' ? 'شمارهٔ مشترک' : r.matchType === 'name_address_similarity' ? 'شباهت نام/آدرس' : 'علامت‌گذاری دستی'}</div>
              {canDecideMerge && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleApproveMerge(r.id)} className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
                      <CheckCircle2 className="w-3.5 h-3.5" /> تأیید و اجرای ادغام
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={rejectDraftByRequestId[r.id] || ''}
                      onChange={(e) => setRejectDraftByRequestId((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder="دلیل رد..."
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-rose-500"
                    />
                    <button onClick={() => handleRejectMerge(r.id)} className="px-3.5 py-2 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition">
                      <XCircle className="w-3.5 h-3.5" /> رد درخواست
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'conflict_queue' && canReviewConflict && (
        <div className="space-y-3">
          {pendingConflicts.length === 0 ? (
            <p className="text-[11px] text-slate-500 p-8 text-center border border-dashed border-slate-800 rounded-2xl">صف تعارض ورود اطلاعات خالی است.</p>
          ) : pendingConflicts.map((conf) => (
            <div key={conf.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-300">ثبت‌شده توسط {conf.submittedByUserName}</span>
                <span className="text-slate-500 font-mono flex items-center gap-1" dir="ltr"><Clock className="w-3 h-3" />{conf.submittedAt}</span>
              </div>
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-[11px] space-y-1">
                {conf.incomingPhone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-500" /><span className="font-mono" dir="ltr">{conf.incomingPhone}</span></div>}
                {conf.incomingName && <div>{conf.incomingName}</div>}
                {conf.incomingAddress && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-slate-500" />{conf.incomingAddress}</div>}
                <div className="text-amber-400 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" />{conf.reason}</div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-500">پروفایل‌های متعارض:</p>
                {conf.conflictingCustomerIds.map((cid) => (
                  <div key={cid} className="flex items-center justify-between gap-2 p-2 bg-slate-950/50 rounded-lg text-[11px]">
                    <span className="text-slate-300">{customerLabel(cid)}</span>
                    <button onClick={() => handleAttachConflictTo(conf, cid)} className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold cursor-pointer">اتصال به این پروفایل</button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                <button onClick={() => handleCreateProfileFromConflict(conf)} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl cursor-pointer">ایجاد پروفایل مستقل جدید</button>
                <input
                  value={conflictNoteById[conf.id] || ''}
                  onChange={(e) => setConflictNoteById((prev) => ({ ...prev, [conf.id]: e.target.value }))}
                  placeholder="دلیل رد این ورودی..."
                  className="flex-1 min-w-[160px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-rose-500"
                />
                <button onClick={() => handleDismissConflict(conf)} className="px-3 py-2 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-[11px] font-bold rounded-xl cursor-pointer transition">رد ورودی</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (canViewAudit || canSplit) && (
        <div className="space-y-3">
          {mergeEvents.length === 0 ? (
            <p className="text-[11px] text-slate-500 p-8 text-center border border-dashed border-slate-800 rounded-2xl">هنوز ادغامی اجرا نشده است.</p>
          ) : [...mergeEvents].reverse().map((event) => {
            const split = splitOf(event.id);
            const preview = splitOpenEventId === event.id ? previewSplit(event, customers) : null;
            return (
              <div key={event.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex items-center gap-1.5 font-bold text-white"><GitMerge className="w-3.5 h-3.5 text-indigo-400" />ادغام {customerLabel(event.motherProfileId)} ← {event.mergedProfileIds.map(customerLabel).join('، ')}</span>
                  <span className="text-slate-500 font-mono flex items-center gap-1" dir="ltr"><Clock className="w-3 h-3" />{event.executedAt}</span>
                </div>
                <div className="text-[10px] text-slate-500">اجراکننده: {event.executedByUserName} — دلیل پروفایل مادر: {event.motherProfileReason}</div>
                {split ? (
                  <div className="text-[10px] text-amber-400 flex items-center gap-1.5"><History className="w-3 h-3" />این ادغام قبلاً در {split.decidedAt} توسط {split.decidedByUserName} جداسازی شده است.</div>
                ) : canSplit ? (
                  splitOpenEventId === event.id ? (
                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2.5">
                      {preview && preview.ok && preview.data.hasDrift && (
                        <div className="p-2 bg-rose-950/40 border border-rose-500/30 rounded-lg text-[10px] text-rose-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" /> هشدار: مقدار برخی موارد منتقل‌شده پس از ادغام روی پروفایل مادر تغییر کرده است (Drift).
                        </div>
                      )}
                      {preview && preview.ok && (() => {
                        const needsDest = [
                          ...preview.data.needsDestinationEntryIds.phoneEntryIds,
                          ...preview.data.needsDestinationEntryIds.nameEntryIds,
                          ...preview.data.needsDestinationEntryIds.addressEntryIds
                        ];
                        if (needsDest.length === 0) return null;
                        const destOptions = [event.motherProfileId, ...event.mergedProfileIds];
                        return (
                          <div className="space-y-1.5">
                            <p className="text-[10px] text-amber-400">برای {needsDest.length} مورد ثبت‌شده پس از ادغام، مقصد را مشخص کنید:</p>
                            {needsDest.map((entryId) => (
                              <div key={entryId} className="flex items-center gap-2 text-[10px]">
                                <span className="text-slate-400 font-mono flex-1 truncate" dir="ltr">{entryId}</span>
                                <select
                                  value={splitDestinations[entryId] || ''}
                                  onChange={(e) => setSplitDestinations((prev) => ({ ...prev, [entryId]: e.target.value }))}
                                  className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[10px] text-white"
                                >
                                  <option value="">— انتخاب مقصد —</option>
                                  {destOptions.map((did) => <option key={did} value={did}>{customerLabel(did)}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      <textarea
                        value={splitReason}
                        onChange={(e) => setSplitReason(e.target.value)}
                        placeholder="دلیل جداسازی این ادغام را بنویسید..."
                        rows={2}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-rose-500"
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleExecuteSplit(event)} className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
                          <GitBranch className="w-3.5 h-3.5" /> اجرای جداسازی
                        </button>
                        <button onClick={() => setSplitOpenEventId(null)} className="px-3.5 py-2 bg-slate-800 text-slate-300 text-[11px] font-bold rounded-xl cursor-pointer">انصراف</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => openSplitPanel(event)} className="px-3 py-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-[10px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition">
                      <GitBranch className="w-3.5 h-3.5" /> پیش‌نمایش و اجرای جداسازی
                    </button>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
