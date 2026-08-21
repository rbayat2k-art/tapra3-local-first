import React, { useState } from 'react';
import { CostCenter, Company, User, PaymentRequest } from '../types';
import { storage } from '../utils/storage';
import { formatRial } from '../utils/numberToWords';
import { MapPin, Plus, Edit2, Trash2, Building, CheckCircle2, FileText } from 'lucide-react';

interface CostCentersViewProps {
  costCenters: CostCenter[];
  companies: Company[];
  requests: PaymentRequest[];
  currentUser: User | null;
  onUpdateCostCenters: (centers: CostCenter[]) => void;
}

export const CostCentersView: React.FC<CostCentersViewProps> = ({
  costCenters,
  companies,
  requests,
  currentUser,
  onUpdateCostCenters
}) => {
  const isAdmin = currentUser?.role === 'admin';

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCC, setEditingCC] = useState<CostCenter | null>(null);

  // Form States
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [companyId, setCompanyId] = useState(companies[0]?.id || 'comp_sales');
  const [description, setDescription] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState<number>(400000000);

  const handleOpenAdd = () => {
    setName('');
    setCode('');
    setCompanyId(companies[0]?.id || 'comp_sales');
    setDescription('');
    setMonthlyBudget(400000000);
    setShowAddModal(true);
  };

  const handleOpenEdit = (cc: CostCenter) => {
    setEditingCC(cc);
    setName(cc.name);
    setCode(cc.code);
    setCompanyId(cc.companyId);
    setDescription(cc.description || '');
    setMonthlyBudget(cc.monthlyBudget || 400000000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      alert('لطفاً نام مرکز هزینه/شعبه و کد مربوطه را وارد کنید.');
      return;
    }

    if (editingCC) {
      const updated = costCenters.map(c => c.id === editingCC.id ? {
        ...c,
        name: name.trim(),
        code: code.trim(),
        companyId,
        description: description.trim(),
        monthlyBudget: Number(monthlyBudget) || 400000000,
        budgetPeriod: c.budgetPeriod || 'مرداد ۱۴۰۳'
      } : c);
      onUpdateCostCenters(updated);
      storage.saveCostCenters(updated);
      setEditingCC(null);
      alert('اطلاعات مرکز هزینه / شعبه و بودجه مصوب با موفقیت بروزرسانی شد.');
    } else {
      const newCC: CostCenter = {
        id: `cc_${Date.now()}`,
        name: name.trim(),
        code: code.trim(),
        companyId,
        description: description.trim(),
        monthlyBudget: Number(monthlyBudget) || 400000000,
        budgetPeriod: 'مرداد ۱۴۰۳'
      };
      const updated = [...costCenters, newCC];
      onUpdateCostCenters(updated);
      storage.saveCostCenters(updated);
      setShowAddModal(false);
      alert('مرکز هزینه / شعبه جدید با موفقیت اضافه شد.');
    }
  };

  const handleDelete = (cc: CostCenter) => {
    if (currentUser?.role !== 'admin') {
      alert('تنها ادمین ارشد سیستم اجازه حذف شعبه یا مرکز هزینه را دارد.');
      return;
    }

    const linkedRequests = requests.filter(r => r.costCenterId === cc.id);
    const allUsers = storage.getUsers();
    const linkedUsers = allUsers.filter(u => u.costCenterId === cc.id || u.allowedCostCenterIds?.includes(cc.id));

    if (linkedRequests.length > 0 || linkedUsers.length > 0) {
      alert(`امکان حذف شعبه / مرکز هزینه "${cc.name}" وجود ندارد.\n\nتعداد ${linkedRequests.length} درخواست پرداخت و ${linkedUsers.length} کاربر فعال متصل به این شعبه در سیستم ثبت شده‌اند. برای حفظ یکپارچگی مالی، ابتدا وابستگی‌ها را تغییر یا حذف کنید.`);
      return;
    }

    if (confirm(`آیا از حذف کامل شعبه / مرکز هزینه "${cc.name}" اطمینان دارید؟`)) {
      const updated = costCenters.filter(c => c.id !== cc.id);
      onUpdateCostCenters(updated);
      storage.saveCostCenters(updated);
      alert('مرکز هزینه با موفقیت حذف گردید.');
    }
  };

  // Filter cost centers based on User authorization
  const displayedCostCenters = costCenters.filter(cc => {
    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'treasury_executor') return true;
    if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
      return currentUser.allowedCostCenterIds.includes(cc.id);
    }
    if (currentUser.costCenterId) {
      return cc.id === currentUser.costCenterId;
    }
    return true;
  });

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 flex items-center justify-center font-bold">
            <MapPin className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              شعب فروش و مراکز هزینه (Sales Branches & Cost Centers)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {!isAdmin ? 'شعب و مراکز هزینه مجاز جهت ثبت یا بررسی درخواست' : 'مدیریت کل شعب فروش و مراکز هزینه دفتر مرکزی'}
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن شعبه / مرکز هزینه جدید</span>
          </button>
        )}
      </div>

      {/* Grid of Cost Centers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {displayedCostCenters.map((cc) => {
          const comp = companies.find(c => c.id === cc.companyId);
          const ccRequests = requests.filter(r => r.costCenterId === cc.id);
          const ccTotalAmount = ccRequests.reduce((sum, r) => sum + r.amount, 0);

          return (
            <div
              key={cc.id}
              className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 relative group hover:border-amber-500/50 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                    کد: {cc.code}
                  </span>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(cc)}
                        className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
                        title="ویرایش"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(cc)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{cc.name}</span>
                </h3>

                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                  {cc.description || 'شعبه / مرکز هزینه شاواز'}
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1">
                    <Building className="w-3 h-3 text-slate-400" />
                    شرکت مربوطه:
                  </span>
                  <span className="font-bold text-slate-300">{comp?.name || 'شرکت فروش'}</span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-slate-400" />
                    تعداد درخواست:
                  </span>
                  <span className="font-mono font-bold text-indigo-300">{ccRequests.length} فقره</span>
                </div>

                {/* Budget vs Actual Bar */}
                {(() => {
                  const budget = cc.monthlyBudget || 400000000;
                  const usagePercent = Math.round((ccTotalAmount / budget) * 100);
                  let barColor = 'bg-emerald-500';
                  if (usagePercent >= 100) barColor = 'bg-rose-500';
                  else if (usagePercent >= 80) barColor = 'bg-amber-500';

                  return (
                    <div className="p-2 bg-slate-950/60 rounded-xl space-y-1.5 border border-slate-800/80 my-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-bold">پیشرفت مصرف بودجه:</span>
                        <span className="font-mono font-bold text-white">{usagePercent}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>بودجه: {formatRial(budget)}</span>
                        <span className="text-emerald-400">مصرف: {formatRial(ccTotalAmount)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal for Add/Edit Cost Center */}
      {(showAddModal || editingCC) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-base font-bold text-white">
              {editingCC ? 'ویرایش مرکز هزینه / شعبه' : 'افزودن مرکز هزینه / شعبه جدید'}
            </h3>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نام شعبه / مرکز هزینه</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="مثال: شعبه سعادت آباد، پونک شب، مخبری ۱..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">کد مرکز هزینه</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  placeholder="مثال: CC-108"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">شرکت مربوطه</label>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">بودجه مصوب ماهانه شعبه (ریال)</label>
                <input
                  type="number"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                  placeholder="400000000"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <span className="text-[10px] text-emerald-400 mt-1 block font-bold">
                  {formatRial(monthlyBudget)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">توضیحات</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="توضیحات شعبه..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingCC(null);
                  }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  {editingCC ? 'بروزرسانی' : 'ذخیره شعبه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
