import React, { useState } from 'react';
import { Customer, User, SystemRole, SystemPermission, ClaimedPurchase, AttachmentFile } from '../types';
import { getJalaliNow } from '../utils/persianDate';
import {
  normalizePhone, normalizeName, toPurchaseClaimFinancialView,
  decideReviewPurchaseClaimData, decideReviewPurchaseClaimFinancial
} from '../utils/customerIdentity';
import { hasPermission } from '../utils/permissions';
import { logAudit } from '../utils/auditLog';
import { storage } from '../utils/storage';
import { Receipt, Search, CheckCircle2, XCircle, ArrowLeftCircle, ShieldAlert, Clock, Ban, Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';

interface PurchaseClaimReviewViewProps {
  claims: ClaimedPurchase[];
  onUpdateClaims: (claims: ClaimedPurchase[]) => void;
  customers: Customer[];
  users: User[];
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin?: User | null;
}

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pending_data_review: { label: 'در انتظار بررسی داده', tone: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  pending_financial_review: { label: 'در انتظار بررسی مالی', tone: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
  confirmed: { label: 'تأییدشده', tone: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  rejected: { label: 'رد شده', tone: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  unverified_closed: { label: 'بسته‌شده — تأییدنشده', tone: 'bg-slate-800 text-slate-400 border-slate-700' }
};

const emptyClaimForm = { customerQuery: '', claimedAmount: '', claimedDescription: '', approximateDate: '', phoneNumberAtPurchase: '', possibleInvoiceNumber: '' };

// Prototype مبتنی بر LocalStorage است — محدودیت حجم به‌صراحت اعمال و نمایش داده می‌شود.
const MAX_EVIDENCE_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ACCEPTED_EVIDENCE_TYPES = ['image/', 'application/pdf'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const PurchaseClaimReviewView: React.FC<PurchaseClaimReviewViewProps> = ({
  claims, onUpdateClaims, customers, currentUser, roles, effectivePermissions, impersonatorAdmin = null
}) => {
  const [form, setForm] = useState(emptyClaimForm);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [pendingEvidence, setPendingEvidence] = useState<AttachmentFile[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [dataNoteById, setDataNoteById] = useState<Record<string, string>>({});
  const [financialAmountById, setFinancialAmountById] = useState<Record<string, string>>({});
  const [financialNoteById, setFinancialNoteById] = useState<Record<string, string>>({});

  if (!currentUser) return null;

  const canSubmit = hasPermission(effectivePermissions, ['submit_customer_purchase_claim']);
  const canReviewData = hasPermission(effectivePermissions, ['review_customer_purchase_claim_data']);
  const canReviewFinancial = hasPermission(effectivePermissions, ['review_customer_purchase_claim_financial']);

  if (!canSubmit && !canReviewData && !canReviewFinancial) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400 flex items-center gap-2" dir="rtl">
        <ShieldAlert className="w-4 h-4 text-rose-400" />
        شما مجوز دسترسی به ادعای خرید مشتری را ندارید.
      </div>
    );
  }

  const customerById = (id: string) => customers.find((c) => c.id === id);

  const searchResults = (() => {
    const q = normalizeName(form.customerQuery.trim());
    const qPhone = normalizePhone(form.customerQuery.trim());
    if (!q && !qPhone) return [];
    return customers
      .filter((c) => !c.isAbsorbed)
      .filter((c) => {
        const names = [c.fullName, ...(c.nameEntries || []).map((e) => e.value)].filter(Boolean).map((n) => normalizeName(n as string));
        const phones = [c.phone1, c.phone2, ...(c.phoneEntries || []).map((e) => e.value)].filter(Boolean).map((p) => normalizePhone(p as string));
        return (q && names.some((n) => n.includes(q))) || (qPhone && phones.some((p) => p.includes(qPhone)));
      })
      .slice(0, 10);
  })();

  // بدون اجرا — فقط FileReader/DataURL؛ نوع فایل به تصویر/PDF محدود می‌شود، حجم به ۲ مگابایت
  const handleEvidenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setEvidenceError(null);
    Array.from(files).forEach((file: File) => {
      const isAcceptedType = ACCEPTED_EVIDENCE_TYPES.some((t) => file.type.startsWith(t));
      if (!isAcceptedType) {
        setEvidenceError(`نوع فایل «${file.name}» مجاز نیست — فقط تصویر یا PDF پذیرفته می‌شود.`);
        return;
      }
      if (file.size > MAX_EVIDENCE_FILE_SIZE_BYTES) {
        setEvidenceError(`حجم فایل «${file.name}» بیش از حد مجاز (۲ مگابایت) است.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileUrl = event.target?.result as string;
        const newAtt: AttachmentFile = {
          id: `evidence_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name, url: fileUrl, type: file.type, size: file.size, uploadedAt: getJalaliNow()
        };
        setPendingEvidence((prev) => [...prev, newAtt]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeEvidence = (id: string) => setPendingEvidence((prev) => prev.filter((f) => f.id !== id));

  const handleSubmitClaim = () => {
    if (!selectedCustomerId) { alert('ابتدا مشتری مرتبط با این ادعا را انتخاب کنید.'); return; }
    const amount = Number(form.claimedAmount);
    if (!amount || amount <= 0) { alert('مبلغ ادعاشده باید عددی معتبر و بزرگ‌تر از صفر باشد.'); return; }
    const now = getJalaliNow();
    const claim: ClaimedPurchase = {
      id: `claim_${Date.now()}`,
      customerId: selectedCustomerId,
      claimedAmount: amount,
      claimedDescription: form.claimedDescription.trim() || undefined,
      approximateDate: form.approximateDate.trim() || undefined,
      phoneNumberAtPurchase: form.phoneNumberAtPurchase.trim() || undefined,
      possibleInvoiceNumber: form.possibleInvoiceNumber.trim() || undefined,
      evidenceAttachments: pendingEvidence.length > 0 ? pendingEvidence : undefined,
      submittedByUserId: currentUser.id,
      submittedByUserName: currentUser.fullName,
      submittedAt: now,
      status: 'pending_data_review'
    };
    const updatedClaims = [claim, ...claims];
    const tx = storage.saveCustomerIdentityTransaction({ claimedPurchases: updatedClaims });
    if (tx.ok === false) {
      logAudit({ action: 'customer_purchase_claim_submitted', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'submit_customer_purchase_claim', targetId: claim.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({ action: 'customer_purchase_claim_submitted', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'submit_customer_purchase_claim', targetId: claim.id, details: `ادعای خرید به مبلغ ${amount} برای مشتری ${selectedCustomerId} ثبت شد` });
    onUpdateClaims(updatedClaims);
    setForm(emptyClaimForm);
    setSelectedCustomerId(null);
    setPendingEvidence([]);
    setEvidenceError(null);
    alert('ادعای خرید ثبت شد و برای بررسی داده به کارتابل مدیر داده ارسال شد. این مبلغ تا تأیید نهایی مرحلهٔ مالی در هیچ اعتبار/گزارشی محاسبه نمی‌شود.');
  };

  // الگوی صحیح Handler: ۱) decide* هم Permission و هم وضعیت جاری را کنترل می‌کند ۲) فقط در
  // موفقیت Transaction اجرا می‌شود ۳) Audit فقط بعد از دانستن نتیجهٔ واقعی Transaction ثبت می‌شود.
  const handleDataDecision = (claim: ClaimedPurchase, decision: 'refer_to_financial' | 'reject', note?: string) => {
    const latest = claims.find((c) => c.id === claim.id) || claim;
    const outcome = decideReviewPurchaseClaimData(latest, decision, note, effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, getJalaliNow());
    if (outcome.ok === false) {
      logAudit({ action: 'customer_purchase_claim_data_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_purchase_claim_data', targetId: claim.id, details: `شکست: ${outcome.errorCode} — ${outcome.message}` });
      alert(outcome.message);
      return;
    }
    const updatedClaims = claims.map((c) => (c.id === latest.id ? outcome.data.updatedClaim : c));
    const tx = storage.saveCustomerIdentityTransaction({ claimedPurchases: updatedClaims });
    if (tx.ok === false) {
      logAudit({ action: 'customer_purchase_claim_data_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_purchase_claim_data', targetId: claim.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    logAudit({
      action: 'customer_purchase_claim_data_decision', effectiveUser: currentUser, impersonatorAdmin, roles,
      permissionUsed: 'review_customer_purchase_claim_data', targetId: claim.id,
      details: decision === 'reject' ? `رد در مرحلهٔ داده: ${note}` : 'ارجاع به مرحلهٔ بررسی مالی'
    });
    onUpdateClaims(updatedClaims);
    setDataNoteById((prev) => ({ ...prev, [claim.id]: '' }));
  };

  const handleFinancialDecision = (claim: ClaimedPurchase, decision: 'confirm' | 'reject' | 'close_unverified', confirmedAmount?: number, note?: string) => {
    const latest = claims.find((c) => c.id === claim.id) || claim;
    const outcome = decideReviewPurchaseClaimFinancial(latest, decision, confirmedAmount, note, effectivePermissions, { id: currentUser.id, fullName: currentUser.fullName }, getJalaliNow());
    if (outcome.ok === false) {
      logAudit({ action: 'customer_purchase_claim_financial_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_purchase_claim_financial', targetId: claim.id, details: `شکست: ${outcome.errorCode} — ${outcome.message}` });
      alert(outcome.message);
      return;
    }
    const updatedClaims = claims.map((c) => (c.id === latest.id ? outcome.data.updatedClaim : c));
    const tx = storage.saveCustomerIdentityTransaction({ claimedPurchases: updatedClaims });
    if (tx.ok === false) {
      logAudit({ action: 'customer_purchase_claim_financial_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_purchase_claim_financial', targetId: claim.id, details: `شکست ذخیره‌سازی: ${tx.error}` });
      alert('خطا در ذخیره‌سازی: ' + tx.error);
      return;
    }
    const detailByDecision: Record<string, string> = {
      confirm: `تأیید نهایی مالی — مبلغ ${confirmedAmount}`, reject: `رد در مرحلهٔ مالی: ${note}`, close_unverified: 'بسته‌شدن به‌عنوان تأییدنشده'
    };
    logAudit({ action: 'customer_purchase_claim_financial_decision', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'review_customer_purchase_claim_financial', targetId: claim.id, details: detailByDecision[decision] });
    onUpdateClaims(updatedClaims);
    if (decision === 'reject') setFinancialNoteById((prev) => ({ ...prev, [claim.id]: '' }));
  };

  const handleFinancialCloseUnverified = (claim: ClaimedPurchase) => {
    if (!confirm('این ادعا به‌عنوان «تأییدنشده» بسته شود؟')) return;
    handleFinancialDecision(claim, 'close_unverified');
  };

  const renderEvidenceList = (attachments: AttachmentFile[]) => {
    if (attachments.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {attachments.map((f) => (
          <a
            key={f.id} href={f.url} target="_blank" rel="noreferrer"
            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[10px] text-slate-300 flex items-center gap-1 hover:border-indigo-500/50"
          >
            {f.type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
            {f.name} <span className="text-slate-500">({formatFileSize(f.size)})</span>
          </a>
        ))}
      </div>
    );
  };

  const pendingDataClaims = claims.filter((c) => c.status === 'pending_data_review');
  const pendingFinancialClaims = claims.filter((c) => c.status === 'pending_financial_review');
  const myClaims = claims.filter((c) => c.submittedByUserId === currentUser.id).slice(0, 15);

  return (
    <div className="max-w-3xl space-y-6" dir="rtl">
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-3">
        <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Receipt className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-white">ادعای خرید پیشین مشتری</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            بررسی دومرحله‌ای مستقل — تا تأیید نهایی مرحلهٔ مالی، هیچ مبلغی در اعتبار/گزارش/پروموشن/پورسانت محاسبه نمی‌شود.
          </p>
        </div>
      </div>

      {canSubmit && (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5"><Search className="w-3.5 h-3.5 text-slate-500" />ثبت ادعای خرید جدید</div>
          {!selectedCustomerId ? (
            <>
              <input
                value={form.customerQuery}
                onChange={(e) => setForm((f) => ({ ...f, customerQuery: e.target.value }))}
                placeholder="جستجوی مشتری با نام یا شماره تماس..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <div className="space-y-1.5">
                {searchResults.map((c) => (
                  <button key={c.id} onClick={() => setSelectedCustomerId(c.id)} className="w-full text-right p-2.5 bg-slate-950/70 border border-slate-800 hover:border-indigo-500/50 rounded-xl flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-xs font-bold text-white">{c.fullName || 'بدون نام'}</span>
                    <span className="text-[10px] text-slate-500 font-mono" dir="ltr">{c.phone1}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="p-2.5 bg-indigo-950/30 border border-indigo-500/30 rounded-xl flex items-center justify-between text-[11px]">
                <span className="text-white font-bold">مشتری انتخاب‌شده: {customerById(selectedCustomerId)?.fullName || 'بدون نام'}</span>
                <button onClick={() => setSelectedCustomerId(null)} className="text-indigo-400 cursor-pointer">تغییر</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input value={form.claimedAmount} onChange={(e) => setForm((f) => ({ ...f, claimedAmount: e.target.value }))} placeholder="مبلغ ادعاشده (ریال)" dir="ltr" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500" />
                <input value={form.approximateDate} onChange={(e) => setForm((f) => ({ ...f, approximateDate: e.target.value }))} placeholder="تاریخ تقریبی خرید" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
                <input value={form.phoneNumberAtPurchase} onChange={(e) => setForm((f) => ({ ...f, phoneNumberAtPurchase: e.target.value }))} placeholder="شمارهٔ تماس زمان خرید (اختیاری)" dir="ltr" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500" />
                <input value={form.possibleInvoiceNumber} onChange={(e) => setForm((f) => ({ ...f, possibleInvoiceNumber: e.target.value }))} placeholder="شمارهٔ احتمالی فاکتور (اختیاری)" dir="ltr" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500" />
                <textarea value={form.claimedDescription} onChange={(e) => setForm((f) => ({ ...f, claimedDescription: e.target.value }))} placeholder="توضیح ادعا (اختیاری)" rows={2} className="sm:col-span-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5 text-slate-500" />مدرک ادعا (اختیاری — تصویر یا PDF، حداکثر ۲ مگابایت هر فایل)</label>
                <input type="file" multiple accept="image/*,.pdf" onChange={handleEvidenceUpload} className="hidden" id="evidence-file-input" />
                <label htmlFor="evidence-file-input" className="inline-block px-3 py-2 bg-slate-800 border border-dashed border-slate-700 hover:border-indigo-500 rounded-xl text-[11px] text-slate-300 cursor-pointer">افزودن فایل مدرک...</label>
                {evidenceError && <p className="text-[10px] text-rose-400">{evidenceError}</p>}
                {pendingEvidence.length > 0 && (
                  <div className="space-y-1">
                    {pendingEvidence.map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 p-1.5 bg-slate-950/70 border border-slate-800 rounded-lg text-[10px] text-slate-300">
                        <span className="flex items-center gap-1">{f.type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}{f.name} ({formatFileSize(f.size)})</span>
                        <button onClick={() => removeEvidence(f.id)} className="text-rose-400 hover:text-rose-300 cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={handleSubmitClaim} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
                <Receipt className="w-4 h-4" /> ثبت ادعای خرید
              </button>
            </div>
          )}
        </div>
      )}

      {canReviewData && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-300">مرحلهٔ داده — بررسی هویت/سابقه ({pendingDataClaims.length})</div>
          {pendingDataClaims.length === 0 ? (
            <p className="text-[11px] text-slate-500 p-6 text-center border border-dashed border-slate-800 rounded-2xl">ادعایی در انتظار بررسی داده نیست.</p>
          ) : pendingDataClaims.map((claim) => {
            const c = customerById(claim.customerId);
            return (
              <div key={claim.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-white">{c?.fullName || 'بدون نام'} <span className="text-slate-500 font-mono" dir="ltr">({c?.phone1})</span></span>
                  <span className="text-slate-500">ثبت‌شده توسط {claim.submittedByUserName}</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono" dir="ltr">مبلغ ادعاشده: {claim.claimedAmount.toLocaleString('fa-IR')} ریال</div>
                {claim.possibleInvoiceNumber && <div className="text-[11px] text-slate-400">شمارهٔ احتمالی فاکتور: {claim.possibleInvoiceNumber}</div>}
                {claim.claimedDescription && <div className="text-[11px] text-slate-400">{claim.claimedDescription}</div>}
                {renderEvidenceList(claim.evidenceAttachments || [])}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                  <button onClick={() => handleDataDecision(claim, 'refer_to_financial')} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
                    <ArrowLeftCircle className="w-3.5 h-3.5" /> ارجاع به بررسی مالی
                  </button>
                  <input
                    value={dataNoteById[claim.id] || ''}
                    onChange={(e) => setDataNoteById((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                    placeholder="دلیل رد (در صورت رد)..."
                    className="flex-1 min-w-[160px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-rose-500"
                  />
                  <button onClick={() => handleDataDecision(claim, 'reject', dataNoteById[claim.id])} className="px-3 py-2 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition">
                    <XCircle className="w-3.5 h-3.5" /> رد ادعای نامرتبط
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canReviewFinancial && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-300">مرحلهٔ مالی — تأیید نهایی مبلغ ({pendingFinancialClaims.length})</div>
          {pendingFinancialClaims.length === 0 ? (
            <p className="text-[11px] text-slate-500 p-6 text-center border border-dashed border-slate-800 rounded-2xl">ادعایی در انتظار بررسی مالی نیست.</p>
          ) : pendingFinancialClaims.map((claim) => {
            const view = toPurchaseClaimFinancialView(claim, customerById(claim.customerId));
            return (
              <div key={claim.id} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2.5">
                <div className="text-[11px] text-slate-300">مشتری: <strong className="text-white">{view.customerDisplayName}</strong></div>
                <div className="text-[11px] text-slate-300 font-mono" dir="ltr">مبلغ ادعاشده: {view.claimedAmount.toLocaleString('fa-IR')} ریال</div>
                {view.claimedDescription && <div className="text-[11px] text-slate-400">{view.claimedDescription}</div>}
                {renderEvidenceList(view.evidenceAttachments)}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
                  <input
                    value={financialAmountById[claim.id] ?? String(claim.claimedAmount)}
                    onChange={(e) => setFinancialAmountById((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                    dir="ltr"
                    className="w-40 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={() => handleFinancialDecision(claim, 'confirm', Number(financialAmountById[claim.id] ?? claim.claimedAmount))}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> تأیید نهایی مبلغ
                  </button>
                  <button onClick={() => handleFinancialCloseUnverified(claim)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
                    <Ban className="w-3.5 h-3.5" /> بستن به‌عنوان تأییدنشده
                  </button>
                  <input
                    value={financialNoteById[claim.id] || ''}
                    onChange={(e) => setFinancialNoteById((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                    placeholder="دلیل رد (در صورت رد)..."
                    className="flex-1 min-w-[140px] bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-white focus:outline-none focus:border-rose-500"
                  />
                  <button onClick={() => handleFinancialDecision(claim, 'reject', undefined, financialNoteById[claim.id])} className="px-3 py-2 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition">
                    <XCircle className="w-3.5 h-3.5" /> رد
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canSubmit && myClaims.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-300">ادعاهای ثبت‌شدهٔ من</div>
          <div className="space-y-1.5">
            {myClaims.map((c) => (
              <div key={c.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between gap-2 text-[11px]">
                <span className="font-mono text-slate-300" dir="ltr">{c.claimedAmount.toLocaleString('fa-IR')} ریال</span>
                <span className="text-slate-500 font-mono flex items-center gap-1" dir="ltr"><Clock className="w-3 h-3" />{c.submittedAt}</span>
                <span className={`px-2 py-0.5 rounded-full font-bold border ${STATUS_LABELS[c.status].tone}`}>{STATUS_LABELS[c.status].label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
