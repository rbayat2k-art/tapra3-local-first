import React, { useState } from 'react';
import { Company, CompanyBankAccount, User } from '../types';
import { storage } from '../utils/storage';
import { Building, Plus, Edit2, Trash2, CheckCircle2, CreditCard, Search, Landmark, ShieldCheck, XCircle, MapPin } from 'lucide-react';

interface CompaniesViewProps {
  companies: Company[];
  companyBankAccounts?: CompanyBankAccount[];
  currentUser: User | null;
  onUpdateCompanies: (companies: Company[]) => void;
  onUpdateCompanyBankAccounts?: (accounts: CompanyBankAccount[]) => void;
  serverManagedCompanies?: boolean;
}

const COMMON_BANKS = [
  'بانک ملت',
  'بانک ملی ایران',
  'بانک سامان',
  'بانک پاسارگاد',
  'بانک تجارت',
  'بانک پارسیان',
  'بانک صادرات ایران',
  'بانک سپه',
  'بانک رفاه کارگران',
  'بانک کشاورزی',
  'بانک مسکن',
  'بانک آینده',
  'بانک سینا',
  'بانک اقتصاد نوین',
  'بانک کارآفرین'
];

export const CompaniesView: React.FC<CompaniesViewProps> = ({
  companies,
  companyBankAccounts: propAccounts,
  currentUser,
  onUpdateCompanies,
  onUpdateCompanyBankAccounts,
  serverManagedCompanies = false,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  // Sub-tab State
  const [activeTab, setActiveTab] = useState<'companies' | 'bank_accounts'>('bank_accounts');

  // Local State for Bank Accounts
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>(() => {
    return propAccounts || storage.getCompanyBankAccounts();
  });

  const updateAccountsList = (updated: CompanyBankAccount[]) => {
    setBankAccounts(updated);
    storage.saveCompanyBankAccounts(updated);
    if (onUpdateCompanyBankAccounts) {
      onUpdateCompanyBankAccounts(updated);
    }
  };

  // Search & Filter States for Bank Accounts
  const [accountSearch, setAccountSearch] = useState('');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('all');

  // Company Modal States
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [companyDesc, setCompanyDesc] = useState('');

  // Bank Account Modal States
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CompanyBankAccount | null>(null);
  const [accCompanyId, setAccCompanyId] = useState('');
  const [accBankName, setAccBankName] = useState('بانک ملت');
  const [accTitle, setAccTitle] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accSheba, setAccSheba] = useState('');
  const [accCard, setAccCard] = useState('');
  const [accIsActive, setAccIsActive] = useState(true);

  // --- Handlers for Companies ---
  const handleOpenAddCompany = () => {
    setCompanyName('');
    setCompanyCode('');
    setCompanyDesc('');
    setShowAddCompanyModal(true);
  };

  const handleOpenEditCompany = (comp: Company) => {
    setEditingCompany(comp);
    setCompanyName(comp.name);
    setCompanyCode(comp.code);
    setCompanyDesc(comp.description);
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !companyCode.trim()) {
      alert('لطفاً نام شرکت و کد اختصاری را وارد کنید.');
      return;
    }

    if (editingCompany) {
      const updated = companies.map(c => c.id === editingCompany.id ? {
        ...c,
        name: companyName.trim(),
        code: companyCode.trim(),
        description: companyDesc.trim()
      } : c);
      onUpdateCompanies(updated);
      storage.saveCompanies(updated);
      setEditingCompany(null);
      alert('اطلاعات شرکت با موفقیت بروزرسانی شد.');
    } else {
      const newComp: Company = {
        id: `comp_${Date.now()}`,
        name: companyName.trim(),
        code: companyCode.trim(),
        description: companyDesc.trim()
      };
      const updated = [...companies, newComp];
      onUpdateCompanies(updated);
      storage.saveCompanies(updated);
      setShowAddCompanyModal(false);
      alert('شرکت جدید با موفقیت اضافه شد.');
    }
  };

  const handleDeleteCompany = (comp: Company) => {
    if (!isAdmin) {
      alert('تنها مدیر سیستم اجازه حذف شرکت‌ها را دارد.');
      return;
    }

    const linkedCostCenters = storage.getCostCenters().filter(cc => cc.companyId === comp.id);
    const linkedRequests = storage.getRequests().filter(r => r.companyId === comp.id);

    if (linkedCostCenters.length > 0 || linkedRequests.length > 0) {
      alert(`امکان حذف شرکت "${comp.name}" وجود ندارد.\n\nتعداد ${linkedCostCenters.length} شعبه/مرکز هزینه و ${linkedRequests.length} فاکتور/درخواست فعال متصل به این شرکت در سیستم وجود دارند.`);
      return;
    }

    if (confirm(`آیا از حذف کامل شرکت "${comp.name}" اطمینان دارید؟`)) {
      const updated = companies.filter(c => c.id !== comp.id);
      onUpdateCompanies(updated);
      storage.saveCompanies(updated);
      alert('شرکت با موفقیت حذف گردید.');
    }
  };

  // --- Handlers for Company Bank Accounts ---
  const handleOpenAddAccount = () => {
    setEditingAccount(null);
    setAccCompanyId(companies[0]?.id || '');
    setAccBankName('بانک ملت');
    setAccTitle('حساب جاری و درآمدی اصلی');
    setAccNumber('');
    setAccSheba('');
    setAccCard('');
    setAccIsActive(true);
    setShowAddAccountModal(true);
  };

  const handleOpenEditAccount = (acc: CompanyBankAccount) => {
    setEditingAccount(acc);
    setAccCompanyId(acc.companyId);
    setAccBankName(acc.bankName);
    setAccTitle(acc.accountTitle);
    setAccNumber(acc.accountNumber);
    setAccSheba(acc.shebaNumber);
    setAccCard(acc.cardNumber || '');
    setAccIsActive(acc.isActive);
    setShowAddAccountModal(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accCompanyId || !accBankName.trim() || !accNumber.trim()) {
      alert('لطفاً شرکت، نام بانک و شماره حساب را وارد نمایید.');
      return;
    }

    const compObj = companies.find(c => c.id === accCompanyId);
    const compName = compObj ? compObj.name : 'شرکت';

    // Format Sheba if typed without IR
    let formattedSheba = accSheba.trim().toUpperCase();
    if (formattedSheba && !formattedSheba.startsWith('IR')) {
      formattedSheba = `IR${formattedSheba}`;
    }

    if (editingAccount) {
      const updated = bankAccounts.map(a => a.id === editingAccount.id ? {
        ...a,
        companyId: accCompanyId,
        companyName: compName,
        bankName: accBankName.trim(),
        accountTitle: accTitle.trim() || 'حساب بانکی شرکت',
        accountNumber: accNumber.trim(),
        shebaNumber: formattedSheba,
        cardNumber: accCard.trim(),
        isActive: accIsActive
      } : a);
      updateAccountsList(updated);
      setShowAddAccountModal(false);
      setEditingAccount(null);
      alert('شماره حساب بانکی با موفقیت بروزرسانی شد.');
    } else {
      const newAcc: CompanyBankAccount = {
        id: `cba_${Date.now()}`,
        companyId: accCompanyId,
        companyName: compName,
        bankName: accBankName.trim(),
        accountTitle: accTitle.trim() || 'حساب بانکی شرکت',
        accountNumber: accNumber.trim(),
        shebaNumber: formattedSheba,
        cardNumber: accCard.trim(),
        isActive: accIsActive
      };
      const updated = [newAcc, ...bankAccounts];
      updateAccountsList(updated);
      setShowAddAccountModal(false);
      alert('شماره حساب بانکی جدید با موفقیت اضافه شد.');
    }
  };

  const handleDeleteAccount = (acc: CompanyBankAccount) => {
    if (!isAdmin) {
      alert('تنها مدیر سیستم اجازه حذف شماره حساب‌های شرکت را دارد.');
      return;
    }

    if (confirm(`آیا از حذف شماره حساب "${acc.accountNumber}" (${acc.bankName} - ${acc.companyName}) اطمینان دارید؟`)) {
      const updated = bankAccounts.filter(a => a.id !== acc.id);
      updateAccountsList(updated);
      alert('شماره حساب بانکی با موفقیت حذف شد.');
    }
  };

  const handleToggleAccountActive = (acc: CompanyBankAccount) => {
    const updated = bankAccounts.map(a => a.id === acc.id ? { ...a, isActive: !a.isActive } : a);
    updateAccountsList(updated);
  };

  // Filtered Bank Accounts
  const filteredAccounts = bankAccounts.filter(acc => {
    const matchesCompany = selectedCompanyFilter === 'all' || acc.companyId === selectedCompanyFilter;
    const term = accountSearch.trim().toLowerCase();
    const matchesSearch = !term || 
      acc.companyName.toLowerCase().includes(term) ||
      acc.bankName.toLowerCase().includes(term) ||
      acc.accountTitle.toLowerCase().includes(term) ||
      acc.accountNumber.toLowerCase().includes(term) ||
      acc.shebaNumber.toLowerCase().includes(term) ||
      (acc.cardNumber && acc.cardNumber.toLowerCase().includes(term));

    return matchesCompany && matchesSearch;
  });

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Header & Section Navigation */}
      <div className="p-6 bg-slate-900 dark:bg-slate-900 border border-slate-800 dark:border-slate-800 rounded-3xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center font-bold">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              مدیریت شرکت‌ها و حساب‌های بانکی هلدینگ tapra
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              ثبت و نظارت بر کلیه شماره حساب‌های بانکی رسمی، درگاه‌ها و شرکت‌های حقوقی گروه
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div>
          {activeTab === 'bank_accounts' ? (
            <button
              onClick={handleOpenAddAccount}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن شماره حساب جدید</span>
            </button>
          ) : (
            isAdmin && !serverManagedCompanies && (
              <button
                onClick={handleOpenAddCompany}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن شرکت جدید</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('bank_accounts')}
          className={`px-5 py-2.5 text-xs font-black rounded-xl transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'bank_accounts'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>حساب‌های بانکی شرکت‌ها ({bankAccounts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('companies')}
          className={`px-5 py-2.5 text-xs font-black rounded-xl transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'companies'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
              : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>فهرست شرکت‌های حقوقی ({companies.length})</span>
        </button>
      </div>

      {/* SECTION 1: COMPANY BANK ACCOUNTS */}
      {activeTab === 'bank_accounts' && (
        <div className="space-y-4">
          
          {/* Search & Filter Bar */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500 absolute right-3 top-3" />
              <input
                type="text"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="جستجو در شماره حساب، شبا، نام بانک یا شرکت..."
                className="w-full bg-slate-950 text-white text-xs rounded-xl pr-9 pl-3 py-2 border border-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-bold shrink-0">شرکت:</span>
              <select
                value={selectedCompanyFilter}
                onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                className="bg-slate-950 text-white text-xs rounded-xl px-3 py-2 border border-slate-800 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">همه شرکت‌ها ({bankAccounts.length})</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Accounts Grid */}
          {filteredAccounts.length === 0 ? (
            <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs space-y-2">
              <CreditCard className="w-8 h-8 text-slate-600 mx-auto" />
              <p>هیچ شماره حساب بانکی منطبق با جستجوی شما یافت نشد.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`p-5 rounded-2xl border transition space-y-3 relative ${
                    acc.isActive 
                      ? 'bg-slate-900 border-slate-800 hover:border-emerald-500/50' 
                      : 'bg-slate-950/80 border-slate-800/80 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
                      {acc.companyName}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleAccountActive(acc)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md cursor-pointer transition ${
                          acc.isActive 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                        }`}
                        title="تغییر وضعیت فعال/مسدود"
                      >
                        {acc.isActive ? 'فعال' : 'غیرفعال'}
                      </button>

                      <button
                        onClick={() => handleOpenEditAccount(acc)}
                        className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition"
                        title="ویرایش حساب"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteAccount(acc)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                          title="حذف حساب"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-white font-bold text-sm">
                      <Landmark className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{acc.bankName}</span>
                    </div>
                    <p className="text-xs text-slate-400">{acc.accountTitle}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs font-mono">
                    <div className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                      <span className="text-slate-500 text-[10px]">شماره حساب:</span>
                      <span className="text-emerald-300 font-bold dir-ltr">{acc.accountNumber}</span>
                    </div>

                    {acc.shebaNumber && (
                      <div className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 text-[10px]">شماره شبا:</span>
                        <span className="text-sky-300 font-bold dir-ltr text-[11px]">{acc.shebaNumber}</span>
                      </div>
                    )}

                    {acc.cardNumber && (
                      <div className="flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                        <span className="text-slate-500 text-[10px]">شماره کارت:</span>
                        <span className="text-amber-300 font-bold dir-ltr text-[11px]">{acc.cardNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: COMPANIES LIST */}
      {activeTab === 'companies' && (
        <div className="space-y-3">
          {serverManagedCompanies && <div className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200">ایجاد، ویرایش و فعال‌سازی Company اکنون فقط از «سازمان و مدیریت» و Backend انجام می‌شود. داده بانکی legacy در این صفحه حفظ شده است.</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((comp) => (
            <div
              key={comp.id}
              className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 relative group hover:border-indigo-500/50 transition"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
                  کد: {comp.code}
                </span>

                {isAdmin && !serverManagedCompanies && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditCompany(comp)}
                      className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
                      title="ویرایش"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCompany(comp)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Building className="w-4 h-4 text-indigo-400" />
                {comp.name}
              </h3>

              <p className="text-xs text-slate-400 leading-relaxed">
                {comp.description || 'توضیحاتی برای این شرکت ثبت نشده است.'}
              </p>

              {/* Linked Cost Centers / Branches List */}
              {(() => {
                const linkedCostCenters = storage.getCostCenters().filter(cc => cc.companyId === comp.id);
                return (
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-amber-300">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400" />
                        مراکز هزینه زیرمجموعه ({linkedCostCenters.length})
                      </span>
                    </div>

                    {linkedCostCenters.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-0.5">
                        {linkedCostCenters.map(cc => (
                          <span key={cc.id} className="text-[11px] bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
                            <span className="font-bold text-amber-300">{cc.name}</span>
                            <span className="text-[9px] text-slate-400 font-mono font-bold">({cc.code})</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-500 italic block">هیچ مرکز هزینه‌ای برای این شرکت تعریف نشده است.</span>
                    )}
                  </div>
                );
              })()}

              <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
                <span>تعداد حساب‌های متصل: {bankAccounts.filter(a => a.companyId === comp.id).length}</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  فعال در سیستم
                </span>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Modal for Add/Edit Company Bank Account */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-400" />
              <span>{editingAccount ? 'ویرایش شماره حساب بانکی' : 'افزودن شماره حساب بانکی جدید شرکت'}</span>
            </h3>

            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">شرکت مالکان حساب</label>
                <select
                  value={accCompanyId}
                  onChange={(e) => setAccCompanyId(e.target.value)}
                  required
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نام بانک</label>
                <input
                  type="text"
                  value={accBankName}
                  onChange={(e) => setAccBankName(e.target.value)}
                  required
                  placeholder="مثال: بانک ملت، بانک ملی، بانک سامان..."
                  list="common-banks-list"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-emerald-500"
                />
                <datalist id="common-banks-list">
                  {COMMON_BANKS.map((b, i) => (
                    <option key={i} value={b} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">عنوان / کاربرد حساب</label>
                <input
                  type="text"
                  value={accTitle}
                  onChange={(e) => setAccTitle(e.target.value)}
                  required
                  placeholder="مثال: حساب درگاه آنلاین، حساب مسدودی پلتفرم، حساب اصلی"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">شماره حساب بانکی</label>
                  <input
                    type="text"
                    value={accNumber}
                    onChange={(e) => setAccNumber(e.target.value)}
                    required
                    placeholder="مثال: 021983741002"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-emerald-500 font-mono dir-ltr text-right"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">شماره کارت (اختیاری)</label>
                  <input
                    type="text"
                    value={accCard}
                    onChange={(e) => setAccCard(e.target.value)}
                    placeholder="مثال: 6104-3378-..."
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-emerald-500 font-mono dir-ltr text-right"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">شماره شبا (۲۴ رقمی - با یا بدون IR)</label>
                <input
                  type="text"
                  value={accSheba}
                  onChange={(e) => setAccSheba(e.target.value)}
                  placeholder="IR890120000000021983741002"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-emerald-500 font-mono dir-ltr text-right"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="accIsActiveChk"
                  checked={accIsActive}
                  onChange={(e) => setAccIsActive(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
                <label htmlFor="accIsActiveChk" className="text-xs text-slate-300 font-bold cursor-pointer">
                  این شماره حساب فعال است (قابل انتخاب در پرونده‌های مسدودی و سیستم)
                </label>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
                >
                  {editingAccount ? 'بروزرسانی حساب' : 'ذخیره شماره حساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for Add/Edit Company */}
      {!serverManagedCompanies && (showAddCompanyModal || editingCompany) && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-6 text-right space-y-4 max-h-[90vh] overflow-y-auto my-8">
            <h3 className="text-base font-bold text-white">
              {editingCompany ? 'ویرایش شرکت' : 'افزودن شرکت جدید'}
            </h3>

            <form onSubmit={handleSaveCompany} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">نام شرکت</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  placeholder="مثال: شرکت شاواز آنلاین"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">کد اختصاری</label>
                <input
                  type="text"
                  value={companyCode}
                  onChange={(e) => setCompanyCode(e.target.value)}
                  required
                  placeholder="مثال: SHV"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">توضیحات و حوزه فعالیت</label>
                <textarea
                  value={companyDesc}
                  onChange={(e) => setCompanyDesc(e.target.value)}
                  rows={3}
                  placeholder="توضیحات مختصر در مورد این شرکت..."
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCompanyModal(false);
                    setEditingCompany(null);
                  }}
                  className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer"
                >
                  {editingCompany ? 'بروزرسانی' : 'ذخیره شرکت'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
