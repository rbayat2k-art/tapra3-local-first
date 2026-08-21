import React, { useState } from 'react';
import { WorkflowStepRule, User } from '../types';
import { 
  GitFork, ArrowDown, ShieldCheck, UserCheck, 
  CreditCard, Sparkles, CheckCircle2, Phone, 
  Users, ArrowLeft, Edit2, ShieldAlert, Check, ChevronLeft 
} from 'lucide-react';

interface WorkflowChartViewProps {
  workflowSteps: WorkflowStepRule[];
  users: User[];
  currentUser: User | null;
  onUpdateUsers?: (updated: User[]) => void;
}

export const WorkflowChartView: React.FC<WorkflowChartViewProps> = ({
  workflowSteps,
  users,
  currentUser,
  onUpdateUsers
}) => {
  const [activeTab, setActiveTab] = useState<'flowchart' | 'matrix'>('flowchart');
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<User | null>(null);

  // Quick workflow edit modal state
  const [step1Id, setStep1Id] = useState<string>('');
  const [step2Id, setStep2Id] = useState<string>('user_admin_reza');
  const [step3Id, setStep3Id] = useState<string>('user_treasury_exec');
  const [allowDirect, setAllowDirect] = useState<boolean>(true);
  const [noteText, setNoteText] = useState<string>('');

  const handleOpenEditWorkflow = (u: User) => {
    setSelectedUserForEdit(u);
    setStep1Id(u.approvalChain?.[0] || 'user_approver_sales');
    setStep2Id(u.approvalChain?.[1] || 'user_admin_reza');
    setStep3Id(u.approvalChain?.[2] || 'user_treasury_exec');
    setAllowDirect(u.allowDirectToTreasury ?? true);
    setNoteText(u.workflowNote || '');
  };

  const handleSaveUserWorkflow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForEdit || !onUpdateUsers) return;

    const chain = [step1Id, step2Id, step3Id].filter(Boolean);

    const updated = users.map(u => u.id === selectedUserForEdit.id ? {
      ...u,
      approvalChain: chain,
      allowDirectToTreasury: allowDirect,
      workflowNote: noteText.trim()
    } : u);

    onUpdateUsers(updated);
    setSelectedUserForEdit(null);
    alert(`گردش کار و سلسله‌مراتب تایید برای "${selectedUserForEdit.fullName}" بروزرسانی شد.`);
  };

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center font-bold">
            <GitFork className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              چارت گردش کار و تعیین سلسله‌مراتب تاییدات (Workflow & Approvals)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              تنظیم و مشاهده دونه به دونه مسیر ارجاع درخواست‌های پرداخت برای هر کاربر و دسترسی از ابتدا تا انتها
            </p>
          </div>
        </div>

        {/* View Selector Tabs */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setActiveTab('flowchart')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'flowchart' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitFork className="w-4 h-4" />
            <span>چارت تصویری کلی</span>
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'matrix' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>ماتریس تاییدات به تفکیک کاربر ({users.length})</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Visual Flowchart Diagram */}
      {activeTab === 'flowchart' && (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center space-y-6 relative overflow-hidden">
          
          <div className="max-w-xl mx-auto space-y-6">
            
            {/* Step 1 */}
            <div className="p-5 bg-slate-950 border-2 border-indigo-500/40 rounded-2xl shadow-lg relative group text-right">
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow">
                  ۱
                </span>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/20 font-bold">
                  مرحله اول: ثبت درخواست
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-white">ثبت اولیه توسط پرسنل و مسئولین خرید شعب</h3>
              <p className="text-xs text-slate-400 mt-1">
                ثبت مبلغ به ریال، شماره کارت مقصد، انتخاب مرکز هزینه و آپلود فاکتور و صورت‌حساب‌ها
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {users.filter(u => u.role === 'requestor').map(u => (
                  <span key={u.id} className="text-[10px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700">
                    {u.fullName} ({u.costCenterId || 'شعبه'})
                  </span>
                ))}
              </div>
            </div>

            <ArrowDown className="w-6 h-6 text-indigo-400 mx-auto animate-bounce" />

            {/* Decision / Routing Box */}
            <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-xs text-indigo-200 text-right space-y-1">
              <div className="font-extrabold flex items-center gap-1.5 text-indigo-300">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>مسیرهای هوشمند ارجاع درخواست:</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                درخواست‌کننده می‌تواند طبق دسترسی تعیین‌شده، درخواست را برای مدیر مستقیم شعب (مهندس احمدی) یا در ۵۰٪ مواقع به صورت مستقیم برای <strong>رضا بیات (مدیر خزانه‌داری)</strong> ارسال کند.
              </p>
            </div>

            <ArrowDown className="w-6 h-6 text-indigo-400 mx-auto" />

            {/* Step 2 */}
            <div className="p-5 bg-slate-950 border-2 border-amber-500/40 rounded-2xl shadow-lg text-right">
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center shadow">
                  ۲
                </span>
                <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/20 font-bold">
                  مرحله دوم: بررسی و تایید مالی
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-amber-300">تایید نهایی و تخصیص بودجه خزانه‌داری</h3>
              <p className="text-xs text-slate-400 mt-1">
                بررسی صحت فاکتور، بودجه مرکز هزینه، تایید مبلغ به حروف و صدور دستور پرداخت
              </p>
              <div className="mt-3 p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-xs font-bold text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>رضا بیات (مدیر ارشد خزانه‌داری)</span>
                </div>
                <span className="text-slate-400 text-[11px]">۰۹۳۳۰۲۹۷۷۸۴</span>
              </div>
            </div>

            <ArrowDown className="w-6 h-6 text-emerald-400 mx-auto" />

            {/* Step 3 */}
            <div className="p-5 bg-slate-950 border-2 border-emerald-500/40 rounded-2xl shadow-lg text-right">
              <div className="flex items-center justify-between mb-2">
                <span className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center shadow">
                  ۳
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold">
                  مرحله سوم: اجرای پرداخت بانکی
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-emerald-300">اجرای واریز بانکی و آپلود فیش پایا / کارت به کارت</h3>
              <p className="text-xs text-slate-400 mt-1">
                صدور واریز بانکی و آپلود تصویر فیش واریز نهایی جهت تکمیل پرونده و بایگانی
              </p>
              <div className="mt-3 p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-xs font-bold text-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <span>امیرحسین رضایی (کارمند اجرای خزانه‌داری)</span>
                </div>
                <span className="text-slate-400 text-[11px]">۰۹۱۲۱۱۱۲۲۳۳</span>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Tab 2: User Workflow Matrix Table */}
      {activeTab === 'matrix' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>ماتریس و روند تاییدات اختصاصی هر کاربر (User Approval Routes)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                تعیین شده توسط ادمین ارشد: زنجیره تایید دونه به دونه از مرحله اول تا واریز نهایی
              </p>
            </div>

            {currentUser?.role === 'admin' && (
              <span className="text-xs bg-amber-500/10 text-amber-300 px-3 py-1.5 rounded-xl border border-amber-500/20 font-bold">
                * شما ادمین هستید و می‌توانید مسیر هر کاربر را دکمه ویرایش تغییر دهید.
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5">کاربر / درخواست‌کننده</th>
                  <th className="p-3.5">نقش سیستم</th>
                  <th className="p-3.5">سلسله‌مراتب تاییدات (ابتدا تا انتها)</th>
                  <th className="p-3.5">ارسال مستقیم خزانه‌داری</th>
                  <th className="p-3.5">توضیحات و دستورالعمل</th>
                  {currentUser?.role === 'admin' && <th className="p-3.5 text-center">عملیات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => {
                  const chainUserIds = u.approvalChain || ['user_approver_sales', 'user_admin_reza', 'user_treasury_exec'];
                  const chainUserObjs = chainUserIds.map(id => users.find(x => x.id === id)).filter(Boolean);

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="p-3.5 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-300 font-bold flex items-center justify-center shrink-0">
                            {u.fullName.slice(0, 1)}
                          </div>
                          <div>
                            <div>{u.fullName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{u.phone}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span className="font-bold text-slate-200 block">{u.roleTitle}</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/50">
                          {u.role === 'admin' ? 'ادمین' : u.role === 'approver' ? 'تاییدکننده' : u.role === 'treasury_executor' ? 'مجری' : 'درخواست‌کننده'}
                        </span>
                      </td>

                      {/* Approval Sequence Visualization */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {chainUserObjs.map((approver, idx) => (
                            <React.Fragment key={approver?.id || idx}>
                              <span className="px-2 py-1 bg-slate-950 text-slate-200 font-bold text-[11px] rounded-lg border border-slate-800 flex items-center gap-1">
                                <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center">
                                  {idx + 1}
                                </span>
                                <span>{approver?.fullName || 'تاییدکننده'}</span>
                              </span>
                              {idx < chainUserObjs.length - 1 && (
                                <ChevronLeft className="w-4 h-4 text-indigo-400 shrink-0" />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          u.allowDirectToTreasury ?? true 
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {u.allowDirectToTreasury ?? true ? 'مجاز (مستقیم به رضا بیات)' : 'فقط از طریق سرپرست'}
                        </span>
                      </td>

                      <td className="p-3.5 max-w-[200px]">
                        <p className="text-[11px] text-slate-400 truncate">
                          {u.workflowNote || 'طابق فرم گردش کار استاندارد'}
                        </p>
                      </td>

                      {currentUser?.role === 'admin' && (
                        <td className="p-3.5 text-center">
                          <button
                            onClick={() => handleOpenEditWorkflow(u)}
                            className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span>ویرایش مسیر</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick User Workflow Modal */}
      {selectedUserForEdit && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <GitFork className="w-4 h-4 text-indigo-400" />
              <span>ویرایش سلسله‌مراتب تایید برای: {selectedUserForEdit.fullName}</span>
            </h3>

            <form onSubmit={handleSaveUserWorkflow} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  مرحله ۱: تاییدکننده اول (سرپرست/مدیر)
                </label>
                <select
                  value={step1Id}
                  onChange={(e) => setStep1Id(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                >
                  <option value="">بدون تایید اول (ارسال مستقیم به خزانه‌داری)</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  مرحله ۲: مدیر خزانه‌داری (رضا بیات)
                </label>
                <select
                  value={step2Id}
                  onChange={(e) => setStep2Id(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  مرحله ۳: کارمند اجرای واریز بانکی (امیرحسین رضایی)
                </label>
                <select
                  value={step3Id}
                  onChange={(e) => setStep3Id(e.target.value)}
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.roleTitle})</option>
                  ))}
                </select>
              </div>

              <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="modal-direct-treasury"
                  checked={allowDirect}
                  onChange={(e) => setAllowDirect(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-700 bg-slate-800"
                />
                <label htmlFor="modal-direct-treasury" className="text-xs font-bold text-indigo-200 cursor-pointer">
                  اجازه ارسال مستقیم درخواست به رضا بیات
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  دستورالعمل اجرایی اختصاصی
                </label>
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="ملاحظات و قوانین اختصاصی..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedUserForEdit(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  ذخیره تغییرات چارت
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
