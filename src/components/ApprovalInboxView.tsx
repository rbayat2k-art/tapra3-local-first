import React, { useState, useMemo } from 'react';
import { PaymentRequest, User, CostCenter, Company, SystemRole, SystemPermission } from '../types';
import { RequestTableView } from './RequestTableView';
import { formatRial } from '../utils/numberToWords';
import { hasPermission } from '../utils/permissions';
import { 
  CheckCircle2, Clock, Search, Filter, 
  ArrowUpDown, Calendar, CheckSquare, CreditCard, XCircle, RefreshCw, Building, MapPin
} from 'lucide-react';

// Converts a Jalali createdAt string (format "YYYY/MM/DD - HH:MM", e.g. "1403/05/10 - 14:30")
// into a single comparable number, so requests can be sorted by actual date/time
// instead of by their (non-chronological) sample-data id string.
const jalaliDateToComparable = (dateStr?: string): number => {
  if (!dateStr) return 0;
  const normalized = dateStr.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const match = normalized.match(/(\d{1,4})\/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2}):(\d{1,2})/);
  if (!match) return 0;
  const [, year, month, day, hour, minute] = match;
  return (
    Number(year) * 100000000 +
    Number(month) * 1000000 +
    Number(day) * 10000 +
    Number(hour) * 100 +
    Number(minute)
  );
};

interface ApprovalInboxViewProps {
  requests: PaymentRequest[];
  currentUser: User | null;
  roles?: SystemRole[];
  effectivePermissions?: SystemPermission[] | null;
  costCenters: CostCenter[];
  companies: Company[];
  onSelectRequest: (req: PaymentRequest) => void;
  onOpenPrintModal: (req: PaymentRequest) => void;
}

export const ApprovalInboxView: React.FC<ApprovalInboxViewProps> = ({
  requests,
  currentUser,
  effectivePermissions = null,
  costCenters,
  companies,
  onSelectRequest,
  onOpenPrintModal
}) => {
  const [subTab, setSubTab] = useState<'open' | 'in_progress' | 'completed'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('all');
  const [selectedCostCenter, setSelectedCostCenter] = useState('all');
  const [dateQuery, setDateQuery] = useState('');
  const [sortOption, setSortOption] = useState<'newest' | 'oldest' | 'amount_desc' | 'amount_asc'>('newest');

  if (!currentUser) return null;

  const isAdmin = currentUser.role === 'admin';
  const isTreasury = currentUser.role === 'treasury_executor';
  const isApprover = currentUser.role === 'approver' || currentUser.isDualRole;
  const canReferForPayment = isAdmin || hasPermission(effectivePermissions, ['refer_for_payment']);

  // 1. OPEN / MY ACTIONABLE REQUESTS (درخواست‌های در انتظار اقدام مستقیم من)
  const myActionRequests = useMemo(() => {
    return requests.filter(r => {
      // approved_awaiting_payment_assignment has no owner yet by design (final approval no
      // longer auto-picks a payment officer) — it must stay visible to admin/refer_for_payment
      // holders specifically, never fall through to a users[0]-style fallback or get lost.
      if (r.status === 'approved_awaiting_payment_assignment') {
        return canReferForPayment;
      }

      const isOpenStatus = r.status === 'pending_approval' || r.status === 'approved_pending_payment' || r.status === 'emergency_pending_payment' || r.status === 'returned';
      if (!isOpenStatus) return false;

      // Admin sees all open requests in my action tab
      if (isAdmin) return true;

      // Requestors do not process approval inbox
      if (currentUser.role === 'requestor' && !currentUser.isDualRole) return false;

      // SPECIFIC REFERRAL RULE:
      // If the request was assigned to a specific approver, ONLY that approver can process it
      if (r.currentApproverId && r.currentApproverId !== currentUser.id) {
        return false;
      }

      // If assigned specifically to this user
      if (r.currentApproverId === currentUser.id) return true;

      // Treasury Executors handle payment execution for approved requests or pending approval in their branches
      if (isTreasury) {
        if (r.status === 'approved_pending_payment') return true;
        if (r.status === 'pending_approval') {
          if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
            return currentUser.allowedCostCenterIds.includes(r.costCenterId);
          }
          return true;
        }
      }

      // Approvers handle requests in their assigned cost centers/branches
      if (isApprover && r.status === 'pending_approval') {
        if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
          return currentUser.allowedCostCenterIds.includes(r.costCenterId);
        }
        if (currentUser.costCenterId) {
          return r.costCenterId === currentUser.costCenterId;
        }
        return true;
      }

      return false;
    });
  }, [requests, currentUser, isAdmin, isTreasury, isApprover, canReferForPayment]);

  // 2. IN-PROGRESS / TRACKED REQUESTS (درخواست‌های در حال پیگیری - تأییدشده توسط من یا در جریان اقدام سایرین/خزانه‌داری)
  const inProgressRequests = useMemo(() => {
    return requests.filter(r => {
      const isOpenStatus = r.status === 'pending_approval' || r.status === 'approved_awaiting_payment_assignment' || r.status === 'approved_pending_payment' || r.status === 'emergency_pending_payment' || r.status === 'returned';
      if (!isOpenStatus) return false;

      if (isAdmin) return true;

      // If it is currently my direct turn to act, it belongs in Tab 1 (myActionRequests)
      const isMyDirectTurn = r.currentApproverId === currentUser.id;
      if (isMyDirectTurn) return false;

      // Check if user created it, acted in timeline (e.g. approved it), or belongs to user's branch
      const isMyCreated = r.requestorId === currentUser.id || r.requestorName === currentUser.fullName;
      const userHasActed = r.timeline?.some(t => t.actorId === currentUser.id || t.actorName === currentUser.fullName);
      const isMyBranch = currentUser.allowedCostCenterIds?.includes(r.costCenterId) || r.costCenterId === currentUser.costCenterId;

      return isMyCreated || userHasActed || isMyBranch;
    });
  }, [requests, currentUser, isAdmin]);

  // 3. CLOSED / COMPLETED REQUESTS (درخواست‌های بسته، واریزشده و سوابق نهایی)
  const completedRequests = useMemo(() => {
    return requests.filter(r => {
      const isClosedStatus = r.status === 'paid' || r.status === 'completed' || r.status === 'rejected' || r.status === 'cancelled';
      if (!isClosedStatus) return false;

      if (isAdmin) return true;

      // User acted on this request in the past (in timeline)
      const userHasActed = r.timeline?.some(t => 
        t.actorId === currentUser.id || t.actorName === currentUser.fullName
      );
      if (userHasActed) return true;

      // User was creator or assigned approver
      if (r.requestorId === currentUser.id || r.currentApproverId === currentUser.id) return true;

      // Branch authorization check
      if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
        return currentUser.allowedCostCenterIds.includes(r.costCenterId);
      }
      if (currentUser.costCenterId) {
        return r.costCenterId === currentUser.costCenterId;
      }

      return isTreasury;
    });
  }, [requests, currentUser, isAdmin, isTreasury]);

  const currentTabRequests = useMemo(() => {
    if (subTab === 'open') return myActionRequests;
    if (subTab === 'in_progress') return inProgressRequests;
    return completedRequests;
  }, [subTab, myActionRequests, inProgressRequests, completedRequests]);

  // Search and Filters
  const filteredRequests = useMemo(() => {
    return currentTabRequests.filter(r => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        (r.trackingCode && r.trackingCode.toLowerCase().includes(query)) ||
        (r.title && r.title.toLowerCase().includes(query)) ||
        (r.requestorName && r.requestorName.toLowerCase().includes(query)) ||
        (r.companyName && r.companyName.toLowerCase().includes(query)) ||
        (r.costCenterName && r.costCenterName.toLowerCase().includes(query)) ||
        (r.vendorName && r.vendorName.toLowerCase().includes(query)) ||
        (r.destinationAccountName && r.destinationAccountName.toLowerCase().includes(query)) ||
        (r.destinationCardNumber && r.destinationCardNumber.toLowerCase().includes(query)) ||
        (r.destinationSheba && r.destinationSheba.toLowerCase().includes(query)) ||
        (r.description && r.description.toLowerCase().includes(query)) ||
        (r.amount && r.amount.toString().includes(query)) ||
        (r.amountInWords && r.amountInWords.toLowerCase().includes(query)) ||
        (r.costCenterAllocations && r.costCenterAllocations.some(a => 
          a.costCenterName.toLowerCase().includes(query) || a.companyName.toLowerCase().includes(query)
        ));

      const matchesCompany = selectedCompany === 'all' || r.companyId === selectedCompany;
      const matchesCostCenter = selectedCostCenter === 'all' || r.costCenterId === selectedCostCenter;
      const matchesDate = !dateQuery || (r.createdAt && r.createdAt.includes(dateQuery));

      return matchesSearch && matchesCompany && matchesCostCenter && matchesDate;
    });
  }, [currentTabRequests, searchQuery, selectedCompany, selectedCostCenter, dateQuery]);

  // Sort
  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a, b) => {
      if (sortOption === 'newest') return jalaliDateToComparable(b.createdAt) - jalaliDateToComparable(a.createdAt);
      if (sortOption === 'oldest') return jalaliDateToComparable(a.createdAt) - jalaliDateToComparable(b.createdAt);
      if (sortOption === 'amount_desc') return b.amount - a.amount;
      if (sortOption === 'amount_asc') return a.amount - b.amount;
      return 0;
    });
  }, [filteredRequests, sortOption]);

  // KPI Metrics
  const totalOpenAmount = myActionRequests.reduce((sum, r) => sum + r.amount, 0);
  const totalInProgressAmount = inProgressRequests.reduce((sum, r) => sum + r.amount, 0);
  const totalCompletedAmount = completedRequests.reduce((sum, r) => sum + (r.status === 'paid' ? r.amount : 0), 0);

  return (
    <div className="space-y-6 dir-rtl animate-in fade-in duration-300">
      
      {/* Top Header & KPI Summary */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/20 text-amber-300 rounded-2xl border border-amber-500/30">
              <CheckSquare className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-black text-white">کارتابل تایید و پرداخت خزانه‌داری</h2>
          </div>
          <p className="text-xs text-slate-400">
            بررسی درخواست‌های در انتظار اقدام، درخواست‌های در حال پیگیری و سوابق نهایی‌شده
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-2xl flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-slate-400">نیازمند اقدام من:</span>
            <span className="font-mono font-black text-amber-300">{formatRial(totalOpenAmount)}</span>
          </div>

          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-2xl flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-slate-400">در حال جریان:</span>
            <span className="font-mono font-black text-blue-300">{formatRial(totalInProgressAmount)}</span>
          </div>

          <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-2xl flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-400">مجموع پرداختی:</span>
            <span className="font-mono font-black text-emerald-400">{formatRial(totalCompletedAmount)}</span>
          </div>
        </div>
      </div>

      {/* Sub-Tab Switcher: 3 TABS (Actionable Me | In Progress / Tracked | Closed) */}
      <div className="p-1.5 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-1.5 shadow-inner max-w-3xl mx-auto">
        
        {/* Tab 1: My Action */}
        <button
          onClick={() => setSubTab('open')}
          className={`flex-1 min-w-[200px] py-3 px-3 rounded-xl font-black text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            subTab === 'open'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20 scale-[1.02]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-200 shrink-0" />
          <span>در انتظار اقدام من</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
            subTab === 'open' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
            {myActionRequests.length}
          </span>
        </button>

        {/* Tab 2: In-Progress / Tracked */}
        <button
          onClick={() => setSubTab('in_progress')}
          className={`flex-1 min-w-[200px] py-3 px-3 rounded-xl font-black text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            subTab === 'in_progress'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 scale-[1.02]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <RefreshCw className="w-4 h-4 text-blue-200 shrink-0" />
          <span>در حال پیگیری / اقدام سایرین</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
            subTab === 'in_progress' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
            {inProgressRequests.length}
          </span>
        </button>

        {/* Tab 3: Completed */}
        <button
          onClick={() => setSubTab('completed')}
          className={`flex-1 min-w-[200px] py-3 px-3 rounded-xl font-black text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            subTab === 'completed'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 scale-[1.02]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
          <span>سوابق و پرداخت‌های بسته</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shrink-0 ${
            subTab === 'completed' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
            {completedRequests.length}
          </span>
        </button>

      </div>

      {/* Universal Form Search & Filter Controls */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          
          {/* Main Full-Field Search Bar */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="جستجو بر اساس تمامی فیلدها (کد، عنوان، متقاضی، مرکز هزینه، شبا، کارت، توضیحات...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 text-white text-xs rounded-xl pr-10 pl-3 py-2.5 border border-slate-800 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Company Filter */}
          <div>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 text-xs rounded-xl px-3 py-2.5 border border-slate-800 focus:outline-none focus:border-amber-500 font-bold"
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
              value={selectedCostCenter}
              onChange={(e) => setSelectedCostCenter(e.target.value)}
              className="w-full bg-slate-950 text-slate-200 text-xs rounded-xl px-3 py-2.5 border border-slate-800 focus:outline-none focus:border-amber-500 font-bold"
            >
              <option value="all">همه مراکز هزینه / شعب</option>
              {costCenters.map(cc => (
                <option key={cc.id} value={cc.id}>{cc.name} ({cc.code})</option>
              ))}
            </select>
          </div>

        </div>

        {/* Secondary Row: Date & Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <input
                type="text"
                placeholder="فیلتر تاریخ (مثال: ۱۴۰۳/۰۵)"
                value={dateQuery}
                onChange={(e) => setDateQuery(e.target.value)}
                className="bg-transparent text-white text-xs focus:outline-none w-32 font-mono"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="bg-transparent text-slate-300 text-xs focus:outline-none cursor-pointer font-bold"
              >
                <option value="newest" className="bg-slate-900">جدیدترین</option>
                <option value="oldest" className="bg-slate-900">قدیمی‌ترین</option>
                <option value="amount_desc" className="bg-slate-900">بیشترین مبلغ</option>
                <option value="amount_asc" className="bg-slate-900">کمترین مبلغ</option>
              </select>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-bold">
            نمایش <span className="text-white font-mono font-bold px-1">{sortedRequests.length}</span> مورد از مجموع <span className="text-white font-mono font-bold px-1">{currentTabRequests.length}</span> درخواست
          </div>

        </div>
      </div>

      {/* Main Request Table View */}
      <RequestTableView
        requests={sortedRequests}
        onSelectRequest={onSelectRequest}
        onOpenPrintModal={onOpenPrintModal}
      />

    </div>
  );
};
