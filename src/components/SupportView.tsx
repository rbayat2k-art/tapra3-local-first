import React, { useState, useMemo } from 'react';
import { SupportCase, User, Company, CostCenter, SystemPermission } from '../types';
import { formatRial } from '../utils/numberToWords';
import { hasPermission } from '../utils/permissions';
import { SupportCaseFormModal } from './SupportCaseFormModal';
import { SupportCaseDetailModal } from './SupportCaseDetailModal';
import {
  LifeBuoy, Plus, Search, Filter, Download, Phone, MapPin,
  TrendingUp, Clock3, CheckCircle2, AlertTriangle, Edit3, Eye
} from 'lucide-react';

interface SupportViewProps {
  cases: SupportCase[];
  currentUser: User | null;
  users: User[];
  companies: Company[];
  costCenters: CostCenter[];
  effectivePermissions: SystemPermission[] | null;
  onCreateCase: (newCase: SupportCase) => void;
  onUpdateCase: (updated: SupportCase) => void;
  onMarkRowApproved: (caseId: string, rowId: string, note: string) => void;
  onSendApprovedRowsToTreasury: (caseId: string, rowIds: string[], closeCaseAfter: boolean) => void;
}

const priorityBadge = (p: SupportCase['priority']) => {
  if (p === 'critical') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">بحرانی</span>;
  if (p === 'urgent') return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">فوری</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">عادی</span>;
};

const transactionStatusLabel = (status: SupportCase['transactions'][number]['status']): string => ({
  pending_financial_approval: 'در انتظار تایید مالی',
  approved_pending_send: 'تاییدشده، آماده ارسال به خزانه',
  financial_approved: 'ارسال‌شده به خزانه',
  financial_rejected: 'رد نهایی مالی',
  needs_correction: 'نیازمند اصلاح پشتیبانی',
  pending_treasury_payment: 'در انتظار پرداخت خزانه',
  paid: 'پرداخت‌شده'
}[status]);

export const SupportView: React.FC<SupportViewProps> = ({
  cases,
  currentUser,
  users,
  companies,
  costCenters,
  effectivePermissions,
  onCreateCase,
  onUpdateCase,
  onMarkRowApproved,
  onSendApprovedRowsToTreasury
}) => {
  const isAdmin = effectivePermissions === null;
  const isSupportAgent = hasPermission(effectivePermissions, ['manage_support_cases']);
  const isFinancialApprover = hasPermission(effectivePermissions, ['financial_approve_support']);
  const canViewReports = hasPermission(effectivePermissions, ['view_support_reports']);

  const [tab, setTab] = useState<'cases' | 'financial_queue' | 'reports'>(
    isSupportAgent ? 'cases' : isFinancialApprover ? 'financial_queue' : 'cases'
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<SupportCase | null>(null);
  const [selectedCase, setSelectedCase] = useState<SupportCase | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // My cases (support agent) vs all cases (admin)
  const myCases = useMemo(() => {
    let list = isAdmin ? cases : cases.filter((c) => c.operatorId === currentUser?.id);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter((c) => c.customerFullName.includes(q) || c.customerPhone.includes(q) || c.trackingCode.includes(q));
    }
    return list.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [cases, currentUser, isAdmin, search]);

  // Financial approval queue: every pending transaction row across all cases
  const pendingRows = useMemo(() => {
    const rows: { supportCase: SupportCase; rowId: string; invoiceCode: string; amount: number; customerName: string }[] = [];
    cases.forEach((c) => {
      c.transactions.filter((t) => t.status === 'pending_financial_approval').forEach((t) => {
        rows.push({ supportCase: c, rowId: t.id, invoiceCode: t.invoiceCode, amount: t.finalRefundAmount, customerName: c.customerFullName });
      });
    });
    return rows;
  }, [cases]);

  // Admin report: full filterable list of every transaction row
  const reportRows = useMemo(() => {
    const rows: { supportCase: SupportCase; row: SupportCase['transactions'][number] }[] = [];
    cases.forEach((c) => {
      c.transactions.forEach((row) => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return;
        if (dateFrom && c.createdAt < dateFrom) return;
        if (dateTo && c.createdAt > dateTo + '\uffff') return;
        if (search.trim()) {
          const q = search.trim();
          if (!c.customerFullName.includes(q) && !c.customerPhone.includes(q) && !c.trackingCode.includes(q) && !row.invoiceCode.includes(q)) return;
        }
        rows.push({ supportCase: c, row });
      });
    });
    return rows.sort((a, b) => (b.supportCase?.createdAt || '').localeCompare(a.supportCase?.createdAt || ''));
  }, [cases, statusFilter, dateFrom, dateTo, search]);

  const stats = useMemo(() => {
    const totalRefunded = cases.reduce((sum, c) => sum + c.transactions.filter((t) => t.status === 'paid').reduce((s, t) => s + t.finalRefundAmount, 0), 0);
    const openCases = cases.filter((c) => c.status === 'open').length;
    const satisfied = cases.filter((c) => c.satisfactionStatus === 'satisfied').length;
    const closedWithSatisfaction = cases.filter((c) => c.satisfactionStatus).length;
    return {
      totalRefunded,
      openCases,
      pendingApprovalCount: pendingRows.length,
      satisfactionRate: closedWithSatisfaction > 0 ? Math.round((satisfied / closedWithSatisfaction) * 100) : null
    };
  }, [cases, pendingRows]);

  const handleExportCsv = () => {
    const headers = [
      // اطلاعات پرونده (هدر ثابت مشتری)
      'کد پیگیری پرونده', 'تاریخ و ساعت ثبت', 'اپراتور ثبت‌کننده', 'وضعیت پرونده',
      'نام مشتری', 'شماره تماس', 'استان', 'شهر', 'آدرس',
      'نوع تماس', 'علت مراجعه', 'شرح شکایت', 'مرجع شکایت', 'وضعیت شکایت',
      'مسدودی حساب شرکت با شکایت مشتری', 'حساب‌های مسدودشده شرکت', 'نماینده رسیدگی‌کننده', 'ارجاع‌دهنده', 'تاریخ ارجاع',
      'نام فروشنده', 'کال‌سنتر', 'سرپرست ارشد', 'مدیر فروش', 'شعبه', 'نوع دیتا', 'نوع پروموشن', 'اولویت',
      'نتیجه تماس', 'وضعیت رضایت مشتری', 'تاریخ تکمیل پرونده',
      // اطلاعات ردیف تراکنش
      'کد فاکتور', 'تاریخ فاکتور', 'مبلغ کل فاکتور', 'مبلغ پیش‌واریزی', 'تاریخ پیش‌واریزی', 'ساعت پیش‌واریزی',
      '۴ رقم آخر حساب مقصد', 'نام شرکت صاحب حساب مقصد', '۴ رقم آخر حساب مبدا', 'نام صاحب حساب مبدا',
      'شماره کارت عودت', 'شماره شبای عودت', 'توضیحات ردیف',
      'جمع کسورات', 'هزینه دادرسی', 'هزینه مازاد', 'واریزی درب منزل', 'مبلغ نهایی عودت',
      'اصلاحیه عودت', 'تاریخ عودت اعلامی به مشتری', 'فیلدهای سفارشی',
      // وضعیت و تایید مالی
      'وضعیت ردیف', 'کارشناس تایید مالی', 'یادداشت تایید مالی', 'تاریخ اقدام تایید مالی',
      'کد پیگیری پرداخت (خزانه)', 'تاریخ پرداخت',
      // لاگ کامل پرونده
      'تاریخچه کامل اقدامات (لاگ)'
    ];

    const csvEscape = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const lines = reportRows.map(({ supportCase: c, row }) => {
      const customFieldsText = (row.customFields || []).filter(f => f.label.trim()).map(f => `${f.label}: ${f.value}`).join(' | ');
      const logText = c.timeline
        .map(t => `[${t.timestamp}] ${t.actorName} (${t.actorRole}): ${t.actionTitle}${t.comment ? ' — ' + t.comment : ''}`)
        .join(' || ');

      const fields = [
        c.trackingCode, c.createdAt, c.operatorName, c.status === 'closed' ? 'بسته‌شده' : 'باز',
        c.customerFullName, c.customerPhone, c.province, c.city, c.address || '',
        c.contactType, c.reasonForContact, c.complaintDetail || '', c.complaintReference || '', c.complaintStatus,
        c.accountBlocked ? 'بله' : 'خیر', (c.blockedAccountCompanyNames || []).join('، '),
        c.assignedRepresentative || '', c.referrerName || '', c.referralDate || '',
        c.salesPersonName || '', c.callCenterName || '', c.seniorSupervisorName || '', c.salesManagerName || '',
        c.branchName || '', c.dataType || '', c.promotionType || '', c.priority,
        c.callResult || '', c.satisfactionStatus || '', c.completedAt || '',
        row.invoiceCode, row.invoiceDate, row.totalInvoiceAmount, row.preDepositAmount || 0, row.preDepositDate || '', row.preDepositTime || '',
        row.destAccountLast4 || '', row.destAccountCompanyName || '', row.sourceAccountLast4 || '', row.sourceAccountHolderName || '',
        row.customerRefundCardNumber || '', row.customerRefundShebaNumber, row.description || '',
        row.totalDeductions || 0, row.litigationCost || 0, row.extraCost || 0, row.doorDeliveryAmount || 0, row.finalRefundAmount,
        row.refundCorrection || '', row.refundDateAnnouncedToCustomer || '', customFieldsText,
        transactionStatusLabel(row.status), row.financialApproverName || '', row.financialApproverNote || '', row.financialActionAt || '',
        row.paymentRequestTrackingCode || '', row.paidAt || '',
        logText
      ];
      return fields.map(f => csvEscape(String(f))).join(',');
    });

    const csv = '\uFEFF' + [headers.map(csvEscape).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `گزارش-خدمات-پس-از-فروش-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 dir-rtl">
      {/* Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">خدمات پس از فروش، پشتیبانی و شکایات</h2>
            <p className="text-xs text-slate-400 mt-0.5">ثبت تماس مشتریان، پیگیری شکایات و مدیریت عودت وجه تا خزانه‌داری</p>
          </div>
        </div>
        {isSupportAgent && (
          <button onClick={() => setIsFormOpen(true)} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
            <Plus className="w-4 h-4" /> ثبت پرونده جدید
          </button>
        )}
      </div>

      {/* Stats (admin / anyone granted report access gets the full picture) */}
      {canViewReports && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-[10px] text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> مجموع عودت پرداخت‌شده</span>
            <p className="text-sm font-black text-white mt-1">{formatRial(stats.totalRefunded)}</p>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock3 className="w-3 h-3" /> پرونده‌های باز</span>
            <p className="text-sm font-black text-white mt-1">{stats.openCases}</p>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-[10px] text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> در صف تایید مالی</span>
            <p className="text-sm font-black text-white mt-1">{stats.pendingApprovalCount}</p>
          </div>
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
            <span className="text-[10px] text-slate-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> نرخ رضایت مشتری</span>
            <p className="text-sm font-black text-white mt-1">{stats.satisfactionRate !== null ? `${stats.satisfactionRate}%` : '—'}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-0.5 flex-wrap">
        {isSupportAgent && (
          <button onClick={() => setTab('cases')} className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer ${tab === 'cases' ? 'bg-slate-900 text-white border-x border-t border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
            {isAdmin ? 'همه پرونده‌ها' : 'پرونده‌های من'}
          </button>
        )}
        {isFinancialApprover && (
          <button onClick={() => setTab('financial_queue')} className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer flex items-center gap-1.5 ${tab === 'financial_queue' ? 'bg-slate-900 text-white border-x border-t border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
            کارتابل تایید مالی
            {pendingRows.length > 0 && <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">{pendingRows.length}</span>}
          </button>
        )}
        {canViewReports && (
          <button onClick={() => setTab('reports')} className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition cursor-pointer ${tab === 'reports' ? 'bg-slate-900 text-white border-x border-t border-slate-800' : 'text-slate-500 hover:text-slate-300'}`}>
            گزارش و جست‌وجوی پیشرفته
          </button>
        )}
      </div>

      {/* Cases tab */}
      {tab === 'cases' && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی نام، تلفن یا کد پیگیری..." className="w-full bg-slate-900 border border-slate-800 rounded-xl pr-8 pl-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
          </div>

          {myCases.length === 0 && (
            <div className="text-center text-xs text-slate-500 p-10 border border-dashed border-slate-800 rounded-2xl">هنوز پرونده‌ای ثبت نشده است.</div>
          )}

          <div className="space-y-2">
            {myCases.map((c) => {
              const isOwner = isAdmin || currentUser?.id === c.operatorId;
              const untouchedByFinance = c.transactions.every((t) => t.status === 'pending_financial_approval');
              const canEditThisCase = isSupportAgent && isOwner && untouchedByFinance && c.status !== 'closed';

              return (
                <div key={c.id} onClick={() => setSelectedCase(c)} className="w-full text-right p-4 bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl transition cursor-pointer space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] bg-indigo-600/20 text-indigo-300 px-2 py-0.5 rounded-lg">{c.trackingCode}</span>
                      <span className="text-xs font-bold text-white">{c.customerFullName}</span>
                      {priorityBadge(c.priority)}
                      {c.status === 'closed' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700 text-slate-300">بسته‌شده</span>
                      ) : canEditThisCase ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">در انتظار اقدام مالی (قابل ویرایش)</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">در حال پردازش مالی</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{c.createdAt}</span>
                      {canEditThisCase && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCase(c);
                          }}
                          className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition shadow"
                        >
                          <Edit3 className="w-3 h-3" /> ویرایش / اصلاح
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCase(c);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition"
                      >
                        <Eye className="w-3 h-3" /> مشاهده جزئیات
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.customerPhone}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.city}</span>
                    <span>{c.reasonForContact}</span>
                    <span>{c.transactions.length} ردیف تراکنش</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Financial approval queue tab */}
      {tab === 'financial_queue' && (
        <div className="space-y-2">
          {pendingRows.length === 0 && (
            <div className="text-center text-xs text-slate-500 p-10 border border-dashed border-slate-800 rounded-2xl">کارتابل تایید مالی خالی است.</div>
          )}
          {pendingRows.map(({ supportCase: c, rowId, invoiceCode, amount, customerName }) => (
            <button key={rowId} onClick={() => setSelectedCase(c)} className="w-full text-right p-4 bg-slate-900 border border-amber-500/20 hover:border-amber-500/50 rounded-2xl transition cursor-pointer flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] bg-indigo-600/20 text-indigo-300 px-2 py-0.5 rounded-lg">{c.trackingCode}</span>
                  <span className="text-xs font-bold text-white">{customerName}</span>
                  <span className="text-[11px] text-slate-500">فاکتور {invoiceCode}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">ثبت‌شده توسط {c.operatorName} — {c.createdAt}</p>
              </div>
              <span className="text-sm font-black text-amber-300">{formatRial(amount)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Admin reports tab */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px] space-y-1">
              <label className="text-[10px] font-bold text-slate-400">جست‌وجو</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-8 pl-3 py-2 text-xs text-white" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400">وضعیت</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
                <option value="all">همه</option>
                <option value="pending_financial_approval">در انتظار تایید مالی</option>
                <option value="financial_approved">تایید شده</option>
                <option value="financial_rejected">رد شده</option>
                <option value="needs_correction">نیاز به اصلاح</option>
                <option value="paid">پرداخت شده</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400">از تاریخ</label>
              <input value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="1403/05/01" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white w-32" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400">تا تاریخ</label>
              <input value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="1403/05/31" className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white w-32" />
            </div>
            <button onClick={handleExportCsv} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer">
              <Download className="w-3.5 h-3.5" /> خروجی Excel/CSV
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-950 text-slate-400">
                  <tr>
                    <th className="p-3 text-right">کد پرونده</th>
                    <th className="p-3 text-right">مشتری</th>
                    <th className="p-3 text-right">فاکتور</th>
                    <th className="p-3 text-right">مبلغ نهایی</th>
                    <th className="p-3 text-right">وضعیت</th>
                    <th className="p-3 text-right">اپراتور</th>
                    <th className="p-3 text-right">آخرین مسئول/اقدام</th>
                    <th className="p-3 text-right">تاریخ و ساعت ثبت</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map(({ supportCase: c, row }) => (
                    <tr key={row.id} onClick={() => setSelectedCase(c)} className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer">
                      <td className="p-3 font-mono text-indigo-300">{c.trackingCode}</td>
                      <td className="p-3 text-white">{c.customerFullName}</td>
                      <td className="p-3 text-slate-400">{row.invoiceCode}</td>
                      <td className="p-3 text-emerald-400 font-bold">{formatRial(row.finalRefundAmount)}</td>
                      <td className="p-3 text-slate-400">{transactionStatusLabel(row.status)}</td>
                      <td className="p-3 text-slate-400">{c.operatorName}</td>
                      <td className="p-3 text-slate-400">
                        {c.timeline.length > 0 ? `${c.timeline[c.timeline.length - 1].actorName} — ${c.timeline[c.timeline.length - 1].actionTitle}` : '—'}
                      </td>
                      <td className="p-3 text-slate-500">{c.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {reportRows.length === 0 && <p className="p-8 text-center text-xs text-slate-500">نتیجه‌ای یافت نشد.</p>}
            </div>
          </div>
        </div>
      )}

      {(isFormOpen || editingCase) && (
        <SupportCaseFormModal
          currentUser={currentUser}
          companies={companies}
          costCenters={costCenters}
          existingCases={cases}
          editingCase={editingCase}
          onClose={() => { setIsFormOpen(false); setEditingCase(null); }}
          onCreate={(c) => { onCreateCase(c); setIsFormOpen(false); }}
          onSaveEdit={(c) => { onUpdateCase(c); setEditingCase(null); setSelectedCase(null); }}
        />
      )}

      {selectedCase && (
        <SupportCaseDetailModal
          supportCase={cases.find((c) => c.id === selectedCase.id) || selectedCase}
          currentUser={currentUser}
          effectivePermissions={effectivePermissions}
          onClose={() => setSelectedCase(null)}
          onUpdateCase={onUpdateCase}
          onMarkRowApproved={onMarkRowApproved}
          onSendApprovedRowsToTreasury={onSendApprovedRowsToTreasury}
          onEditCase={(c) => { setSelectedCase(null); setEditingCase(c); }}
        />
      )}
    </div>
  );
};
