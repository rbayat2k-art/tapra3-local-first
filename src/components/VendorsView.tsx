import React, { useState } from 'react';
import { 
  Users, Plus, Search, Building2, Phone, CreditCard, 
  MapPin, FileText, CheckCircle2, Edit2, Trash2, Copy, 
  ExternalLink, Sparkles, Filter, Store, Banknote, ShieldAlert,
  Download, Upload, FileSpreadsheet, X
} from 'lucide-react';
import { Vendor, PaymentRequest, User, VendorCategory, Company } from '../types';
import { formatRial } from '../utils/numberToWords';

interface VendorsViewProps {
  vendors: Vendor[];
  requests: PaymentRequest[];
  currentUser: User | null;
  companies: Company[];
  onUpdateVendors: (vendors: Vendor[]) => void;
  vendorCategories: VendorCategory[];
  onUpdateVendorCategories: (categories: VendorCategory[]) => void;
  onOpenNewRequestWithVendor?: (vendor: Vendor) => void;
}

export const VendorsView: React.FC<VendorsViewProps> = ({
  vendors,
  requests,
  currentUser,
  companies,
  onUpdateVendors,
  vendorCategories,
  onUpdateVendorCategories,
  onOpenNewRequestWithVendor
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBatchImportModalOpen, setIsBatchImportModalOpen] = useState(false);
  const [batchCsvText, setBatchCsvText] = useState('');
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [selectedVendorForHistory, setSelectedVendorForHistory] = useState<Vendor | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inline "add new category" state for the vendor form
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Form State for Add/Edit
  const [formData, setFormData] = useState({
    name: '',
    category: 'شوینده و تنظیفات',
    companyId: '',
    nationalCode: '',
    economicCode: '',
    shebaNumber: '',
    cardNumber: '',
    accountNumber: '',
    bankName: 'بانک ملت',
    accountHolderName: '',
    phone: '',
    address: '',
    notes: ''
  });

  // Persistent category names (managed by admin/users), plus any legacy category strings
  // already used on vendors that aren't in the store yet (backward compatibility)
  const categoryNames = vendorCategories.map(c => c.name);
  const legacyCategoryNames = Array.from(new Set(vendors.map(v => v.category))).filter(
    (c): c is string => Boolean(c) && !categoryNames.includes(c)
  );
  const categories = [...categoryNames, ...legacyCategoryNames];

  const handleAddCategory = () => {
    if (!(currentUser?.role === 'admin' || currentUser?.customPermissions?.includes('manage_vendors'))) return;
    const name = newCategoryName.trim();
    if (!name) return;
    if (vendorCategories.some(c => c.name === name)) {
      setFormData(prev => ({ ...prev, category: name }));
      setNewCategoryName('');
      setIsAddingCategory(false);
      return;
    }
    const newCat: VendorCategory = { id: `vcat_${Date.now()}`, name };
    onUpdateVendorCategories([...vendorCategories, newCat]);
    setFormData(prev => ({ ...prev, category: name }));
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const filteredVendors = vendors.filter(v => {
    const matchesSearch = 
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.accountHolderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.shebaNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.phone.includes(searchTerm);
    const matchesCategory = selectedCategory === 'all' || v.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenAddModal = () => {
    setEditingVendor(null);
    setFormData({
      name: '',
      category: vendorCategories[0]?.name || 'سایر',
      companyId: '',
      nationalCode: '',
      economicCode: '',
      shebaNumber: 'IR',
      cardNumber: '',
      accountNumber: '',
      bankName: 'بانک ملت',
      accountHolderName: '',
      phone: '',
      address: '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (v: Vendor) => {
    setEditingVendor(v);
    setFormData({
      name: v.name,
      category: v.category,
      companyId: v.companyId || '',
      nationalCode: v.nationalCode || '',
      economicCode: v.economicCode || '',
      shebaNumber: v.shebaNumber || 'IR',
      cardNumber: v.cardNumber || '',
      accountNumber: v.accountNumber || '',
      bankName: v.bankName || 'بانک ملت',
      accountHolderName: v.accountHolderName,
      phone: v.phone,
      address: v.address || '',
      notes: v.notes || ''
    });
    setIsModalOpen(true);
  };

  const handleSaveVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.accountHolderName.trim() || !formData.shebaNumber.trim()) {
      alert('لطفاً نام ذینفع، نام صاحب حساب و شماره شبا را تکمیل نمایید.');
      return;
    }

    let formatSheba = formData.shebaNumber.trim().toUpperCase();
    if (!formatSheba.startsWith('IR')) {
      formatSheba = 'IR' + formatSheba;
    }

    const selectedCompany = companies.find(c => c.id === formData.companyId);

    if (editingVendor) {
      const updated = vendors.map(v => v.id === editingVendor.id ? {
        ...v,
        name: formData.name.trim(),
        category: formData.category,
        companyId: formData.companyId || undefined,
        companyName: selectedCompany?.name,
        nationalCode: formData.nationalCode.trim(),
        economicCode: formData.economicCode.trim(),
        shebaNumber: formatSheba,
        cardNumber: formData.cardNumber.trim(),
        accountNumber: formData.accountNumber.trim(),
        bankName: formData.bankName,
        accountHolderName: formData.accountHolderName.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        notes: formData.notes.trim()
      } : v);
      onUpdateVendors(updated);
    } else {
      const newVendor: Vendor = {
        id: `vendor_${Date.now()}`,
        name: formData.name.trim(),
        category: formData.category,
        companyId: formData.companyId || undefined,
        companyName: selectedCompany?.name,
        nationalCode: formData.nationalCode.trim(),
        economicCode: formData.economicCode.trim(),
        shebaNumber: formatSheba,
        cardNumber: formData.cardNumber.trim(),
        accountNumber: formData.accountNumber.trim(),
        bankName: formData.bankName,
        accountHolderName: formData.accountHolderName.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        notes: formData.notes.trim(),
        totalPaid: 0,
        transactionCount: 0
      };
      onUpdateVendors([newVendor, ...vendors]);
    }

    setIsModalOpen(false);
  };

  const handleDeleteVendor = (id: string, name: string) => {
    if (confirm(`آیا از حذف فروشنده/ذینفع "${name}" اطمینان دارید؟`)) {
      onUpdateVendors(vendors.filter(v => v.id !== id));
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Download Sample Excel/CSV Template
  const handleDownloadTemplate = () => {
    const csvContent = "\uFEFFنام ذینفع / پرسنل,دسته‌بندی,صاحب حساب,شماره شبا (با IR),شماره کارت,شماره حساب,نام بانک,شماره تلفن,شناسه ملی\n" +
      "رضا محمدی (پرسنل حقوق),پرسنل و حقوق,رضا محمدی,IR120170000000109283740001,6037991822348891,109283740001,بانک ملی ایران,09121112233,0012345678\n" +
      "علی اکبر صفی (پرسنل فروش),پرسنل و حقوق,علی اکبر صفی,IR450120000000309182739001,6104337890124455,309182739001,بانک ملت,09123334455,0023456789\n" +
      "شرکت تجهیزات ابزار البرز,تجهیزات انبار و فروشگاهی,شرکت تجهیزات البرز,IR89012000000021983746002,5892101122334455,21983746002,بانک ملت,02166554433,10103829102\n";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'نمونه_الگوی_ورود_گروهی_شماره_حساب_های_پرسنل_و_ذینفعان.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parse CSV Content
  const parseAndImportCSV = (content: string) => {
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) {
      alert('فایل فاقد ردیف اطلاعاتی است.');
      return;
    }

    const newVendorsList: Vendor[] = [];
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // support both comma and semicolon split
      const cols = line.split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (!cols[0] || !cols[2]) continue;

      let sheba = (cols[3] || '').toUpperCase();
      if (sheba && !sheba.startsWith('IR')) {
        sheba = 'IR' + sheba;
      }

      newVendorsList.push({
        id: `vendor_csv_${Date.now()}_${i}`,
        name: cols[0],
        category: cols[1] || 'پرسنل و حقوق',
        accountHolderName: cols[2],
        shebaNumber: sheba || 'IR000000000000000000000000',
        cardNumber: cols[4] || '',
        accountNumber: cols[5] || '',
        bankName: cols[6] || 'بانک ملت',
        phone: cols[7] || '',
        nationalCode: cols[8] || '',
        totalPaid: 0,
        transactionCount: 0
      });
    }

    if (newVendorsList.length === 0) {
      alert('هیچ ردیف معتبری در فایل یافت نشد.');
      return;
    }

    onUpdateVendors([...newVendorsList, ...vendors]);
    setIsBatchImportModalOpen(false);
    setBatchCsvText('');
    alert(`تعداد ${newVendorsList.length} شماره حساب و ذینفع با موفقیت به صورت گروهی وارد سیستم شد.`);
  };

  const handleFileUploadCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        parseAndImportCSV(text);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Stats
  const totalVendorsCount = vendors.length;
  const totalPaidAllVendors = vendors.reduce((sum, v) => sum + (v.totalPaid || 0), 0);

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Header Banner */}
      <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-3xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>دفترچه متمرکز ذینفعان و پرسنل (Vendor Directory)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            بانک اطلاعات طرف‌های حساب و شماره حساب‌های پرسنل
          </h2>
          <p className="text-xs text-slate-300">
            مدیریت متمرکز حساب‌های بانکی، شماره شبا، شماره کارت، پرسنل و تامین‌کنندگان رسمی خزانه‌داری
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsBatchImportModalOpen(true)}
            className="px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs rounded-2xl shadow-lg transition flex items-center gap-2 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ورود گروهی با فایل (Excel/CSV)</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-2xl shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن فروشنده / ذینفع جدید</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">کل فروشندگان و ذینفعان</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{totalVendorsCount} <span className="text-xs text-slate-400 font-normal">طرف حساب</span></span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <Store className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">مجموع پرداخت‌های ثبت‌شده به ذینفعان</span>
            <span className="text-lg font-mono font-black text-emerald-600 dark:text-emerald-400 mt-1 block truncate">{formatRial(totalPaidAllVendors)}</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Banknote className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">گروه‌بندی و دسته‌بندی‌ها</span>
            <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{categories.length} <span className="text-xs text-slate-400 font-normal">گروه اصلی</span></span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Filter className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجوی نام فروشنده، نام صاحب حساب، شماره شبا یا تلفن..."
            className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl pr-9 pl-4 py-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold shrink-0">دسته‌بندی:</span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
              selectedCategory === 'all' 
                ? 'bg-indigo-600 text-white' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            همه موارد
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                selectedCategory === cat 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Vendor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {filteredVendors.map((vendor, index) => {
          const vendorPaidRequests = requests.filter(r => r.destinationAccountName?.includes(vendor.accountHolderName) || r.vendorId === vendor.id);
          const computedTotalPaid = vendorPaidRequests.filter(r => r.status === 'paid').reduce((s, r) => s + r.amount, 0) || vendor.totalPaid || 0;

          return (
            <div 
              key={vendor.id}
              className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 rounded-3xl shadow-sm transition space-y-4 relative group"
            >
              {/* Card Top */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-xl bg-slate-950 text-slate-400 text-[10px] font-mono font-black border border-slate-800">
                      ردیف {index + 1}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold border border-indigo-500/20">
                      {vendor.category}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white leading-snug">
                    {vendor.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>صاحب حساب: <strong className="text-slate-700 dark:text-slate-200">{vendor.accountHolderName}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleOpenEditModal(vendor)}
                    className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-600 hover:text-white rounded-xl transition cursor-pointer"
                    title="ویرایش اطلاعات فروشنده"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteVendor(vendor.id, vendor.name)}
                    className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-rose-600 hover:text-white rounded-xl transition cursor-pointer"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Bank Account Details Box */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-2xl space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                  <span className="font-bold flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    بانک عامل: <span className="text-slate-900 dark:text-white font-extrabold">{vendor.bankName}</span>
                  </span>
                  {vendor.phone && (
                    <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 dir-ltr font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {vendor.phone}
                    </span>
                  )}
                </div>

                {/* Sheba Number Display */}
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 font-mono text-xs">
                  <span className="text-slate-400 font-sans text-[10px] font-bold">شماره شبا:</span>
                  <div className="flex items-center gap-2 dir-ltr">
                    <span className="font-black text-indigo-600 dark:text-indigo-300 tracking-wider">
                      {vendor.shebaNumber}
                    </span>
                    <button
                      onClick={() => handleCopyText(vendor.shebaNumber, `sheba_${vendor.id}`)}
                      className="p-1 text-slate-400 hover:text-indigo-500 transition cursor-pointer"
                      title="کپی شماره شبا"
                    >
                      {copiedId === `sheba_${vendor.id}` ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {vendor.cardNumber && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span>شماره کارت:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300 dir-ltr">{vendor.cardNumber}</span>
                  </div>
                )}
              </div>

              {/* Extra Meta */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                <div>
                  مجموع واریزی‌ها: <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{formatRial(computedTotalPaid)}</strong>
                </div>
                {onOpenNewRequestWithVendor && (
                  <button
                    onClick={() => onOpenNewRequestWithVendor(vendor)}
                    className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ثبت درخواست پرداخت برای این فروشنده</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredVendors.length === 0 && (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3">
          <Store className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">هیچ فروشنده یا ذینفعی یافت نشد</h3>
          <p className="text-xs text-slate-400">می‌توانید با کلیک روی دکمه بالای صفحه، فروشنده جدید اضافه کنید.</p>
        </div>
      )}

      {/* Modal Add/Edit Vendor */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl p-6 space-y-5 shadow-2xl dir-rtl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-500" />
                {editingVendor ? 'ویرایش اطلاعات فروشنده' : 'افزودن فروشنده / ذینفع جدید'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveVendor} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">نام تجاری / فروشگاه / شرکت *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                    placeholder="مثال: فروشگاه شوینده ملل"
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">دسته‌بندی و زمینه فعالیت *</label>
                  {!isAddingCategory ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({...formData, category: e.target.value})}
                        className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500"
                      >
                        {categories.length === 0 && <option value="">دسته‌بندی وجود ندارد</option>}
                        {categories.map(catName => (
                          <option key={catName} value={catName}>{catName}</option>
                        ))}
                      </select>
                      {(currentUser?.role === 'admin' || currentUser?.customPermissions?.includes('manage_vendors')) && (
                        <button
                          type="button"
                          onClick={() => { setIsAddingCategory(true); setNewCategoryName(''); }}
                          className="shrink-0 px-2.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-xl cursor-pointer whitespace-nowrap"
                        >
                          + دسته‌بندی جدید
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                        placeholder="نام دسته‌بندی جدید را وارد کنید..."
                        className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-indigo-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="shrink-0 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl cursor-pointer"
                      >
                        ثبت
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingCategory(false)}
                        className="shrink-0 px-2.5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded-xl cursor-pointer"
                      >
                        انصراف
                      </button>
                    </div>
                  )}
                  {!(currentUser?.role === 'admin' || currentUser?.customPermissions?.includes('manage_vendors')) && (
                    <p className="text-[10px] text-slate-500">افزودن دسته‌بندی جدید فقط توسط ادمین از بخش «دفترچه ← دسته‌بندی‌ها» امکان‌پذیر است.</p>
                  )}
                </div>

                {/* Related Company */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">شرکت مربوطه</label>
                  <select
                    value={formData.companyId}
                    onChange={(e) => setFormData({...formData, companyId: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">— مشخص نشده —</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Account Holder Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">نام کامل صاحب حساب بانکی *</label>
                  <input
                    type="text"
                    value={formData.accountHolderName}
                    onChange={(e) => setFormData({...formData, accountHolderName: e.target.value})}
                    required
                    placeholder="مثال: احمد حسینی"
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Bank Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">نام بانک مقصد *</label>
                  <select
                    value={formData.bankName}
                    onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="بانک ملت">بانک ملت</option>
                    <option value="بانک ملی ایران">بانک ملی ایران</option>
                    <option value="بانک پاسارگاد">بانک پاسارگاد</option>
                    <option value="بانک سامان">بانک سامان</option>
                    <option value="بانک تجارت">بانک تجارت</option>
                    <option value="بانک صادرات ایران">بانک صادرات ایران</option>
                    <option value="بانک سپه">بانک سپه</option>
                    <option value="بانک کشاورزی">بانک کشاورزی</option>
                  </select>
                </div>

                {/* Sheba Number */}
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">شماره ۲۴ رقمی شبا (با IR) *</label>
                  <input
                    type="text"
                    value={formData.shebaNumber}
                    onChange={(e) => setFormData({...formData, shebaNumber: e.target.value})}
                    required
                    placeholder="IR120170000000109283740001"
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 font-mono dir-ltr"
                  />
                </div>

                {/* Card Number */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">شماره کارت (اختیاری)</label>
                  <input
                    type="text"
                    value={formData.cardNumber}
                    onChange={(e) => setFormData({...formData, cardNumber: e.target.value})}
                    placeholder="6037-9918-2234-8891"
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 font-mono dir-ltr"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">شماره تلفن / همراه</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="02188992211"
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 font-mono dir-ltr"
                  />
                </div>

                {/* National / Economic Code */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">شناسه ملی / کد ملی</label>
                  <input
                    type="text"
                    value={formData.nationalCode}
                    onChange={(e) => setFormData({...formData, nationalCode: e.target.value})}
                    placeholder="10103829102"
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">کد اقتصادی (اختیاری)</label>
                  <input
                    type="text"
                    value={formData.economicCode}
                    onChange={(e) => setFormData({...formData, economicCode: e.target.value})}
                    placeholder="411391829302"
                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded-xl p-2.5 border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-200 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl shadow-lg transition cursor-pointer"
                >
                  {editingVendor ? 'ذخیره تغییرات' : 'ثبت در دفترچه ذینفعان'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal Batch Import CSV / Excel */}
      {isBatchImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 space-y-5 shadow-2xl dir-rtl my-8 text-right max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-black text-white">ورود گروهی شماره حساب پرسنل و ذینفعان (از طریق فایل)</h3>
              </div>
              <button 
                onClick={() => setIsBatchImportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Template Download Box */}
            <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h4 className="text-xs font-black text-indigo-300">دانلود نمونه فایل الگوی اکسل (CSV Template)</h4>
                <p className="text-[11px] text-slate-300">
                  ابتدا فایل نمونه استاندارد را دریافت کرده، شماره حساب‌ها و اطلاعات پرسنل را در آن وارد کنید و سپس آپلود فرمایید.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>دانلود نمونه فایل CSV</span>
              </button>
            </div>

            {/* File Upload Zone */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                ۱. انتخاب فایل اکسل/CSV از سیستم:
              </label>
              <div className="relative border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center transition bg-slate-950/50">
                <input
                  type="file"
                  accept=".csv, text/csv, application/vnd.ms-excel"
                  onChange={handleFileUploadCSV}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                <span className="text-xs font-bold text-slate-200 block">برای انتخاب فایل اکسل یا CSV اینجا کلیک کنید</span>
                <span className="text-[10px] text-slate-400 mt-1 block">فرمت پشتیبانی شده: .csv با کدگذاری UTF-8</span>
              </div>
            </div>

            {/* Manual CSV paste alternative */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">
                ۲. یا قرار دادن مستقیم متن CSV (در صورت عدم آپلود فایل):
              </label>
              <textarea
                value={batchCsvText}
                onChange={(e) => setBatchCsvText(e.target.value)}
                rows={4}
                placeholder={`نام ذینفع,دسته‌بندی,صاحب حساب,شماره شبا,شماره کارت,شماره حساب,نام بانک,تلفن,شناسه ملی\nرضا محمدی,پرسنل,رضا محمدی,IR120170000000109283740001,6037991822348891,109283740001,بانک ملی,09121112233,0012345678`}
                className="w-full bg-slate-950 text-slate-200 font-mono text-xs rounded-2xl p-3 border border-slate-800 focus:outline-none focus:border-indigo-500 dir-ltr text-left"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsBatchImportModalOpen(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!batchCsvText.trim()) {
                    alert('لطفاً یک فایل انتخاب کرده یا متن CSV را وارد کنید.');
                    return;
                  }
                  parseAndImportCSV(batchCsvText);
                }}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>ثبت و پردازش گروهی</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
