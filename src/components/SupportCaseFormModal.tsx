import React, { useState } from 'react';
import { SupportCase, SupportTransactionRow, User, Company, CostCenter, SupportContactType, SupportReasonType, SupportPriority } from '../types';
import { getJalaliNowWithSeconds } from '../utils/persianDate';
import { formatRial } from '../utils/numberToWords';
import { storage } from '../utils/storage';
import { X, Plus, Trash2, UserCircle, Receipt, Save, ChevronDown, ChevronUp, CreditCard, Search } from 'lucide-react';
import { PersianDatePicker } from './PersianDatePicker';

interface SupportCaseFormModalProps {
  currentUser: User | null;
  companies: Company[];
  costCenters: CostCenter[];
  existingCases: SupportCase[];
  editingCase?: SupportCase | null;
  onClose: () => void;
  onCreate: (newCase: SupportCase) => void;
  onSaveEdit?: (updatedCase: SupportCase) => void;
}

const IRAN_PROVINCES = [
  'تهران', 'البرز', 'اصفهان', 'فارس', 'خراسان رضوی', 'آذربایجان شرقی', 'آذربایجان غربی',
  'مازندران', 'گیلان', 'خوزستان', 'کرمان', 'یزد', 'قم', 'قزوین', 'مرکزی', 'زنجان',
  'گلستان', 'اردبیل', 'همدان', 'کردستان', 'کرمانشاه', 'لرستان', 'بوشهر', 'هرمزگان',
  'سیستان و بلوچستان', 'چهارمحال و بختیاری', 'کهگیلویه و بویراحمد', 'ایلام', 'سمنان',
  'خراسان شمالی', 'خراسان جنوبی'
];

const emptyRow = (): SupportTransactionRow => ({
  id: `strx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  invoiceCode: '',
  invoiceDate: '',
  totalInvoiceAmount: 0,
  customerRefundShebaNumber: '',
  finalRefundAmount: 0,
  status: 'pending_financial_approval'
});

// Same comma-formatting convention used everywhere else in the app (e.g. NewRequestModal):
// display with English-locale thousands separators, strip non-digits on input.
const formatAmountDisplay = (val: number | undefined) => (val ? val.toLocaleString('en-US') : '');
const parseAmountInput = (raw: string) => Number(raw.replace(/\D/g, '')) || 0;

export const SupportCaseFormModal: React.FC<SupportCaseFormModalProps> = ({
  currentUser,
  companies,
  costCenters,
  existingCases,
  editingCase,
  onClose,
  onCreate,
  onSaveEdit
}) => {
  const isEditMode = !!editingCase;

  const [customerFullName, setCustomerFullName] = useState(editingCase?.customerFullName || '');
  const [customerPhone, setCustomerPhone] = useState(editingCase?.customerPhone || '');
  const [province, setProvince] = useState(editingCase?.province || 'تهران');
  const [city, setCity] = useState(editingCase?.city || '');
  const [address, setAddress] = useState(editingCase?.address || '');
  const [contactType, setContactType] = useState<SupportContactType>(editingCase?.contactType || 'تلفنی');
  const [reasonForContact, setReasonForContact] = useState<SupportReasonType>(editingCase?.reasonForContact || 'انصراف و عودت وجه');
  const [complaintDetail, setComplaintDetail] = useState(editingCase?.complaintDetail || '');
  const [complaintReference, setComplaintReference] = useState(editingCase?.complaintReference || '');
  const [allCompanyBankAccounts] = useState(() => storage.getCompanyBankAccounts());
  const [accountBlocked, setAccountBlocked] = useState(editingCase?.accountBlocked || false);
  const [blockedAccountCompanyIds, setBlockedAccountCompanyIds] = useState<string[]>(editingCase?.blockedAccountCompanyIds || []);
  const [blockedBankAccountIds, setBlockedBankAccountIds] = useState<string[]>(() => {
    if (editingCase?.blockedBankAccountIds && editingCase.blockedBankAccountIds.length > 0) {
      return editingCase.blockedBankAccountIds;
    }
    // Fallback: match by company IDs if editing older record
    if (editingCase?.blockedAccountCompanyIds) {
      const allAccs = storage.getCompanyBankAccounts();
      return allAccs.filter(a => editingCase.blockedAccountCompanyIds?.includes(a.companyId)).map(a => a.id);
    }
    return [];
  });
  const [isAccountsDropdownOpen, setIsAccountsDropdownOpen] = useState(false);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [assignedRepresentative, setAssignedRepresentative] = useState(editingCase?.assignedRepresentative || '');
  const [referrerName, setReferrerName] = useState(editingCase?.referrerName || '');
  const [referralDate, setReferralDate] = useState(editingCase?.referralDate || '');
  const [salesPersonName, setSalesPersonName] = useState(editingCase?.salesPersonName || '');
  const [callCenterName, setCallCenterName] = useState(editingCase?.callCenterName || '');
  const [seniorSupervisorName, setSeniorSupervisorName] = useState(editingCase?.seniorSupervisorName || '');
  const [salesManagerName, setSalesManagerName] = useState(editingCase?.salesManagerName || '');
  const [branchId, setBranchId] = useState(editingCase?.branchId || '');
  const [dataType, setDataType] = useState(editingCase?.dataType || '');
  const [promotionType, setPromotionType] = useState(editingCase?.promotionType || '');
  const [priority, setPriority] = useState<SupportPriority>(editingCase?.priority || 'normal');

  const [transactions, setTransactions] = useState<SupportTransactionRow[]>(
    editingCase?.transactions && editingCase.transactions.length > 0 ? editingCase.transactions : [emptyRow()]
  );

  // Auto-recalled history: previous cases from the same phone number
  const previousHistory = customerPhone.trim().length >= 6
    ? existingCases.filter((c) => c.customerPhone === customerPhone.trim() && c.id !== editingCase?.id)
    : [];

  const updateRow = (id: string, patch: Partial<SupportTransactionRow>) => {
    setTransactions((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const updated = { ...r, ...patch };
      const additions = (updated.litigationCost || 0) + (updated.extraCost || 0) + (updated.doorDeliveryAmount || 0);
      updated.finalRefundAmount = Math.max(0, (updated.totalInvoiceAmount || 0) - (updated.totalDeductions || 0) + additions);
      return updated;
    }));
  };

  const addRow = () => setTransactions((prev) => [...prev, emptyRow()]);
  const removeRow = (id: string) => setTransactions((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!customerFullName.trim() || !customerPhone.trim() || !province || !city.trim()) {
      alert('لطفاً نام مشتری، شماره تماس، استان و شهر را تکمیل نمایید.');
      return;
    }
    if (!branchId) {
      alert('لطفاً شعبه مربوطه را انتخاب نمایید.');
      return;
    }
    for (const row of transactions) {
      if (!row.invoiceCode.trim() || !row.invoiceDate.trim() || !row.totalInvoiceAmount || !row.customerRefundShebaNumber.trim()) {
        alert('لطفاً کد فاکتور، تاریخ فاکتور، مبلغ کل فاکتور و شماره شبای عودت را برای همه ردیف‌های تراکنش تکمیل نمایید.');
        return;
      }
    }

    const branch = costCenters.find((c) => c.id === branchId);
    const now = getJalaliNowWithSeconds();

    const selectedBankAccs = allCompanyBankAccounts.filter((a) => blockedBankAccountIds.includes(a.id));
    const selectedCompIds = Array.from(new Set(selectedBankAccs.map((a) => a.companyId)));
    const selectedCompNames = selectedBankAccs.map((a) => `${a.companyName} - ${a.bankName} (${a.accountNumber})`);

    const sharedFields = {
      customerFullName: customerFullName.trim(),
      customerPhone: customerPhone.trim(),
      province,
      city: city.trim(),
      address: address.trim(),
      contactType,
      reasonForContact,
      complaintDetail: complaintDetail.trim(),
      complaintReference: complaintReference.trim(),
      accountBlocked,
      blockedAccountCompanyIds: accountBlocked ? (selectedCompIds.length > 0 ? selectedCompIds : blockedAccountCompanyIds) : [],
      blockedAccountCompanyNames: accountBlocked ? (selectedCompNames.length > 0 ? selectedCompNames : companies.filter((co) => blockedAccountCompanyIds.includes(co.id)).map((co) => co.name)) : [],
      blockedBankAccountIds: accountBlocked ? blockedBankAccountIds : [],
      blockedBankAccounts: accountBlocked ? selectedBankAccs : [],
      assignedRepresentative: assignedRepresentative.trim(),
      referrerName: referrerName.trim(),
      referralDate: referralDate.trim(),
      salesPersonName: salesPersonName.trim(),
      callCenterName: callCenterName.trim(),
      seniorSupervisorName: seniorSupervisorName.trim(),
      salesManagerName: salesManagerName.trim(),
      branchId,
      branchName: branch?.name,
      dataType: dataType.trim(),
      promotionType: promotionType.trim(),
      priority,
      transactions
    };

    if (isEditMode && editingCase) {
      const updatedCase: SupportCase = {
        ...editingCase,
        ...sharedFields,
        // ویرایش عمومی پرونده هرگز تصمیم مالی یا اتصال خزانه را بازنشانی نمی‌کند؛ اصلاح مالی
        // فقط از مسیر ردیف «نیاز به اصلاح» و با شرح اجباری انجام می‌شود.
        transactions,
        timeline: [
          ...editingCase.timeline,
          {
            id: `stl_${Date.now()}`,
            actorId: currentUser.id,
            actorName: currentUser.fullName,
            actorRole: currentUser.roleTitle,
            action: 'commented' as const,
            actionTitle: 'ویرایش اطلاعات پرونده توسط پشتیبانی',
            comment: 'پشتیبانی پیش از اقدام تایید مالی، اطلاعات پرونده را اصلاح کرد.',
            timestamp: now
          }
        ]
      };
      onSaveEdit?.(updatedCase);
      return;
    }

    const counter = storage.getAndIncrementSupportCounter();
    const trackingCode = `S${(50000 + counter).toString()}`;

    const newCase: SupportCase = {
      id: `support_${Date.now()}`,
      trackingCode,
      createdAt: now,
      operatorId: currentUser.id,
      operatorName: currentUser.fullName,
      ...sharedFields,
      attachments: [],
      transactions: transactions.map((r) => ({ ...r, status: 'pending_financial_approval' as const })),
      status: 'open',
      complaintStatus: 'open',
      timeline: [
        {
          id: `stl_${Date.now()}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.roleTitle,
          action: 'created',
          actionTitle: 'ثبت اولیه پرونده توسط پشتیبانی',
          comment: `پرونده با کد پیگیری ${trackingCode} شامل ${transactions.length} ردیف تراکنش ثبت و برای تایید مالی ارسال شد.`,
          timestamp: now
        }
      ]
    };

    onCreate(newCase);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-3xl w-full my-8 max-h-[92vh] overflow-y-auto text-right">
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-extrabold text-white">{isEditMode ? 'ویرایش پرونده خدمات پس از فروش' : 'ثبت پرونده جدید خدمات پس از فروش'}</h2>
            <p className="text-xs text-slate-400 mt-1">اطلاعات مشتری و تراکنش‌های عودت وجه را ثبت نمایید</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Auto fields */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-400">
            <span>تاریخ و ساعت ثبت: <b className="text-white">{getJalaliNowWithSeconds()}</b></span>
            <span>اپراتور: <b className="text-white">{currentUser?.fullName}</b></span>
          </div>

          {/* Customer info */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-indigo-300 flex items-center gap-1.5"><UserCircle className="w-4 h-4" /> اطلاعات مشتری</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">نام و نام خانوادگی مشتری *</label>
                <input value={customerFullName} onChange={(e) => setCustomerFullName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">شماره تماس مشتری *</label>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">استان *</label>
                <select value={province} onChange={(e) => setProvince(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500">
                  {IRAN_PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">شهر *</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-300">آدرس</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>
            </div>

            {previousHistory.length > 0 && (
              <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl text-[11px] text-amber-200 space-y-1">
                <p className="font-bold">سابقه پشتیبانی این شماره تماس ({previousHistory.length} پرونده قبلی):</p>
                {previousHistory.slice(0, 3).map((c) => (
                  <p key={c.id}>• {c.trackingCode} — {c.reasonForContact} — {c.createdAt} — وضعیت: {c.status === 'closed' ? 'بسته‌شده' : 'باز'}</p>
                ))}
              </div>
            )}
          </div>

          {/* Contact / complaint info */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-indigo-300">جزئیات تماس و شکایت</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">نوع تماس *</label>
                <select value={contactType} onChange={(e) => setContactType(e.target.value as SupportContactType)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
                  {(['تلفنی', 'حضوری', 'پیامکی', 'آنلاین', 'ایمیل'] as SupportContactType[]).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">علت مراجعه *</label>
                <select value={reasonForContact} onChange={(e) => setReasonForContact(e.target.value as SupportReasonType)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
                  {(['فعال‌سازی', 'انصراف و عودت وجه', 'قطع خدمات', 'شکایت کیفیت', 'سایر'] as SupportReasonType[]).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">اولویت پرونده</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value as SupportPriority)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
                  <option value="normal">عادی</option>
                  <option value="urgent">فوری</option>
                  <option value="critical">بحرانی</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">مرجع شکایت</label>
                <input value={complaintReference} onChange={(e) => setComplaintReference(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-300">شرح شکایت / درخواست</label>
                <textarea value={complaintDetail} onChange={(e) => setComplaintDetail(e.target.value)} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accountBlocked}
                    onChange={(e) => {
                      setAccountBlocked(e.target.checked);
                      if (!e.target.checked) {
                        setBlockedBankAccountIds([]);
                        setBlockedAccountCompanyIds([]);
                      } else {
                        setIsAccountsDropdownOpen(true);
                      }
                    }}
                    className="w-4 h-4 accent-rose-500 rounded cursor-pointer"
                  />
                  <span>مشتری با ثبت شکایت (فتا، آگاهی، مراجع قضایی) موجب مسدودی حساب(های) شرکت شده است</span>
                </label>

                {accountBlocked && (
                  <div className="p-3 bg-slate-950/80 border border-rose-500/30 rounded-2xl space-y-3">
                    <p className="text-[11px] text-slate-400">
                      شماره حساب‌های شرکت که به دلیل شکایت این مشتری مسدود گردیده‌اند را از لیست کشویی زیر انتخاب و تیک بزنید:
                    </p>

                    {/* Collapsible Dropdown Trigger Button */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsAccountsDropdownOpen(prev => !prev)}
                        className="w-full bg-slate-900 hover:bg-slate-850 border border-slate-700 hover:border-rose-500/50 rounded-xl px-4 py-3 text-xs text-right text-white flex items-center justify-between transition cursor-pointer shadow-sm"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <CreditCard className="w-4 h-4 text-rose-400 shrink-0" />
                          <span className="font-bold">
                            {blockedBankAccountIds.length === 0
                              ? 'جهت مشاهده و انتخاب کشویی شماره حساب‌ها کلیک کنید...'
                              : `تعداد ${blockedBankAccountIds.length} شماره حساب بانکی انتخاب گردید`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {blockedBankAccountIds.length > 0 && (
                            <span className="bg-rose-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full">
                              {blockedBankAccountIds.length}
                            </span>
                          )}
                          {isAccountsDropdownOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </button>

                      {/* Collapsible Dropdown Menu */}
                      {isAccountsDropdownOpen && (
                        <div className="mt-2 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl space-y-3 animate-fade-in z-20">
                          {/* Search bar inside dropdown */}
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-2.5" />
                            <input
                              type="text"
                              value={accountSearchQuery}
                              onChange={(e) => setAccountSearchQuery(e.target.value)}
                              placeholder="جستجو در شماره حساب، نام بانک یا شرکت..."
                              className="w-full bg-slate-950 text-white text-[11px] rounded-lg pr-8 pl-3 py-1.5 border border-slate-800 focus:outline-none focus:border-rose-500"
                            />
                          </div>

                          {/* Quick select / clear buttons */}
                          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-2">
                            <span>لیست شماره حساب‌های ثبت‌شده در سیستم ({allCompanyBankAccounts.length}):</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setBlockedBankAccountIds(allCompanyBankAccounts.map(a => a.id))}
                                className="text-sky-400 hover:underline cursor-pointer"
                              >
                                انتخاب همه
                              </button>
                              <span>|</span>
                              <button
                                type="button"
                                onClick={() => setBlockedBankAccountIds([])}
                                className="text-rose-400 hover:underline cursor-pointer"
                              >
                                پاک‌کردن همه
                              </button>
                            </div>
                          </div>

                          {/* List of Accounts with checkboxes */}
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                            {allCompanyBankAccounts
                              .filter(acc => {
                                const q = accountSearchQuery.trim().toLowerCase();
                                return !q || 
                                  acc.companyName.toLowerCase().includes(q) ||
                                  acc.bankName.toLowerCase().includes(q) ||
                                  acc.accountNumber.toLowerCase().includes(q) ||
                                  acc.shebaNumber.toLowerCase().includes(q) ||
                                  acc.accountTitle.toLowerCase().includes(q);
                              })
                              .map(acc => {
                                const isChecked = blockedBankAccountIds.includes(acc.id);
                                return (
                                  <label
                                    key={acc.id}
                                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition ${
                                      isChecked 
                                        ? 'bg-rose-950/40 border-rose-500/80 text-white' 
                                        : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 overflow-hidden">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setBlockedBankAccountIds(prev => [...prev, acc.id]);
                                          } else {
                                            setBlockedBankAccountIds(prev => prev.filter(id => id !== acc.id));
                                          }
                                        }}
                                        className="w-4 h-4 accent-rose-500 rounded cursor-pointer shrink-0"
                                      />
                                      <div className="truncate">
                                        <div className="flex items-center gap-2 font-bold">
                                          <span>{acc.bankName}</span>
                                          <span className="text-[10px] bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-indigo-300">
                                            {acc.companyName}
                                          </span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 truncate">{acc.accountTitle}</p>
                                      </div>
                                    </div>

                                    <div className="text-left font-mono text-[11px] shrink-0">
                                      <span className="text-emerald-400 font-bold block dir-ltr">{acc.accountNumber}</span>
                                      {acc.shebaNumber && <span className="text-slate-500 text-[9px] block dir-ltr">{acc.shebaNumber.slice(0, 10)}...</span>}
                                    </div>
                                  </label>
                                );
                              })}
                          </div>

                          <div className="pt-2 border-t border-slate-800 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setIsAccountsDropdownOpen(false)}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                            >
                              تایید و بستن کشو
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Selected Badges Preview */}
                    {blockedBankAccountIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {allCompanyBankAccounts
                          .filter(a => blockedBankAccountIds.includes(a.id))
                          .map(a => (
                            <span
                              key={a.id}
                              className="text-[10px] font-bold bg-rose-950/60 border border-rose-500/40 text-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                            >
                              <span>{a.companyName} — {a.bankName} ({a.accountNumber})</span>
                              <button
                                type="button"
                                onClick={() => setBlockedBankAccountIds(prev => prev.filter(id => id !== a.id))}
                                className="text-rose-400 hover:text-white font-black"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">نماینده رسیدگی‌کننده</label>
                <input value={assignedRepresentative} onChange={(e) => setAssignedRepresentative(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">ارجاع‌دهنده</label>
                <input value={referrerName} onChange={(e) => setReferrerName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">تاریخ ارجاع</label>
                <PersianDatePicker value={referralDate} onChange={setReferralDate} placeholder="انتخاب تاریخ ارجاع" />
              </div>
            </div>
          </div>

          {/* Sales / branch context */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-indigo-300">اطلاعات فروش و شعبه</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">شعبه *</label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white">
                  <option value="">— انتخاب کنید —</option>
                  {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">نام فروشنده</label>
                <input value={salesPersonName} onChange={(e) => setSalesPersonName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">کال‌سنتر</label>
                <input value={callCenterName} onChange={(e) => setCallCenterName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">سرپرست ارشد</label>
                <input value={seniorSupervisorName} onChange={(e) => setSeniorSupervisorName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">مدیر فروش</label>
                <input value={salesManagerName} onChange={(e) => setSalesManagerName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">نوع دیتا</label>
                <input value={dataType} onChange={(e) => setDataType(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">نوع پروموشن</label>
                <input value={promotionType} onChange={(e) => setPromotionType(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white" />
              </div>
            </div>
          </div>

          {/* Transaction rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-indigo-300 flex items-center gap-1.5"><Receipt className="w-4 h-4" /> فاکتورها و مبالغ عودتی</h3>
              <button type="button" onClick={addRow} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> افزودن ردیف تراکنش
              </button>
            </div>

            {transactions.map((row, idx) => (
              <div key={row.id} className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400">ردیف تراکنش #{idx + 1}</span>
                  {transactions.length > 1 && (
                    <button type="button" onClick={() => removeRow(row.id)} className="text-rose-400 hover:text-rose-300 cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">کد فاکتور *</label>
                    <input value={row.invoiceCode} onChange={(e) => updateRow(row.id, { invoiceCode: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">تاریخ فاکتور *</label>
                    <PersianDatePicker value={row.invoiceDate} onChange={(v) => updateRow(row.id, { invoiceDate: v })} placeholder="انتخاب تاریخ فاکتور" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">مبلغ کل فاکتور (ریال) *</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountDisplay(row.totalInvoiceAmount)}
                      onChange={(e) => updateRow(row.id, { totalInvoiceAmount: parseAmountInput(e.target.value) })}
                      placeholder="۲۰۰,۰۰۰,۰۰۰"
                      dir="ltr"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-mono text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">مبلغ پیش‌واریزی</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountDisplay(row.preDepositAmount)}
                      onChange={(e) => updateRow(row.id, { preDepositAmount: parseAmountInput(e.target.value) })}
                      placeholder="۱۰۰,۰۰۰,۰۰۰"
                      dir="ltr"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-mono text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">تاریخ پیش‌واریزی</label>
                    <PersianDatePicker value={row.preDepositDate || ''} onChange={(v) => updateRow(row.id, { preDepositDate: v })} placeholder="انتخاب تاریخ" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">ساعت پیش‌واریزی</label>
                    <input type="time" value={row.preDepositTime || ''} onChange={(e) => updateRow(row.id, { preDepositTime: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">۴ رقم آخر حساب مقصد</label>
                    <input value={row.destAccountLast4 || ''} onChange={(e) => updateRow(row.id, { destAccountLast4: e.target.value })} maxLength={4} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">نام شرکت صاحب حساب مقصد</label>
                    <input value={row.destAccountCompanyName || ''} onChange={(e) => updateRow(row.id, { destAccountCompanyName: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">۴ رقم آخر حساب مبدا</label>
                    <input value={row.sourceAccountLast4 || ''} onChange={(e) => updateRow(row.id, { sourceAccountLast4: e.target.value })} maxLength={4} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400">نام صاحب حساب مبدا</label>
                    <input value={row.sourceAccountHolderName || ''} onChange={(e) => updateRow(row.id, { sourceAccountHolderName: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">شماره کارت مشتری جهت عودت</label>
                    <input value={row.customerRefundCardNumber || ''} onChange={(e) => updateRow(row.id, { customerRefundCardNumber: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-400">شماره شبای مشتری جهت عودت *</label>
                    <input value={row.customerRefundShebaNumber} onChange={(e) => updateRow(row.id, { customerRefundShebaNumber: e.target.value })} placeholder="IR..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <label className="text-[10px] font-bold text-slate-400">توضیحات ردیف</label>
                    <input value={row.description || ''} onChange={(e) => updateRow(row.id, { description: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">جمع کسورات</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountDisplay(row.totalDeductions)}
                      onChange={(e) => updateRow(row.id, { totalDeductions: parseAmountInput(e.target.value) })}
                      dir="ltr"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-mono text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">هزینه دادرسی (اضافه به مبلغ عودت)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountDisplay(row.litigationCost)}
                      onChange={(e) => updateRow(row.id, { litigationCost: parseAmountInput(e.target.value) })}
                      dir="ltr"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-mono text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">هزینه مازاد (اضافه به مبلغ عودت)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountDisplay(row.extraCost)}
                      onChange={(e) => updateRow(row.id, { extraCost: parseAmountInput(e.target.value) })}
                      dir="ltr"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-mono text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400">مبلغ واریزی درب منزل (اضافه به مبلغ عودت)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatAmountDisplay(row.doorDeliveryAmount)}
                      onChange={(e) => updateRow(row.id, { doorDeliveryAmount: parseAmountInput(e.target.value) })}
                      dir="ltr"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-mono text-left"
                    />
                  </div>
                </div>

                {/* Custom user-added fields */}
                <div className="space-y-2 pt-1">
                  {(row.customFields || []).map((cf) => (
                    <div key={cf.id} className="flex items-center gap-1.5">
                      <input
                        value={cf.label}
                        onChange={(e) => updateRow(row.id, { customFields: (row.customFields || []).map((f) => f.id === cf.id ? { ...f, label: e.target.value } : f) })}
                        placeholder="عنوان فیلد"
                        className="w-1/3 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white"
                      />
                      <input
                        value={cf.value}
                        onChange={(e) => updateRow(row.id, { customFields: (row.customFields || []).map((f) => f.id === cf.id ? { ...f, value: e.target.value } : f) })}
                        placeholder="مقدار"
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white"
                      />
                      <button
                        type="button"
                        onClick={() => updateRow(row.id, { customFields: (row.customFields || []).filter((f) => f.id !== cf.id) })}
                        className="p-2 text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateRow(row.id, { customFields: [...(row.customFields || []), { id: `cf_${Date.now()}`, label: '', value: '' }] })}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> افزودن فیلد سفارشی
                  </button>
                </div>
                <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-300 flex items-center justify-between">
                  <span>مبلغ نهایی جهت عودت (محاسبه خودکار)</span>
                  <span>{formatRial(row.finalRefundAmount)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
            <button type="submit" className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer">
              <Save className="w-4 h-4" />
              {isEditMode ? 'ذخیره تغییرات' : 'ثبت پرونده و ارسال برای تایید مالی'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer">
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
