import React, { useState } from 'react';
import {
  Customer, User, SystemRole, SystemPermission, CustomerMergeRequest, CustomerSplitEvent, CustomerEntryConflict, ClaimedPurchase,
  CustomerIdentityStatus, CustomerFinancialStatus, CustomerContactStatus,
  CustomerContactPermissionStatus, CustomerComplaintStatus, CustomerSatisfactionStatus
} from '../types';
import { getCustomerSalesOperationStatus } from '../utils/salesHierarchy';
import { getJalaliNow } from '../utils/persianDate';
import {
  decideSelectPrimaryValue, decideUpdateContactStatus, buildCustomerTimeline,
  PrimaryValueEntryType, CustomerTimelineEntry
} from '../utils/customerIdentity';
import { hasPermission } from '../utils/permissions';
import { logAudit } from '../utils/auditLog';
import { storage } from '../utils/storage';
import {
  Phone, MapPin, User as UserIcon, History, ShieldCheck, ShieldAlert, Heart,
  PhoneOff, AlertTriangle, GitMerge, CheckCircle2, PlayCircle, Clock, Link2, Star,
  PhoneCall, PhoneMissed, PhoneForwarded, Receipt, GitBranch, UserPlus, PlusCircle, Ban
} from 'lucide-react';

interface CustomerProfileDetailProps {
  customer: Customer;
  customers: Customer[];
  users: User[];
  roles: SystemRole[];
  currentUser: User;
  effectivePermissions: SystemPermission[] | null; // null یعنی ادمین (بدون محدودیت)
  impersonatorAdmin?: User | null;
  onUpdateCustomers: (customers: Customer[]) => void;
  mergeRequests: CustomerMergeRequest[];
  splitEvents: CustomerSplitEvent[];
  entryConflicts: CustomerEntryConflict[];
  claimedPurchases: ClaimedPurchase[];
  onNavigateToCustomer?: (customerId: string) => void; // برای دنبال‌کردن زنجیرهٔ mergedIntoCustomerId
  onViewMergeCandidates?: (customerId: string) => void;
}

function hasPerm(effectivePermissions: SystemPermission[] | null, p: SystemPermission): boolean {
  return effectivePermissions === null || effectivePermissions.includes(p);
}

const badgeClass = (tone: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate') => {
  const map: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    slate: 'bg-slate-800 text-slate-400 border-slate-700'
  };
  return `px-2.5 py-1 rounded-full text-[10px] font-bold border ${map[tone]}`;
};

const IDENTITY_LABELS: Record<CustomerIdentityStatus, { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate' }> = {
  complete: { label: 'هویت کامل', tone: 'emerald' },
  incomplete: { label: 'هویت ناقص', tone: 'amber' },
  pending_merge_review: { label: 'در انتظار بررسی ادغام', tone: 'indigo' },
  has_conflict: { label: 'دارای تعارض هویتی', tone: 'rose' }
};
const FINANCIAL_LABELS: Record<CustomerFinancialStatus, { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate' }> = {
  reconciled: { label: 'مالی مطابقت‌یافته', tone: 'emerald' },
  has_discrepancy: { label: 'دارای مغایرت مالی', tone: 'rose' },
  under_review: { label: 'مالی در حال بررسی', tone: 'amber' }
};
const CONTACT_LABELS: Record<CustomerContactStatus, { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate' }> = {
  confirmed: { label: 'آخرین تماس تأییدشده', tone: 'emerald' },
  no_answer: { label: 'آخرین تماس بدون پاسخ', tone: 'amber' },
  needs_recall: { label: 'نیاز به تماس مجدد', tone: 'indigo' }
};
const SALES_OP_LABELS: Record<string, { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate' }> = {
  free: { label: 'آزاد', tone: 'emerald' },
  active_cycle: { label: 'چرخهٔ فروش فعال', tone: 'indigo' },
  pending_action: { label: 'بدون اقدام', tone: 'amber' },
  overdue_no_action: { label: 'معوق بدون اقدام', tone: 'rose' },
  completed: { label: 'چرخهٔ فروش تکمیل‌شده', tone: 'slate' }
};
const CONTACT_PERMISSION_LABELS: Record<CustomerContactPermissionStatus, { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate' }> = {
  allowed: { label: 'مجاز به تماس', tone: 'emerald' },
  temporarily_blocked: { label: 'موقتاً محدود', tone: 'amber' },
  do_not_contact: { label: 'ممنوع از تماس', tone: 'rose' }
};
const COMPLAINT_LABELS: Record<CustomerComplaintStatus, { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate' }> = {
  none: { label: 'بدون شکایت', tone: 'emerald' },
  active: { label: 'شکایت فعال', tone: 'rose' },
  cooldown: { label: 'دورهٔ انتظار پس از شکایت', tone: 'amber' },
  released: { label: 'شکایت آزادشده', tone: 'indigo' }
};
const SATISFACTION_LABELS: Record<CustomerSatisfactionStatus, { label: string; tone: 'emerald' | 'indigo' | 'amber' | 'rose' | 'slate' }> = {
  unknown: { label: 'رضایت نامشخص', tone: 'slate' },
  dissatisfied: { label: 'ناراضی', tone: 'rose' },
  partially_satisfied: { label: 'نسبتاً راضی', tone: 'amber' },
  fully_satisfied: { label: 'کاملاً راضی', tone: 'emerald' }
};
const VALUE_SOURCE_LABELS: Record<string, string> = {
  sales_entry: 'ثبت فروشنده',
  data_entry_unit: 'واحد ثبت',
  call_monitoring_unit: 'واحد شنود',
  customer_confirmed: 'تأییدشده توسط مشتری',
  data_manager_correction: 'اصلاح مدیر داده',
  legacy_migration: 'مهاجرت از رکورد قدیمی'
};
const TIMELINE_ICONS: Record<CustomerTimelineEntry['type'], React.ReactNode> = {
  profile_created: <UserPlus className="w-3.5 h-3.5 text-indigo-400" />,
  value_added: <PlusCircle className="w-3.5 h-3.5 text-slate-400" />,
  status_changed: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  sale_cycle: <PlayCircle className="w-3.5 h-3.5 text-indigo-400" />,
  conflict_created: <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />,
  conflict_resolved: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  merge_requested: <GitMerge className="w-3.5 h-3.5 text-indigo-400" />,
  merge_decided: <GitMerge className="w-3.5 h-3.5 text-emerald-400" />,
  split_executed: <GitBranch className="w-3.5 h-3.5 text-rose-400" />,
  claim_submitted: <Receipt className="w-3.5 h-3.5 text-indigo-400" />,
  claim_data_reviewed: <Receipt className="w-3.5 h-3.5 text-amber-400" />,
  claim_financial_reviewed: <Receipt className="w-3.5 h-3.5 text-emerald-400" />
};

export const CustomerProfileDetail: React.FC<CustomerProfileDetailProps> = ({
  customer, customers, users, roles, currentUser, effectivePermissions, impersonatorAdmin = null, onUpdateCustomers,
  mergeRequests, splitEvents, entryConflicts, claimedPurchases, onNavigateToCustomer, onViewMergeCandidates
}) => {
  const [primaryChangeDraft, setPrimaryChangeDraft] = useState<{ type: PrimaryValueEntryType; entryId: string } | null>(null);
  const [primaryChangeReason, setPrimaryChangeReason] = useState('');
  const [contactStatusReason, setContactStatusReason] = useState('');

  const userNameById = (id: string) => users.find((u) => u.id === id)?.fullName || id;

  const canSeeContact = hasPerm(effectivePermissions, 'view_customer_contact_fields');
  const canSeeAddress = hasPerm(effectivePermissions, 'view_customer_address');
  const canSeeComplaint = hasPerm(effectivePermissions, 'view_customer_complaint_summary');
  const canSeeFinancial = hasPerm(effectivePermissions, 'view_customer_purchase_history') || effectivePermissions === null;
  const canSelectPrimary = hasPerm(effectivePermissions, 'select_customer_primary_value');
  const canUpdateContactStatus = hasPerm(effectivePermissions, 'update_customer_contact_status');

  const salesOpStatus = getCustomerSalesOperationStatus(customer);

  const phoneEntries = customer.phoneEntries?.length
    ? customer.phoneEntries
    : (customer.phone1 ? [{ id: 'legacy_phone1', value: customer.phone1, normalizedValue: customer.phone1, source: 'legacy_migration' as const, recordedAt: customer.createdAt, recordedByUserId: '', recordedByName: '—', isCustomerConfirmed: false, isCurrentPrimary: true }] : []);
  const nameEntries = customer.nameEntries?.length
    ? customer.nameEntries
    : (customer.fullName ? [{ id: 'legacy_name', value: customer.fullName, normalizedValue: customer.fullName, source: 'legacy_migration' as const, recordedAt: customer.createdAt, recordedByUserId: '', recordedByName: '—', isCustomerConfirmed: false, isCurrentPrimary: true }] : []);
  const addressEntries = customer.addressEntries?.length
    ? customer.addressEntries
    : (customer.address ? [{ id: 'legacy_address', address: customer.address, province: customer.province, city: customer.city, postalCode: customer.postalCode, normalizedValue: customer.address, source: 'legacy_migration' as const, recordedAt: customer.createdAt, recordedByUserId: '', recordedByName: '—', isCustomerConfirmed: false, isCurrentPrimary: true }] : []);

  const timelineItems = buildCustomerTimeline(
    customer,
    { mergeRequests, splitEvents, entryConflicts, claimedPurchases },
    effectivePermissions,
    userNameById
  );

  // الگوی Handler صحیح: ۱) Permission+وضعیت جاری (داخل decide*) ۲) محاسبهٔ خالص ۳) Transaction
  // ۴) فقط در موفقیت Audit موفقیت، وگرنه Audit شکست با متن واقعی — هیچ Audit موفقیتی برای
  // عملیات Rollback‌شده باقی نمی‌ماند.
  const handleConfirmPrimaryChange = () => {
    if (!primaryChangeDraft) return;
    const latest = customers.find((c) => c.id === customer.id) || customer;
    const outcome = decideSelectPrimaryValue(
      latest, primaryChangeDraft.type, primaryChangeDraft.entryId, primaryChangeReason,
      effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, getJalaliNow()
    );
    if (outcome.ok === false) {
      logAudit({
        action: 'customer_primary_value_change', effectiveUser: currentUser, impersonatorAdmin, roles,
        permissionUsed: 'select_customer_primary_value', targetId: customer.id,
        details: `شکست: ${outcome.errorCode} — ${outcome.message}`
      });
      alert(outcome.message);
      return;
    }
    const updatedCustomers = customers.map((c) => (c.id === latest.id ? outcome.data.updatedCustomer : c));
    const tx = storage.saveCustomerIdentityTransaction({ customers: updatedCustomers });
    if (tx.ok === false) {
      logAudit({
        action: 'customer_primary_value_change', effectiveUser: currentUser, impersonatorAdmin, roles,
        permissionUsed: 'select_customer_primary_value', targetId: customer.id,
        details: `شکست ذخیره‌سازی تراکنشی: ${tx.error}`
      });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({
      action: 'customer_primary_value_change', effectiveUser: currentUser, impersonatorAdmin, roles,
      permissionUsed: 'select_customer_primary_value', targetId: customer.id,
      details: `موفق (${primaryChangeDraft.type}): ${outcome.data.statusChangeEvent.oldValue || '—'} ← ${outcome.data.statusChangeEvent.newValue}`
    });
    onUpdateCustomers(updatedCustomers);
    setPrimaryChangeDraft(null);
    setPrimaryChangeReason('');
  };

  const handleConfirmContactStatus = (newStatus: CustomerContactStatus) => {
    const latest = customers.find((c) => c.id === customer.id) || customer;
    const outcome = decideUpdateContactStatus(
      latest, newStatus, contactStatusReason,
      effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, getJalaliNow()
    );
    if (outcome.ok === false) {
      logAudit({
        action: 'customer_contact_status_update', effectiveUser: currentUser, impersonatorAdmin, roles,
        permissionUsed: 'update_customer_contact_status', targetId: customer.id,
        details: `شکست: ${outcome.errorCode} — ${outcome.message}`
      });
      alert(outcome.message);
      return;
    }
    const updatedCustomers = customers.map((c) => (c.id === latest.id ? outcome.data.updatedCustomer : c));
    const tx = storage.saveCustomerIdentityTransaction({ customers: updatedCustomers });
    if (tx.ok === false) {
      logAudit({
        action: 'customer_contact_status_update', effectiveUser: currentUser, impersonatorAdmin, roles,
        permissionUsed: 'update_customer_contact_status', targetId: customer.id,
        details: `شکست ذخیره‌سازی تراکنشی: ${tx.error}`
      });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({
      action: 'customer_contact_status_update', effectiveUser: currentUser, impersonatorAdmin, roles,
      permissionUsed: 'update_customer_contact_status', targetId: customer.id,
      details: `موفق: ${outcome.data.statusChangeEvent.oldValue || '—'} ← ${outcome.data.statusChangeEvent.newValue}`
    });
    onUpdateCustomers(updatedCustomers);
    setContactStatusReason('');
  };

  const renderPrimaryPicker = (type: PrimaryValueEntryType, entryId: string) => {
    if (!canSelectPrimary) return null;
    const isOpen = primaryChangeDraft?.type === type && primaryChangeDraft?.entryId === entryId;
    if (!isOpen) {
      return (
        <button
          onClick={() => { setPrimaryChangeDraft({ type, entryId }); setPrimaryChangeReason(''); }}
          className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
        >
          <Star className="w-3 h-3" /> تعیین به‌عنوان مقدار اصلی
        </button>
      );
    }
    return (
      <div className="w-full mt-1.5 p-2.5 bg-slate-900 border border-indigo-500/40 rounded-lg space-y-1.5">
        <input
          value={primaryChangeReason}
          onChange={(e) => setPrimaryChangeReason(e.target.value)}
          placeholder="دلیل انتخاب این مقدار به‌عنوان مقدار اصلی..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-indigo-500"
        />
        <div className="flex items-center gap-2">
          <button onClick={handleConfirmPrimaryChange} className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg cursor-pointer">تأیید</button>
          <button onClick={() => { setPrimaryChangeDraft(null); setPrimaryChangeReason(''); }} className="px-2.5 py-1 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-lg cursor-pointer">انصراف</button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-5" dir="rtl">
      {customer.isAbsorbed && (
        <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-center gap-2">
          <GitMerge className="w-4 h-4 shrink-0" />
          <span>این پروفایل در یک پروفایل دیگر ادغام (جذب) شده است.</span>
          {customer.mergedIntoCustomerId && onNavigateToCustomer && (
            <button
              onClick={() => onNavigateToCustomer(customer.mergedIntoCustomerId!)}
              className="mr-auto px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              مشاهدهٔ پروفایل مادر
            </button>
          )}
        </div>
      )}

      {/* هفت بُعد مستقل وضعیت — هرگز ادغام/کاهش داده نمی‌شوند */}
      <div className="flex flex-wrap gap-1.5">
        <span className={badgeClass(IDENTITY_LABELS[customer.identityStatus || 'incomplete'].tone)}>
          {IDENTITY_LABELS[customer.identityStatus || 'incomplete'].label}
        </span>
        {canSeeFinancial && (
          <span className={badgeClass(FINANCIAL_LABELS[customer.financialStatus || 'reconciled'].tone)}>
            {FINANCIAL_LABELS[customer.financialStatus || 'reconciled'].label}
          </span>
        )}
        <span className={badgeClass(CONTACT_LABELS[customer.contactStatus || 'needs_recall'].tone)}>
          {CONTACT_LABELS[customer.contactStatus || 'needs_recall'].label}
        </span>
        <span className={badgeClass(SALES_OP_LABELS[salesOpStatus].tone)}>
          {SALES_OP_LABELS[salesOpStatus].label}
        </span>
        <span className={badgeClass(CONTACT_PERMISSION_LABELS[customer.contactPermissionStatus || 'allowed'].tone)}>
          {CONTACT_PERMISSION_LABELS[customer.contactPermissionStatus || 'allowed'].label}
        </span>
        {canSeeComplaint && (
          <span className={badgeClass(COMPLAINT_LABELS[customer.complaintStatus || 'none'].tone)}>
            {COMPLAINT_LABELS[customer.complaintStatus || 'none'].label}
          </span>
        )}
        <span className={badgeClass(SATISFACTION_LABELS[customer.satisfactionStatus || 'unknown'].tone)}>
          {SATISFACTION_LABELS[customer.satisfactionStatus || 'unknown'].label}
        </span>
      </div>

      {/* ثبت نتیجهٔ تماس — فقط واحد شنود/ادمین؛ فقط contactStatus را تغییر می‌دهد */}
      {canUpdateContactStatus && !customer.isAbsorbed && (
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
          <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5"><PhoneCall className="w-3.5 h-3.5 text-slate-500" />ثبت نتیجهٔ تماس</div>
          <input
            value={contactStatusReason}
            onChange={(e) => setContactStatusReason(e.target.value)}
            placeholder="توضیح یا دلیل نتیجهٔ تماس..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[11px] text-white focus:outline-none focus:border-indigo-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => handleConfirmContactStatus('confirmed')} className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer"><PhoneCall className="w-3 h-3" />تماس تأییدشده</button>
            <button onClick={() => handleConfirmContactStatus('no_answer')} className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer"><PhoneMissed className="w-3 h-3" />بدون پاسخ</button>
            <button onClick={() => handleConfirmContactStatus('needs_recall')} className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer"><PhoneForwarded className="w-3 h-3" />نیاز به تماس مجدد</button>
          </div>
          <p className="text-[10px] text-slate-500 flex items-center gap-1"><Ban className="w-3 h-3" />واحد شنود فقط نتیجهٔ همین تماس را ثبت می‌کند — تغییر مجوز تماس، شکایت، وضعیت مالی یا مقدار اصلی از این بخش ممکن نیست.</p>
        </div>
      )}

      {/* نام‌ها */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
          <UserIcon className="w-3.5 h-3.5 text-slate-500" />
          نام‌های ثبت‌شده ({nameEntries.length})
        </div>
        {nameEntries.length === 0 ? (
          <p className="text-[11px] text-slate-500">نامی ثبت نشده است.</p>
        ) : nameEntries.map((e) => (
          <div key={e.id} className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-bold text-white">{e.value}</span>
            {e.isCurrentPrimary && <span className={badgeClass('indigo')}>اصلی</span>}
            {e.isCustomerConfirmed && <span className={badgeClass('emerald')}>تأییدشده توسط مشتری</span>}
            <span className="text-slate-500 mr-auto">{VALUE_SOURCE_LABELS[e.source] || e.source} · {e.recordedByName} · <span className="font-mono" dir="ltr">{e.recordedAt}</span></span>
            {!e.isCurrentPrimary && renderPrimaryPicker('name', e.id)}
          </div>
        ))}
      </div>

      {/* تلفن‌ها */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-slate-500" />
          شماره‌های تماس ({phoneEntries.length})
        </div>
        {!canSeeContact ? (
          <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><PhoneOff className="w-3.5 h-3.5" /> نمایش کامل شماره تماس نیازمند مجوز است — این فیلد پنهان شده است.</p>
        ) : phoneEntries.length === 0 ? (
          <p className="text-[11px] text-slate-500">شماره‌ای ثبت نشده است.</p>
        ) : phoneEntries.map((e) => (
          <div key={e.id} className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-bold text-white font-mono" dir="ltr">{e.value}</span>
            {e.isCurrentPrimary && <span className={badgeClass('indigo')}>اصلی</span>}
            {e.isCustomerConfirmed && <span className={badgeClass('emerald')}>تأییدشده توسط مشتری</span>}
            <span className="text-slate-500 mr-auto">{VALUE_SOURCE_LABELS[e.source] || e.source} · {e.recordedByName} · <span className="font-mono" dir="ltr">{e.recordedAt}</span></span>
            {!e.isCurrentPrimary && renderPrimaryPicker('phone', e.id)}
          </div>
        ))}
      </div>

      {/* آدرس‌ها */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-slate-500" />
          آدرس‌های ثبت‌شده ({addressEntries.length})
        </div>
        {!canSeeAddress ? (
          <p className="text-[11px] text-slate-500">نمایش آدرس نیازمند مجوز است — این فیلد پنهان شده است.</p>
        ) : addressEntries.length === 0 ? (
          <p className="text-[11px] text-slate-500">آدرسی ثبت نشده است.</p>
        ) : addressEntries.map((e) => (
          <div key={e.id} className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-200">{[e.province, e.city, e.address, e.postalCode].filter(Boolean).join('، ')}</span>
              {e.isCurrentPrimary && <span className={badgeClass('indigo')}>اصلی</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">{VALUE_SOURCE_LABELS[e.source] || e.source} · {e.recordedByName} · <span className="font-mono" dir="ltr">{e.recordedAt}</span></span>
              {!e.isCurrentPrimary && renderPrimaryPicker('address', e.id)}
            </div>
          </div>
        ))}
      </div>

      {onViewMergeCandidates && hasPerm(effectivePermissions, 'view_customer_merge_candidates') && !customer.isAbsorbed && (
        <button
          onClick={() => onViewMergeCandidates(customer.id)}
          className="px-4 py-2 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition"
        >
          <GitMerge className="w-4 h-4" />
          بررسی پروفایل‌های مشابه / درخواست ادغام
        </button>
      )}

      {/* Timeline یکپارچه */}
      <div className="space-y-1.5 pt-2 border-t border-slate-800">
        <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-slate-500" />
          Timeline یکپارچه
        </div>
        {timelineItems.length === 0 ? (
          <p className="text-[11px] text-slate-500">هنوز رویدادی ثبت نشده است.</p>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {timelineItems.map((item, idx) => (
              <div key={idx} className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg flex items-start gap-2 text-[11px]">
                <span className="mt-0.5 shrink-0">{TIMELINE_ICONS[item.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-slate-200">{item.title}</div>
                  {item.detail && <div className="text-slate-500 mt-0.5">{item.detail}</div>}
                </div>
                <span className="text-slate-500 font-mono shrink-0 flex items-center gap-1" dir="ltr"><Clock className="w-3 h-3" />{item.timestamp}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 pt-1">
        {customer.identityStatus === 'has_conflict' ? <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
        <span>نسخهٔ رکورد: {customer.version || 1} — آخرین به‌روزرسانی: <span className="font-mono" dir="ltr">{customer.updatedAt || customer.createdAt}</span></span>
        {customer.satisfactionStatus === 'fully_satisfied' && <Heart className="w-3.5 h-3.5 text-rose-400 mr-1" />}
      </div>
    </div>
  );
};
