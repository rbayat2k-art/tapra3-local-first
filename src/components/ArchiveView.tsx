import React, { useState, useMemo } from 'react';
import { PaymentRequest, Company, CostCenter, User, SupportCase, Letter, Vendor, SystemRole } from '../types';
import { formatRial } from '../utils/numberToWords';
import { computeVisibleUserIds } from '../utils/orgHierarchy';
import { toTreasuryPaymentSourceView, getTreasuryVisibleSourceRequests, TreasuryPaymentSourceView } from '../utils/treasurySourceView';
import * as XLSX from 'xlsx';
import {
  Archive, Search, Filter, Printer,
  Building, MapPin, Calendar, CheckCircle2, FileSpreadsheet, Eye,
  ShieldCheck, LifeBuoy, Mail, Users, FileText, Download, Sparkles
} from 'lucide-react';

interface ArchiveViewProps {
  requests: PaymentRequest[];
  companies: Company[];
  costCenters: CostCenter[];
  currentUser: User | null;
  roles?: SystemRole[];
  supportCases?: SupportCase[];
  letters?: Letter[];
  vendors?: Vendor[];
  users?: User[];
  onSelectRequest: (req: PaymentRequest) => void;
  onOpenPrintModal: (req: PaymentRequest) => void;
}

type ArchiveSection = 'requests' | 'support' | 'letters' | 'vendors' | 'cost_centers';

export const ArchiveView: React.FC<ArchiveViewProps> = ({
  requests,
  companies,
  costCenters,
  currentUser,
  supportCases = [],
  letters = [],
  vendors = [],
  users = [],
  onSelectRequest,
  onOpenPrintModal
}) => {
  const [activeSection, setActiveSection] = useState<ArchiveSection>('requests');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('all');
  const [selectedCostCenterId, setSelectedCostCenterId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedSourceUnit, setSelectedSourceUnit] = useState('all');

  const isAdmin = currentUser?.role === 'admin';
  const isTreasury = currentUser?.role === 'treasury_executor';

  // Territory: which user ids currentUser is allowed to see records "belonging to",
  // per their active role(s) scope (own/direct_reports/subtree/company/branch — see
  // src/utils/orgHierarchy.ts). Replaces the old broad "same cost center" checks below —
  // being in the same branch no longer implies visibility on its own.
  const visibleUserIds = useMemo(
    () => (currentUser ? computeVisibleUserIds(currentUser, users) : []),
    [currentUser, users]
  );

  // Available branches for current user
  const availableCostCenters = costCenters.filter(cc => {
    if (!currentUser || isAdmin || currentUser.role === 'treasury_executor') return true;
    if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
      return currentUser.allowedCostCenterIds.includes(cc.id);
    }
    if (currentUser.costCenterId) {
      return cc.id === currentUser.costCenterId;
    }
    return true;
  });

  // -------------------------------------------------------------
  // 1. FILTERING PAYMENT REQUESTS ACCORDING TO ROLE & PERMISSIONS
  // -------------------------------------------------------------
  const accessibleRequests = requests.filter(req => {
    if (!currentUser) return false;
    if (isAdmin) return true;

    // Requestors ONLY see their own requests (created by them)
    if (currentUser.role === 'requestor' && !currentUser.isDualRole) {
      return req.requestorId === currentUser.id || req.requestorName === currentUser.fullName;
    }

    // Approvers (Branch Managers / Supervisors) see requests created by themselves, assigned
    // to them, requests from users within their computed territory (own/subordinates per
    // their active role scope — NOT merely "same branch"), or where they acted.
    if (currentUser.role === 'approver' || currentUser.isDualRole) {
      const isMyOwn = req.requestorId === currentUser.id || req.requestorName === currentUser.fullName;
      const isAssigned = req.currentApproverId === currentUser.id;
      const isInTerritory = visibleUserIds.includes(req.requestorId);
      const isInTimeline = req.timeline?.some(t => t.actorId === currentUser.id || t.actorName === currentUser.fullName);
      return isMyOwn || isAssigned || isInTerritory || isInTimeline;
    }

    // Treasury Executors see requests in treasury stages, assigned to them, created by them,
    // or within their computed territory. Full SupportCase detail is never exposed to
    // treasury regardless — see the separate treasury-safe support view below.
    if (currentUser.role === 'treasury_executor') {
      const isMyOwn = req.requestorId === currentUser.id || req.requestorName === currentUser.fullName;
      const isAssigned = req.currentApproverId === currentUser.id;
      const isTreasuryStage = ['approved_awaiting_payment_assignment', 'approved_pending_payment', 'emergency_pending_payment', 'paid', 'completed'].includes(req.status);
      const isInTerritory = visibleUserIds.includes(req.requestorId);
      const isInTimeline = req.timeline?.some(t => t.actorId === currentUser.id || t.actorName === currentUser.fullName);
      return isMyOwn || isAssigned || isTreasuryStage || isInTerritory || isInTimeline;
    }

    return req.requestorId === currentUser.id || req.requestorName === currentUser.fullName;
  });

  const filteredRequests = accessibleRequests.filter(req => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      req.trackingCode.toLowerCase().includes(q) ||
      req.title.toLowerCase().includes(q) ||
      req.requestorName.toLowerCase().includes(q) ||
      req.description.toLowerCase().includes(q) ||
      (req.destinationAccountName && req.destinationAccountName.toLowerCase().includes(q)) ||
      (req.destinationCardNumber && req.destinationCardNumber.includes(q));

    const matchesCompany = selectedCompanyId === 'all' || req.companyId === selectedCompanyId;
    const matchesCostCenter = selectedCostCenterId === 'all' || req.costCenterId === selectedCostCenterId;
    const matchesStatus = selectedStatus === 'all' || req.status === selectedStatus;
    const matchesType = selectedType === 'all' || req.requestType === selectedType;
    const matchesSourceUnit = selectedSourceUnit === 'all' || req.sourceType === selectedSourceUnit;

    return matchesSearch && matchesCompany && matchesCostCenter && matchesStatus && matchesType && matchesSourceUnit;
  });

  // Treasury-safe minimal view of support-refund-sourced requests — used only for the
  // 'support' section when the current user is treasury_executor (never the raw SupportCase).
  const treasurySourceRequests: TreasuryPaymentSourceView[] = useMemo(
    () => getTreasuryVisibleSourceRequests(accessibleRequests).map(toTreasuryPaymentSourceView),
    [accessibleRequests]
  );

  // -------------------------------------------------------------
  // 2. FILTERING SUPPORT CASES
  // -------------------------------------------------------------
  // Treasury never receives the full SupportCase (complaint text, call history, contact
  // details, satisfaction, internal notes) — see the minimal treasurySourceRequests view
  // built above instead. Everyone else sees only their own territory (own record by
  // default, or their computed subordinate territory if their role scope grants it) —
  // being in the same branch no longer implies visibility on its own.
  const accessibleSupportCases = supportCases.filter(c => {
    if (!currentUser) return false;
    if (isAdmin) return true;
    if (isTreasury) return false;
    return visibleUserIds.includes(c.operatorId);
  });

  const filteredSupportCases = accessibleSupportCases.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.trackingCode.toLowerCase().includes(q) ||
      c.customerFullName.toLowerCase().includes(q) ||
      c.customerPhone.includes(q) ||
      (c.complaintDetail && c.complaintDetail.toLowerCase().includes(q)) ||
      (c.reasonForContact && c.reasonForContact.toLowerCase().includes(q))
    );
  });

  // -------------------------------------------------------------
  // 3. FILTERING LETTERS
  // -------------------------------------------------------------
  const accessibleLetters = letters.filter(l => {
    if (!currentUser || isAdmin) return true;
    const isMyOwn = l.fromUserId === currentUser.id || l.toUserId === currentUser.id;
    return isMyOwn;
  });

  const filteredLetters = accessibleLetters.filter(l => {
    const q = searchQuery.toLowerCase();
    return (
      l.letterNumber.toLowerCase().includes(q) ||
      l.subject.toLowerCase().includes(q) ||
      l.fromUserName.toLowerCase().includes(q) ||
      l.body.toLowerCase().includes(q)
    );
  });

  // -------------------------------------------------------------
  // EXPORT EXCEL LOGIC BY SECTION
  // -------------------------------------------------------------
  const handleExportExcel = () => {
    let excelData: any[] = [];
    let sheetName = 'خروجی_اکسل';
    let fileName = `خروجی_${activeSection}_${Date.now()}.xlsx`;

    if (activeSection === 'requests') {
      sheetName = 'درخواست‌های_پرداخت';
      fileName = `بایگانی_درخواست‌های_پرداخت_${Date.now()}.xlsx`;
      excelData = filteredRequests.map(req => ({
        'کد پیگیری (شناسه یونیک)': req.trackingCode,
        'عنوان درخواست': req.title,
        'نوع درخواست': req.requestType === 'current_payment' ? 'پرداخت جاری' : req.requestType === 'advance_payment' ? 'مساعده' : req.requestType === 'customer_refund' ? 'عودت وجه مشتری' : 'درخواست اطلاعات',
        'شرکت': req.companyName,
        'مرکز هزینه / شعبه': req.costCenterName,
        'مبلغ (ریال)': req.amount,
        'مبلغ به حروف': req.amountInWords,
        'شماره کارت مقصد': req.destinationCardNumber,
        'نام صاحب حساب': req.destinationAccountName,
        'درخواست‌کننده': req.requestorName,
        'مسئول بررسی فعلی': req.currentApproverName,
        'وضعیت': req.status === 'paid' ? 'واریز شده' : req.status === 'pending_approval' ? 'در انتظار تایید' : req.status,
        'تاریخ ثبت': req.createdAt,
        'فیش واریزی بانک': req.paymentReceiptAttachment ? 'دارد' : 'ندارد',
        'توضیحات': req.description
      }));
    } else if (activeSection === 'support') {
      if (isTreasury) {
        sheetName = 'مرجع_پرداخت_خزانه';
        fileName = `بایگانی_مرجع_پرداخت_خزانه_${Date.now()}.xlsx`;
        excelData = treasurySourceRequests.map(v => ({
          'کد پیگیری درخواست': v.requestTrackingCode,
          'مرجع صادرکننده': v.issuingUnitName,
          'کد مرجع منبع': v.sourceReferenceCode,
          'ذینفع': v.beneficiaryName,
          'مبلغ (ریال)': v.amount,
          'وضعیت': v.status,
          'تاریخ واریز': v.paidAt || '-'
        }));
      } else {
        sheetName = 'پرونده‌های_پشتیبانی';
        fileName = `بایگانی_شکایات_پشتیبانی_${Date.now()}.xlsx`;
        excelData = filteredSupportCases.map(c => ({
          'کد پیگیری پرونده': c.trackingCode,
          'نام مشتری': c.customerFullName,
          'شماره تماس': c.customerPhone,
          'استان / شهر': `${c.province || ''} - ${c.city || ''}`,
          'علت مراجعه': c.reasonForContact,
          'مرجع شکایت': c.complaintReference || '-',
          'مسدودی حساب شرکت با شکایت مشتری': c.accountBlocked ? 'بله' : 'خیر',
          'حساب‌های مسدود شده شرکت': (c.blockedAccountCompanyNames || []).join(' ، '),
          'وضعیت شکایت': c.complaintStatus,
          'اپراتور ثبت‌کننده': c.operatorName,
          'تاریخ ثبت': c.createdAt,
          'شرح کامل شکایت': c.complaintDetail || '-'
        }));
      }
    } else if (activeSection === 'letters') {
      sheetName = 'مکاتبات_اداری';
      fileName = `بایگانی_مکاتبات_و_نامه‌ها_${Date.now()}.xlsx`;
      excelData = filteredLetters.map(l => ({
        'شماره نامه': l.letterNumber,
        'عنوان / موضوع': l.subject,
        'سمت فرستنده': l.fromRoleTitle,
        'فرستنده': l.fromUserName,
        'واحد/شخص گیرنده': l.toUserName || l.toUnit,
        'تاریخ ایجاد': l.date,
        'متن نامه': l.body
      }));
    } else if (activeSection === 'vendors') {
      sheetName = 'فروشندگان';
      fileName = `لیست_تامین_کنندگان_${Date.now()}.xlsx`;
      excelData = vendors.map(v => ({
        'نام فروشنده / شرکت': v.name,
        'دسته‌بندی': v.category || '-',
        'شماره تماس': v.phone || '-',
        'کد ملی / شناسه ملی': v.nationalCode || '-',
        'شماره حساب / شبا': v.shebaNumber || v.accountNumber || v.cardNumber || '-',
        'نام بانک': v.bankName || '-'
      }));
    } else if (activeSection === 'cost_centers') {
      sheetName = 'شعب_و_مراکز_هزینه';
      fileName = `لیست_شعب_و_مراکز_هزینه_${Date.now()}.xlsx`;
      excelData = availableCostCenters.map(cc => ({
        'کد مرکز هزینه': cc.code,
        'نام شعبه / مرکز هزینه': cc.name,
        'بودجه ماهانه مصوب (ریال)': cc.monthlyBudget ?? '-',
        'دوره بودجه': cc.budgetPeriod || '-',
        'توضیحات': cc.description || '-'
      }));
    }

    if (excelData.length === 0) {
      alert('داده‌ای برای خروجی اکسل یافت نشد.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Top Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center font-bold">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white">
                سامانه جستجوی پیشرفته و خروجی اکسل بایگانی
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                isAdmin 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                {isAdmin ? 'دسترسی کل ادمین' : `دسترسی: ${currentUser?.roleTitle || 'کاربر سیستم'}`}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              مرکز جستجوی جامع و استخراج فایل‌های Excel طبق سطوح دسترسی سازمانی (درخواست‌های پرداخت، شکایات، نامه‌ها، تامین‌کنندگان و شعب)
            </p>
          </div>
        </div>

        {/* Global Excel Export Button */}
        <button
          onClick={handleExportExcel}
          className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-600/20 transition flex items-center gap-2 cursor-pointer"
        >
          <FileSpreadsheet className="w-5 h-5 text-emerald-100" />
          <span>دانلود خروجی کامل اکسل ({activeSection === 'requests' ? 'درخواست‌ها' : activeSection === 'support' ? 'پشتیبانی' : activeSection === 'letters' ? 'نامه‌ها' : activeSection === 'vendors' ? 'فروشندگان' : 'شعب'})</span>
        </button>
      </div>

      {/* Domain Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setActiveSection('requests')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'requests'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>درخواست‌های پرداخت ({filteredRequests.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('support')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'support'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <LifeBuoy className="w-4 h-4" />
          <span>شکایات و پشتیبانی ({isTreasury ? treasurySourceRequests.length : filteredSupportCases.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('letters')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'letters'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>مکاتبات و نامه‌ها ({filteredLetters.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('vendors')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'vendors'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>فروشندگان و تامین‌کنندگان ({vendors.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('cost_centers')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSection === 'cost_centers'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>شعب و مراکز هزینه ({availableCostCenters.length})</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          
          {/* Main Search Bar */}
          <div className="md:col-span-2 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو کد پیگیری، عنوان، نام، توضیحات، شماره تماس..."
              className="w-full bg-slate-800 text-white text-xs rounded-xl pr-9 pl-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          {activeSection === 'requests' && (
            <>
              {/* Company Filter */}
              <div>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">همه شرکت‌ها</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Cost Center Filter */}
              <div>
                <select
                  value={selectedCostCenterId}
                  onChange={(e) => setSelectedCostCenterId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">همه شعب / مراکز هزینه مجاز</option>
                  {availableCostCenters.map(cc => (
                    <option key={cc.id} value={cc.id}>{cc.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">همه وضعیت‌ها</option>
                  <option value="pending_approval">در انتظار تایید</option>
                  <option value="approved_awaiting_payment_assignment">آماده ارجاع پرداخت</option>
                  <option value="approved_pending_payment">تایید شده - در انتظار واریز</option>
                  <option value="emergency_pending_payment">پرداخت فوری - در انتظار واریز</option>
                  <option value="paid">واریز شده (دارای فیش)</option>
                  <option value="returned">عودت داده شده</option>
                  <option value="cancelled">لغو شده</option>
                  <option value="rejected">رد شده</option>
                </select>
              </div>

              {/* Source Unit (Issuing Reference) Filter */}
              <div>
                <select
                  value={selectedSourceUnit}
                  onChange={(e) => setSelectedSourceUnit(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">همه مراجع صادرکننده</option>
                  <option value="support_refund">عودت وجه (خدمات پس از فروش)</option>
                  <option value="sales_invoice">فاکتور فروش</option>
                  <option value="manual">ثبت دستی</option>
                </select>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Table Results Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
        
        {/* 1. Payment Requests Table */}
        {activeSection === 'requests' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">کد یونیک</th>
                  <th className="p-3.5">عنوان درخواست</th>
                  <th className="p-3.5">شرکت و مرکز هزینه</th>
                  <th className="p-3.5">مبلغ (ریال)</th>
                  <th className="p-3.5">درخواست‌کننده</th>
                  <th className="p-3.5">وضعیت</th>
                  <th className="p-3.5">فیش واریز</th>
                  <th className="p-3.5 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5">
                      <span className="bg-indigo-600 text-white font-mono font-bold px-2.5 py-1 rounded-lg">
                        {req.trackingCode}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-white max-w-xs truncate">{req.title}</div>
                      <span className="text-[10px] text-slate-500">{req.createdAt}</span>
                    </td>
                    <td className="p-3.5">
                      <div className="font-bold text-slate-200">{req.companyName}</div>
                      <div className="text-[10px] text-amber-300">{req.costCenterName}</div>
                    </td>
                    <td className="p-3.5 font-mono font-bold text-emerald-400">
                      {formatRial(req.amount)}
                    </td>
                    <td className="p-3.5 font-medium text-slate-200">
                      {req.requestorName}
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        req.status === 'paid' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        req.status === 'pending_approval' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        'bg-slate-800 text-slate-300'
                      }`}>
                        {req.status === 'paid' ? 'واریز شده' : req.status === 'pending_approval' ? 'در انتظار' : req.status}
                      </span>
                    </td>
                    <td className="p-3.5">
                      {req.paymentReceiptAttachment ? (
                        <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          موجود
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">ندارد</span>
                      )}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSelectRequest(req)}
                          className="p-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-lg transition cursor-pointer"
                          title="مشاهده جزئیات"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onOpenPrintModal(req)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
                          title="چاپ برگه رسمی"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2a. Treasury-safe minimal payment-source view — never the raw SupportCase */}
        {activeSection === 'support' && isTreasury && (
          <div className="overflow-x-auto">
            <div className="p-3 text-[11px] text-amber-300 bg-amber-500/10 border-b border-amber-500/20">
              خزانه‌داری فقط به اطلاعات پرداختی مرجع عودت وجه دسترسی دارد؛ شرح شکایت، سوابق تماس و اطلاعات کامل پرونده پشتیبانی برای این نقش نمایش داده نمی‌شود.
            </div>
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">کد پیگیری درخواست</th>
                  <th className="p-3.5">مرجع صادرکننده</th>
                  <th className="p-3.5">کد مرجع منبع</th>
                  <th className="p-3.5">ذینفع</th>
                  <th className="p-3.5">مبلغ (ریال)</th>
                  <th className="p-3.5">وضعیت</th>
                  <th className="p-3.5">تاریخ واریز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {treasurySourceRequests.map((v) => (
                  <tr key={v.requestTrackingCode} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-mono font-bold text-amber-400">{v.requestTrackingCode}</td>
                    <td className="p-3.5 text-slate-200">{v.issuingUnitName}</td>
                    <td className="p-3.5 font-mono text-slate-300">{v.sourceReferenceCode}</td>
                    <td className="p-3.5 font-bold text-white">{v.beneficiaryName}</td>
                    <td className="p-3.5 font-mono font-bold text-emerald-400">{formatRial(v.amount)}</td>
                    <td className="p-3.5 text-slate-300">{v.status}</td>
                    <td className="p-3.5 text-slate-400 text-[10px]">{v.paidAt || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 2b. Support Cases Table (non-treasury roles only) */}
        {activeSection === 'support' && !isTreasury && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">کد پرونده</th>
                  <th className="p-3.5">نام مشتری</th>
                  <th className="p-3.5">شماره تماس</th>
                  <th className="p-3.5">علت مراجعه</th>
                  <th className="p-3.5">مسدودی حساب شرکت</th>
                  <th className="p-3.5">ثبت‌کننده</th>
                  <th className="p-3.5">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredSupportCases.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-mono font-bold text-amber-400">{c.trackingCode}</td>
                    <td className="p-3.5 font-bold text-white">{c.customerFullName}</td>
                    <td className="p-3.5 font-mono text-slate-300">{c.customerPhone}</td>
                    <td className="p-3.5 text-slate-200">{c.reasonForContact}</td>
                    <td className="p-3.5">
                      {c.accountBlocked ? (
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px] border border-rose-500/30">
                          بله - (مسدود)
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">خیر</span>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-300">{c.operatorName}</td>
                    <td className="p-3.5 text-slate-400 text-[10px]">{c.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Letters Table */}
        {activeSection === 'letters' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">شماره نامه</th>
                  <th className="p-3.5">عنوان / موضوع</th>
                  <th className="p-3.5">نویسنده</th>
                  <th className="p-3.5">گیرنده</th>
                  <th className="p-3.5">تاریخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredLetters.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-mono font-bold text-indigo-400">{l.letterNumber}</td>
                    <td className="p-3.5 font-bold text-white">{l.subject}</td>
                    <td className="p-3.5 text-slate-200">{l.fromUserName}</td>
                    <td className="p-3.5 text-amber-300">{l.toUserName || l.toUnit}</td>
                    <td className="p-3.5 text-slate-400 text-[10px]">{l.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Vendors Table */}
        {activeSection === 'vendors' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">نام تامین‌کننده</th>
                  <th className="p-3.5">دسته‌بندی</th>
                  <th className="p-3.5">شماره تماس</th>
                  <th className="p-3.5">شماره کارت / شبا</th>
                  <th className="p-3.5">بانک</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-bold text-white">{v.name}</td>
                    <td className="p-3.5 text-amber-300">{v.category || '-'}</td>
                    <td className="p-3.5 font-mono text-slate-300">{v.phone || '-'}</td>
                    <td className="p-3.5 font-mono text-emerald-400">{v.shebaNumber || v.accountNumber || v.cardNumber || '-'}</td>
                    <td className="p-3.5 text-slate-400">{v.bankName || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. Cost Centers Table */}
        {activeSection === 'cost_centers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">کد مرکز هزینه</th>
                  <th className="p-3.5">نام شعبه</th>
                  <th className="p-3.5">بودجه ماهانه مصوب</th>
                  <th className="p-3.5">دوره بودجه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {availableCostCenters.map((cc) => (
                  <tr key={cc.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-mono font-bold text-indigo-400">{cc.code}</td>
                    <td className="p-3.5 font-bold text-white">{cc.name}</td>
                    <td className="p-3.5 font-mono font-bold text-emerald-400">{cc.monthlyBudget != null ? formatRial(cc.monthlyBudget) : '-'}</td>
                    <td className="p-3.5 text-slate-200">{cc.budgetPeriod || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>

    </div>
  );
};
