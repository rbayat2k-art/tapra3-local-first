import React, { useState } from 'react';
import { PaymentRequest, User, CostCenter, Company } from '../types';
import { RequestTableView } from './RequestTableView';
import { formatRial } from '../utils/numberToWords';
import { 
  FileText, CheckCircle2, Clock, Search, Filter, 
  ArrowUpDown, Calendar, PlusCircle, AlertCircle, XCircle 
} from 'lucide-react';

interface MyRequestsViewProps {
  requests: PaymentRequest[];
  currentUser: User | null;
  costCenters: CostCenter[];
  companies: Company[];
  onOpenNewRequest: () => void;
  onSelectRequest: (req: PaymentRequest) => void;
  onOpenPrintModal: (req: PaymentRequest) => void;
}

export const MyRequestsView: React.FC<MyRequestsViewProps> = ({
  requests,
  currentUser,
  costCenters,
  companies,
  onOpenNewRequest,
  onSelectRequest,
  onOpenPrintModal
}) => {
  const [subTab, setSubTab] = useState<'open' | 'completed'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCostCenter, setSelectedCostCenter] = useState('all');
  const [dateQuery, setDateQuery] = useState('');
  const [sortOption, setSortOption] = useState<'newest' | 'oldest' | 'amount_desc' | 'amount_asc' | 'code'>('newest');

  // Allowed Cost Centers for current user
  const allowedCostCenters = costCenters.filter(cc => {
    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'treasury_executor') return true;
    if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
      return currentUser.allowedCostCenterIds.includes(cc.id);
    }
    if (currentUser.costCenterId) {
      return cc.id === currentUser.costCenterId;
    }
    return true;
  });

  // Base list of user's requests ("درخواست‌های من" means strictly created by this user)
  const myBaseRequests = requests.filter(r => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return r.requestorId === currentUser.id || r.requestorName === currentUser.fullName || r.createdById === currentUser.id;
  });

  // Split into Open vs Completed
  const openRequests = myBaseRequests.filter(r => 
    r.status === 'pending_approval' || r.status === 'approved_pending_payment' || r.status === 'returned'
  );

  const completedRequests = myBaseRequests.filter(r => 
    r.status === 'paid' || r.status === 'rejected' || r.status === 'completed'
  );

  const currentTabRequests = subTab === 'open' ? openRequests : completedRequests;

  // Filter logic
  const filteredRequests = currentTabRequests.filter(r => {
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
      (r.destinationBankName && r.destinationBankName.toLowerCase().includes(query)) ||
      (r.description && r.description.toLowerCase().includes(query)) ||
      (r.amount && r.amount.toString().includes(query)) ||
      (r.amountInWords && r.amountInWords.toLowerCase().includes(query)) ||
      (r.costCenterAllocations && r.costCenterAllocations.some(a => 
        a.costCenterName.toLowerCase().includes(query) || a.companyName.toLowerCase().includes(query)
      ));

    const matchesCostCenter = selectedCostCenter === 'all' || r.costCenterId === selectedCostCenter;

    const matchesDate = !dateQuery || (r.createdAt && r.createdAt.includes(dateQuery));

    return matchesSearch && matchesCostCenter && matchesDate;
  });

  // Sort logic
  const sortedRequests = [...filteredRequests].sort((a, b) => {
    if (sortOption === 'newest') {
      return (b.id || '').localeCompare(a.id || '');
    } else if (sortOption === 'oldest') {
      return (a.id || '').localeCompare(b.id || '');
    } else if (sortOption === 'amount_desc') {
      return b.amount - a.amount;
    } else if (sortOption === 'amount_asc') {
      return a.amount - b.amount;
    } else if (sortOption === 'code') {
      return (a.trackingCode || '').localeCompare(b.trackingCode || '');
    }
    return 0;
  });

  // Total amount calculation for completed tab
  const totalCompletedPaidAmount = completedRequests
    .filter(r => r.status === 'paid')
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6 dir-rtl animate-in fade-in duration-300">
      
      {/* Top Header Card */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <FileText className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-black text-white">درخواست‌های من</h2>
          </div>
          <p className="text-xs text-slate-400">
            پیگیری وضعیت، تفکیک درخواست‌های در جریان کار و پرونده‌های به اتمام رسیده
          </p>
        </div>

        {(currentUser?.role === 'admin' || currentUser?.canCreateRequests !== false) && (
          <button
            onClick={onOpenNewRequest}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs rounded-2xl shadow-lg transition transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>ثبت درخواست جدید</span>
          </button>
        )}
      </div>

      {/* iOS Style Segmented Sub-Tab Switcher */}
      <div className="p-1.5 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center gap-1 shadow-inner max-w-xl mx-auto">
        <button
          onClick={() => setSubTab('open')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            subTab === 'open'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-[1.02]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-300" />
          <span>درخواست‌های باز (در جریان)</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            subTab === 'open' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
            {openRequests.length}
          </span>
        </button>

        <button
          onClick={() => setSubTab('completed')}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            subTab === 'completed'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 scale-[1.02]'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>درخواست‌های به اتمام رسیده</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            subTab === 'completed' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
          }`}>
            {completedRequests.length}
          </span>
        </button>
      </div>

      {/* Completed Summary Banner if in Completed Sub-Tab */}
      {subTab === 'completed' && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white block">خلاصه پرونده‌های به اتمام رسیده</span>
              <span className="text-[10px] text-emerald-200">
                درخواست‌های واریز شده و یا نهایی شده در سیستم
              </span>
            </div>
          </div>
          <div className="bg-slate-900 px-4 py-2 rounded-xl border border-emerald-500/30 font-mono font-bold text-emerald-400">
            مجموع پرداختی‌ها: {formatRial(totalCompletedPaidAmount)}
          </div>
        </div>
      )}

      {/* Filters & Sorting Bar */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          
          {/* Search Query Input */}
          <div className="relative md:col-span-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو بر اساس تمامی فیلدها (کد، عنوان، متقاضی، مرکز هزینه، شبا، کارت، مبلغ، توضیحات...)"
              className="w-full bg-slate-800 text-white text-xs rounded-xl pr-9 pl-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          {/* Cost Center / Branch Filter */}
          <div>
            <select
              value={selectedCostCenter}
              onChange={(e) => setSelectedCostCenter(e.target.value)}
              className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">همه شعب / مراکز هزینه مجاز</option>
              {allowedCostCenters.map(cc => (
                <option key={cc.id} value={cc.id}>{cc.name}</option>
              ))}
            </select>
          </div>

          {/* Date Filter Input */}
          <div className="relative">
            <input
              type="text"
              value={dateQuery}
              onChange={(e) => setDateQuery(e.target.value)}
              placeholder="فیلتر بر اساس تاریخ (مثلاً: ۱۴۰۳/۰۵)"
              className="w-full bg-slate-800 text-white text-xs rounded-xl pr-9 pl-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
            />
            <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          </div>

          {/* Sort Option Dropdown */}
          <div className="relative">
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="newest">سورت: جدیدترین‌ها (اول)</option>
              <option value="oldest">سورت: قدیمی‌ترین‌ها</option>
              <option value="amount_desc">سورت: بیشترین مبلغ</option>
              <option value="amount_asc">سورت: کمترین مبلغ</option>
              <option value="code">سورت: کد پیگیری</option>
            </select>
          </div>

        </div>
      </div>

      {/* Main Request Table / Cards View */}
      <RequestTableView
        requests={sortedRequests}
        onSelectRequest={onSelectRequest}
        onOpenPrintModal={onOpenPrintModal}
      />

    </div>
  );
};
