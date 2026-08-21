import React, { useState, useMemo } from 'react';
import { SupportCase, SupportTransactionRow, User, SystemPermission } from '../types';
import { getJalaliNowWithSeconds } from '../utils/persianDate';
import { formatRial } from '../utils/numberToWords';
import { hasPermission } from '../utils/permissions';
import { canCloseSupportCase, canRevokeUnsentSupportApproval } from '../utils/supportRefundWorkflow';
import {
  X, CheckCircle2, XCircle, RotateCcw, Send, Banknote, Clock, UserCircle, MapPin, Phone,
  ChevronDown, ChevronUp, PackageCheck, Edit3, ShieldCheck
} from 'lucide-react';

interface SupportCaseDetailModalProps {
  supportCase: SupportCase;
  currentUser: User | null;
  effectivePermissions: SystemPermission[] | null;
  onClose: () => void;
  onUpdateCase: (updated: SupportCase) => void;
  onMarkRowApproved: (caseId: string, rowId: string, note: string) => void;
  onSendApprovedRowsToTreasury: (caseId: string, rowIds: string[], closeCaseAfter: boolean) => void;
  onEditCase: (c: SupportCase) => void;
}

const statusBadge = (status: SupportTransactionRow['status']) => {
  const map: Record<SupportTransactionRow['status'], { label: string; cls: string }> = {
    pending_financial_approval: { label: 'در انتظار تایید مالی', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    approved_pending_send: { label: 'تایید شد - آماده ارسال', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
    financial_approved: { label: 'ارسال شد - در کارتابل خزانه', cls: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
    financial_rejected: { label: 'رد شد', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
    needs_correction: { label: 'نیاز به اصلاح', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
    pending_treasury_payment: { label: 'در کارتابل خزانه', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
    paid: { label: 'پرداخت شده', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  };
  const m = map[status];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${m.cls}`}>{m.label}</span>;
};

export const SupportCaseDetailModal: React.FC<SupportCaseDetailModalProps> = ({
  supportCase,
  currentUser,
  effectivePermissions,
  onClose,
  onUpdateCase,
  onMarkRowApproved,
  onSendApprovedRowsToTreasury,
  onEditCase
}) => {
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [activeNoteAction, setActiveNoteAction] = useState<{ rowId: string; kind: 'reject' | 'correction' | 'reset' } | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  const isFinancialApprover = hasPermission(effectivePermissions, ['financial_approve_support']);
  const isSupportAgent = hasPermission(effectivePermissions, ['manage_support_cases']);

  const isCaseOwner = currentUser?.id === supportCase.operatorId || effectivePermissions === null;
  const untouchedByFinance = supportCase.transactions.every((t) => t.status === 'pending_financial_approval');
  const canEditCase = isSupportAgent && isCaseOwner && untouchedByFinance && supportCase.status !== 'closed';

  const approvedPendingRows = useMemo(
    () => supportCase.transactions.filter((t) => t.status === 'approved_pending_send'),
    [supportCase.transactions]
  );
  const selectedTotal = useMemo(
    () => supportCase.transactions.filter((t) => selectedRowIds.includes(t.id)).reduce((s, t) => s + t.finalRefundAmount, 0),
    [supportCase.transactions, selectedRowIds]
  );
  const undecidedCount = supportCase.transactions.filter(
    (t) => t.status === 'pending_financial_approval' || t.status === 'approved_pending_send'
  ).length;

  const isWide = supportCase.transactions.length > 1;

  const toggleRowSelected = (rowId: string) => {
    setSelectedRowIds((prev) => prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]);
  };

  const pushTimeline = (base: SupportCase, entry: Omit<SupportCase['timeline'][number], 'id' | 'timestamp'>) => ({
    ...base,
    timeline: [...base.timeline, { ...entry, id: `stl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, timestamp: getJalaliNowWithSeconds() }]
  });

  const handleApprove = (row: SupportTransactionRow) => {
    if (!currentUser) return;
    onMarkRowApproved(supportCase.id, row.id, noteDrafts[row.id] || '');
    setSelectedRowIds((prev) => [...prev, row.id]); // pre-select so it's ready in the send bar
    setNoteDrafts((p) => ({ ...p, [row.id]: '' }));
  };

  const handleResetRowStatus = (row: SupportTransactionRow) => {
    if (!currentUser) return;
    const note = noteDrafts[row.id] || '';
    if (!canRevokeUnsentSupportApproval(row)) {
      alert('پس از ایجاد درخواست خزانه، تصمیم مالی این ردیف غیرقابل بازنشانی است. اصلاح باید از مسیر رسمی همان درخواست انجام شود.');
      return;
    }
    if (!note.trim()) { alert('لطفاً دلیل لغو تایید مالی را بنویسید.'); return; }
    let updated: SupportCase = {
      ...supportCase,
      transactions: supportCase.transactions.map((r) => r.id === row.id ? {
        ...r, status: 'pending_financial_approval' as const,
        financialApproverId: undefined, financialApproverName: undefined,
        financialApproverNote: undefined, financialActionAt: undefined
      } : r)
    };
    updated = pushTimeline(updated, {
      actorId: currentUser.id, actorName: currentUser.fullName, actorRole: currentUser.roleTitle,
      action: 'commented', actionTitle: `بازگشت از تایید/اقدام مالی فاکتور ${row.invoiceCode}`,
      comment: note.trim()
    });
    onUpdateCase(updated);
    setSelectedRowIds((prev) => prev.filter((id) => id !== row.id));
    setNoteDrafts((p) => ({ ...p, [row.id]: '' }));
    setActiveNoteAction(null);
  };

  const confirmReject = (row: SupportTransactionRow) => {
    if (!currentUser) return;
    const note = noteDrafts[row.id] || '';
    if (!note.trim()) { alert('لطفاً دلیل رد را در توضیحات بنویسید.'); return; }
    let updated: SupportCase = {
      ...supportCase,
      transactions: supportCase.transactions.map((r) => r.id === row.id ? {
        ...r, status: 'financial_rejected' as const,
        financialApproverId: currentUser.id, financialApproverName: currentUser.fullName,
        financialApproverNote: note, financialActionAt: getJalaliNowWithSeconds()
      } : r)
    };
    updated = pushTimeline(updated, {
      actorId: currentUser.id, actorName: currentUser.fullName, actorRole: currentUser.roleTitle,
      action: 'financial_rejected', actionTitle: `رد مالی فاکتور ${row.invoiceCode}`, comment: note
    });
    onUpdateCase(updated);
    setNoteDrafts((p) => ({ ...p, [row.id]: '' }));
    setActiveNoteAction(null);
  };

  const confirmNeedsCorrection = (row: SupportTransactionRow) => {
    if (!currentUser) return;
    const note = noteDrafts[row.id] || '';
    if (!note.trim()) { alert('لطفاً توضیح دهید چه اصلاحی لازم است.'); return; }
    let updated: SupportCase = {
      ...supportCase,
      transactions: supportCase.transactions.map((r) => r.id === row.id ? {
        ...r, status: 'needs_correction' as const,
        financialApproverId: currentUser.id, financialApproverName: currentUser.fullName,
        financialApproverNote: note, financialActionAt: getJalaliNowWithSeconds()
      } : r)
    };
    updated = pushTimeline(updated, {
      actorId: currentUser.id, actorName: currentUser.fullName, actorRole: currentUser.roleTitle,
      action: 'needs_correction', actionTitle: `درخواست اصلاح فاکتور ${row.invoiceCode}`, comment: note
    });
    onUpdateCase(updated);
    setNoteDrafts((p) => ({ ...p, [row.id]: '' }));
    setActiveNoteAction(null);
  };

  const startEditRow = (row: SupportTransactionRow) => {
    setEditingRowId(row.id);
    setEditAmount(row.finalRefundAmount);
  };

  const handleResubmit = (row: SupportTransactionRow) => {
    if (!currentUser) return;
    const correctionNote = noteDrafts[row.id] || '';
    if (!correctionNote.trim()) { alert('شرح اصلاح انجام‌شده الزامی است.'); return; }
    if (!Number.isFinite(editAmount) || editAmount <= 0) { alert('مبلغ اصلاح‌شده باید بیشتر از صفر باشد.'); return; }
    let updated: SupportCase = {
      ...supportCase,
      transactions: supportCase.transactions.map((r) => r.id === row.id ? {
        ...r, status: 'pending_financial_approval' as const, finalRefundAmount: editAmount,
        refundCorrection: correctionNote.trim(),
        financialApproverId: undefined, financialApproverName: undefined,
        financialApproverNote: undefined, financialActionAt: undefined
      } : r)
    };
    updated = pushTimeline(updated, {
      actorId: currentUser.id, actorName: currentUser.fullName, actorRole: currentUser.roleTitle,
      action: 'commented', actionTitle: `اصلاح و ارسال مجدد فاکتور ${row.invoiceCode}`,
      comment: `${correctionNote.trim()} — مبلغ نهایی: ${formatRial(editAmount)}`
    });
    onUpdateCase(updated);
    setEditingRowId(null);
    setNoteDrafts((p) => ({ ...p, [row.id]: '' }));
  };

  const handleSendSelected = () => {
    if (selectedRowIds.length === 0) return;
    onSendApprovedRowsToTreasury(supportCase.id, selectedRowIds, false);
    setSelectedRowIds([]);
  };

  const handleSendAllApproved = () => {
    const allApprovedIds = approvedPendingRows.map((r) => r.id);
    if (allApprovedIds.length === 0) {
      alert('هیچ ردیف تایید‌شده‌ای برای ارسال وجود ندارد.');
      return;
    }
    if (undecidedCount > allApprovedIds.length) {
      if (!confirm('هنوز ردیف‌هایی تصمیم‌گیری نشده‌اند. فقط ردیف‌های تاییدشده به خزانه ارسال شوند؟')) return;
    }
    onSendApprovedRowsToTreasury(supportCase.id, allApprovedIds, false);
    setSelectedRowIds([]);
  };

  const handleCloseCase = () => {
    if (!currentUser) return;
    if (!canCloseSupportCase(supportCase)) {
      alert('پرونده فقط زمانی بسته می‌شود که همه ردیف‌ها پرداخت شده یا با دلیل نهایی رد شده باشند.');
      return;
    }
    if (!confirm('این پرونده بسته شود؟')) return;
    let updated: SupportCase = { ...supportCase, status: 'closed', complaintStatus: 'closed', completedAt: getJalaliNowWithSeconds() };
    updated = pushTimeline(updated, {
      actorId: currentUser.id, actorName: currentUser.fullName, actorRole: currentUser.roleTitle,
      action: 'case_closed', actionTitle: 'بستن پرونده', comment: 'پرونده به‌عنوان تکمیل‌شده بسته شد.'
    });
    onUpdateCase(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
      <div className={`bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full my-8 max-h-[92vh] overflow-y-auto text-right transition-all ${isWide ? 'max-w-7xl' : 'max-w-3xl'}`}>
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-indigo-600 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg">{supportCase.trackingCode}</span>
              <h2 className="text-lg font-extrabold text-white">{supportCase.customerFullName}</h2>
              {supportCase.status === 'closed' && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">بسته‌شده</span>}
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">{supportCase.transactions.length} ردیف تراکنش</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{supportCase.reasonForContact} — ثبت‌شده توسط {supportCase.operatorName} در {supportCase.createdAt}</p>
          </div>
          <div className="flex items-center gap-2">
            {canEditCase && (
              <button
                onClick={() => onEditCase(supportCase)}
                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg transition"
              >
                <Edit3 className="w-3.5 h-3.5" /> اصلاح / ویرایش اطلاعات
              </button>
            )}
            <button onClick={onClose} className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center cursor-pointer shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {canEditCase && (
          <div className="mx-6 mt-4 p-3.5 bg-indigo-950/40 border border-indigo-500/40 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 text-xs text-indigo-200">
              <Edit3 className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                این پرونده توسط شما ثبت شده است. از آنجا که هنوز مسئول مالی اقدامی روی آن انجام نداده، می‌توانید کلیه اطلاعات پرونده، فاکتورها و مبالغ را مشاهده و ویرایش کنید.
              </span>
            </div>
            <button onClick={() => onEditCase(supportCase)} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer shrink-0 shadow">
              اصلاح و ویرایش پرونده
            </button>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Customer header info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> شماره تماس</span>
              <p className="text-white font-bold mt-1">{supportCase.customerPhone}</p>
            </div>
            <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> استان / شهر</span>
              <p className="text-white font-bold mt-1">{supportCase.province} — {supportCase.city}</p>
            </div>
            <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-xs">
              <span className="text-slate-500 flex items-center gap-1"><UserCircle className="w-3 h-3" /> شعبه</span>
              <p className="text-white font-bold mt-1">{supportCase.branchName || '—'}</p>
            </div>
          </div>

          {supportCase.complaintDetail && (
            <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-slate-300">
              <span className="text-slate-500 block mb-1">شرح شکایت / درخواست:</span>
              {supportCase.complaintDetail}
            </div>
          )}

          {supportCase.accountBlocked && (
            <div className="p-3.5 bg-rose-950/30 border border-rose-500/40 rounded-2xl text-xs text-rose-200 space-y-2">
              <span className="font-extrabold text-rose-100 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-rose-400" />
                حساب(های) شرکت با شکایت این مشتری (فتا/آگاهی) مسدود گردیده است
              </span>
              
              {supportCase.blockedBankAccounts && supportCase.blockedBankAccounts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {supportCase.blockedBankAccounts.map((acc, idx) => (
                    <div key={acc.id || idx} className="p-2 bg-slate-900/80 border border-rose-500/30 rounded-xl text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between font-bold text-white">
                        <span>{acc.bankName}</span>
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded border border-rose-500/30">
                          {acc.companyName}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">{acc.accountTitle}</p>
                      <div className="flex items-center justify-between font-mono dir-ltr pt-1 border-t border-slate-800 text-[10px]">
                        <span className="text-emerald-400 font-bold">{acc.accountNumber}</span>
                        {acc.shebaNumber && <span className="text-sky-300">{acc.shebaNumber}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : supportCase.blockedAccountCompanyNames && supportCase.blockedAccountCompanyNames.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {supportCase.blockedAccountCompanyNames.map((name, idx) => (
                    <span key={idx} className="bg-rose-900/40 border border-rose-500/30 text-rose-200 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* Batch send bar - appears the moment anything is approved-and-waiting */}
          {isFinancialApprover && approvedPendingRows.length > 0 && (
            <div className="p-4 bg-cyan-950/20 border border-cyan-500/30 rounded-2xl flex items-center justify-between flex-wrap gap-3 sticky top-0">
              <div className="flex items-center gap-2 text-xs text-cyan-200">
                <PackageCheck className="w-4 h-4 shrink-0" />
                <span>{approvedPendingRows.length} ردیف تایید‌شده آماده ارسال — {selectedRowIds.length} ردیف انتخاب‌شده ({formatRial(selectedTotal)})</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendSelected}
                  disabled={selectedRowIds.length === 0}
                  className="px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> ارسال {selectedRowIds.length > 0 ? `(${selectedRowIds.length})` : ''} به خزانه
                </button>
                <button
                  onClick={handleSendAllApproved}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                >
                  ارسال همه تاییدشده‌ها
                </button>
              </div>
            </div>
          )}

          {/* Transactions - compact table */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-indigo-300 flex items-center gap-1.5"><Banknote className="w-4 h-4" /> فاکتورها و وضعیت تایید مالی</h3>

            <div className="border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-950 text-slate-500">
                    <tr>
                      <th className="p-2.5 w-8"></th>
                      <th className="p-2.5 text-right">فاکتور</th>
                      <th className="p-2.5 text-right">مبلغ فاکتور</th>
                      <th className="p-2.5 text-right">کسورات</th>
                      <th className="p-2.5 text-right">مبلغ نهایی</th>
                      <th className="p-2.5 text-right">وضعیت</th>
                      <th className="p-2.5 text-right">اقدامات</th>
                      <th className="p-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {supportCase.transactions.map((row) => {
                      const isExpanded = expandedRowId === row.id;
                      return (
                        <React.Fragment key={row.id}>
                          <tr className="border-t border-slate-800 hover:bg-slate-800/30">
                            <td className="p-2.5">
                              {row.status === 'approved_pending_send' && (
                                <input
                                  type="checkbox"
                                  checked={selectedRowIds.includes(row.id)}
                                  onChange={() => toggleRowSelected(row.id)}
                                  className="w-4 h-4"
                                />
                              )}
                            </td>
                            <td className="p-2.5 text-white font-bold whitespace-nowrap">{row.invoiceCode} <span className="text-slate-500 font-normal">· {row.invoiceDate}</span></td>
                            <td className="p-2.5 text-slate-300 whitespace-nowrap">{formatRial(row.totalInvoiceAmount)}</td>
                            <td className="p-2.5 text-slate-400 whitespace-nowrap">{formatRial(row.totalDeductions || 0)}</td>
                            <td className="p-2.5 text-emerald-400 font-bold whitespace-nowrap">{formatRial(row.finalRefundAmount)}</td>
                            <td className="p-2.5">{statusBadge(row.status)}</td>
                            <td className="p-2.5">
                              {isFinancialApprover && row.status === 'pending_financial_approval' && (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleApprove(row)} title="تایید" className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setActiveNoteAction({ rowId: row.id, kind: 'correction' })} title="نیاز به اصلاح" className="p-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg cursor-pointer">
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => setActiveNoteAction({ rowId: row.id, kind: 'reject' })} title="رد" className="p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg cursor-pointer">
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                              {isFinancialApprover && canRevokeUnsentSupportApproval(row) && (
                                <button onClick={() => setActiveNoteAction({ rowId: row.id, kind: 'reset' })} title="لغو تایید پیش از ارسال" className="px-2 py-1 bg-amber-600/90 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer shadow">
                                  <RotateCcw className="w-3 h-3" />
                                  <span>لغو تایید</span>
                                </button>
                              )}
                              {isSupportAgent && row.status === 'needs_correction' && editingRowId !== row.id && (
                                <button onClick={() => startEditRow(row)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg cursor-pointer">
                                  اصلاح و ارسال مجدد
                                </button>
                              )}
                            </td>
                            <td className="p-2.5">
                              <button onClick={() => setExpandedRowId(isExpanded ? null : row.id)} className="text-slate-500 hover:text-white cursor-pointer">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>

                          {/* Mandatory-note inline prompt for reject/correction */}
                          {activeNoteAction?.rowId === row.id && (
                            <tr className="bg-slate-950/60">
                              <td colSpan={8} className="p-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    autoFocus
                                    value={noteDrafts[row.id] || ''}
                                    onChange={(e) => setNoteDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                                    placeholder={activeNoteAction.kind === 'reject' ? 'دلیل رد را بنویسید (الزامی)...' : activeNoteAction.kind === 'reset' ? 'دلیل لغو تایید را بنویسید (الزامی)...' : 'توضیح دهید چه اصلاحی لازم است (الزامی)...'}
                                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                                  />
                                  <button
                                    onClick={() => activeNoteAction.kind === 'reject' ? confirmReject(row) : activeNoteAction.kind === 'reset' ? handleResetRowStatus(row) : confirmNeedsCorrection(row)}
                                    className={`px-3 py-2 text-white text-[11px] font-bold rounded-lg cursor-pointer ${activeNoteAction.kind === 'reject' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-orange-600 hover:bg-orange-500'}`}
                                  >
                                    ثبت
                                  </button>
                                  <button onClick={() => setActiveNoteAction(null)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer">
                                    انصراف
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Expanded row: full detail */}
                          {isExpanded && (
                            <tr className="bg-slate-950/40">
                              <td colSpan={8} className="p-4">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
                                  <div>مبلغ پیش‌واریزی: <span className="text-white font-bold">{row.preDepositAmount ? formatRial(row.preDepositAmount) : '—'}</span></div>
                                  <div>تاریخ/ساعت پیش‌واریزی: <span className="text-white font-bold">{row.preDepositDate || '—'} {row.preDepositTime || ''}</span></div>
                                  <div>۴ رقم آخر مقصد: <span className="text-white font-bold">{row.destAccountLast4 || '—'}</span></div>
                                  <div>نام شرکت صاحب حساب مقصد: <span className="text-white font-bold">{row.destAccountCompanyName || '—'}</span></div>
                                  <div>۴ رقم آخر مبدا: <span className="text-white font-bold">{row.sourceAccountLast4 || '—'}</span></div>
                                  <div>نام صاحب حساب مبدا: <span className="text-white font-bold">{row.sourceAccountHolderName || '—'}</span></div>
                                  <div>شماره کارت عودت: <span className="text-white font-bold">{row.customerRefundCardNumber || '—'}</span></div>
                                  <div>شبای عودت: <span className="text-white font-bold">{row.customerRefundShebaNumber}</span></div>
                                  <div>هزینه دادرسی: <span className="text-white font-bold">{formatRial(row.litigationCost || 0)}</span></div>
                                  <div>هزینه مازاد: <span className="text-white font-bold">{formatRial(row.extraCost || 0)}</span></div>
                                  <div>واریزی درب منزل: <span className="text-white font-bold">{formatRial(row.doorDeliveryAmount || 0)}</span></div>
                                  {row.description && <div className="col-span-2 sm:col-span-4">توضیحات: <span className="text-white">{row.description}</span></div>}
                                </div>

                                {row.customFields && row.customFields.filter(f => f.label.trim()).length > 0 && (
                                  <div className="mt-2.5 p-2 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-400 space-y-0.5">
                                    {row.customFields.filter(f => f.label.trim()).map((cf) => (
                                      <div key={cf.id}>{cf.label}: <span className="text-white">{cf.value}</span></div>
                                    ))}
                                  </div>
                                )}

                                {row.financialApproverNote && (
                                  <div className="mt-2.5 p-2 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-400">
                                    یادداشت تایید مالی ({row.financialApproverName}): {row.financialApproverNote}
                                  </div>
                                )}

                                {row.paymentRequestTrackingCode && (
                                  <div className="mt-2.5 p-2 bg-teal-950/30 border border-teal-500/30 rounded-lg text-[11px] text-teal-300">
                                    این ردیف در قالب درخواست پرداخت <b>{row.paymentRequestTrackingCode}</b> به کارتابل خزانه‌داری ارسال شده است.
                                  </div>
                                )}

                                {isSupportAgent && row.status === 'needs_correction' && editingRowId === row.id && (
                                  <div className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-center">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={editAmount ? editAmount.toLocaleString('en-US') : ''}
                                      onChange={(e) => setEditAmount(Number(e.target.value.replace(/\D/g, '')) || 0)}
                                      dir="ltr"
                                      className="flex-1 bg-slate-800 border border-indigo-400 rounded-lg px-3 py-2 text-xs text-white font-mono text-left"
                                      placeholder="مبلغ نهایی اصلاح‌شده"
                                    />
                                    <input
                                      value={noteDrafts[row.id] || ''}
                                      onChange={(e) => setNoteDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                                      className="bg-slate-800 border border-indigo-400 rounded-lg px-3 py-2 text-xs text-white"
                                      placeholder="شرح اصلاح انجام‌شده (الزامی)"
                                    />
                                    <button onClick={() => handleResubmit(row)} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1.5 cursor-pointer">
                                      <Send className="w-3.5 h-3.5" /> ارسال مجدد
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-indigo-300 flex items-center gap-1.5"><Clock className="w-4 h-4" /> تاریخچه پرونده</h3>
              <span className="text-[10px] text-slate-500 font-bold">تاریخچه کامل و غیرقابل حذف</span>
            </div>
            <div className="max-h-52 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
              {supportCase.timeline.slice().reverse().map((t) => (
                <div key={t.id} className="p-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{t.actorName} <span className="text-slate-500 font-normal">({t.actorRole})</span></span>
                    <span className="text-slate-500">{t.timestamp}</span>
                  </div>
                  <p className="text-indigo-300 mt-0.5">{t.actionTitle}</p>
                  {t.comment && <p className="text-slate-400 mt-0.5">{t.comment}</p>}
                </div>
              ))}
            </div>
          </div>

          {isSupportAgent && supportCase.status !== 'closed' && (
            <button onClick={handleCloseCase} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer">
              بستن پرونده
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
