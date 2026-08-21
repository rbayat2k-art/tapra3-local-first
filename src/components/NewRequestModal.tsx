import React, { useState } from 'react';
import { PaymentRequest, User, Company, CostCenter, RequestType, AttachmentFile, Vendor } from '../types';
import { numberToPersianWords, formatRial } from '../utils/numberToWords';
import { getJalaliNow, generateTrackingCode } from '../utils/persianDate';
import { storage } from '../utils/storage';
import { 
  FilePlus2, Upload, X, Check, Image as ImageIcon, 
  CreditCard, User as UserIcon, Building, Layers, PlusCircle,
  AlertCircle, HelpCircle, FileText, Sparkles, UserCheck, BookmarkPlus, Search, ChevronDown
} from 'lucide-react';

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  companies: Company[];
  costCenters: CostCenter[];
  users: User[];
  onRequestCreated: (newReq: PaymentRequest) => void;
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  companies,
  costCenters,
  users,
  onRequestCreated
}) => {
  // Entry mode: single request vs consolidated batch request
  const [entryMode, setEntryMode] = useState<'single' | 'batch'>('single');

  // Consolidated Batch Items State
  interface BatchItem {
    id: string;
    title: string;
    amount: string;
    destinationName: string;
    destinationCard: string;
  }
  const [batchItems, setBatchItems] = useState<BatchItem[]>([
    { id: 'item_1', title: '', amount: '', destinationName: '', destinationCard: '' },
    { id: 'item_2', title: '', amount: '', destinationName: '', destinationCard: '' }
  ]);

  const [requestType, setRequestType] = useState<RequestType>('current_payment');
  const [title, setTitle] = useState('');
  
  // 1. Branch / Cost Center filtering based on User's allowed cost centers
  const userAllowedCostCenters = costCenters.filter(cc => {
    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'treasury_executor') return true;
    if (currentUser.allowedCostCenterIds && currentUser.allowedCostCenterIds.length > 0) {
      return currentUser.allowedCostCenterIds.includes(cc.id);
    }
    if (currentUser.costCenterId) {
      return cc.id === currentUser.costCenterId;
    }
    return true;
  });

  // 2. Allowed Companies: Only companies that contain at least one of the user's allowed cost centers (or assigned company)
  const userAllowedCompanies = companies.filter(c => {
    if (!currentUser || currentUser.role === 'admin' || currentUser.role === 'treasury_executor') return true;
    const hasCostCenterInCompany = userAllowedCostCenters.some(cc => cc.companyId === c.id);
    if (currentUser.companyId) {
      return c.id === currentUser.companyId || hasCostCenterInCompany;
    }
    return hasCostCenterInCompany;
  });

  const availableCompanies = userAllowedCompanies.length > 0 ? userAllowedCompanies : companies;

  // Default company from currentUser if allowed, otherwise first available allowed company
  const defaultCompanyId = (currentUser?.companyId && availableCompanies.some(c => c.id === currentUser.companyId))
    ? currentUser.companyId
    : (availableCompanies[0]?.id || companies[0]?.id || 'comp_sales');

  const [companyId, setCompanyId] = useState(defaultCompanyId);
  
  // 3. Available Cost Centers strictly belonging to the currently selected Company AND allowed for user
  const availableCostCentersForCompany = userAllowedCostCenters.filter(cc => cc.companyId === companyId);

  // Default Cost Center: if assigned by admin and belongs to current company, pre-select it; otherwise auto-select if 1 option
  const defaultCostCenterId = (currentUser?.costCenterId && availableCostCentersForCompany.some(cc => cc.id === currentUser.costCenterId))
    ? currentUser.costCenterId
    : (availableCostCentersForCompany.length === 1 ? availableCostCentersForCompany[0].id : '');

  const [costCenterId, setCostCenterId] = useState(defaultCostCenterId);

  // Handle changing selected company -> automatically filter and sync cost center
  const handleCompanyChange = (newCompId: string) => {
    setCompanyId(newCompId);
    const validCCs = userAllowedCostCenters.filter(cc => cc.companyId === newCompId);
    if (validCCs.length === 1) {
      setCostCenterId(validCCs[0].id);
    } else if (!validCCs.some(cc => cc.id === costCenterId)) {
      setCostCenterId(validCCs[0]?.id || '');
    }
  };

  // Sync state whenever modal opens or user permissions change
  React.useEffect(() => {
    if (isOpen) {
      const validComps = userAllowedCompanies.length > 0 ? userAllowedCompanies : companies;
      let compToUse = companyId;
      if (!validComps.some(c => c.id === companyId)) {
        compToUse = validComps[0]?.id || '';
        setCompanyId(compToUse);
      }
      const validCCs = userAllowedCostCenters.filter(cc => cc.companyId === compToUse);
      if (validCCs.length === 1) {
        setCostCenterId(validCCs[0].id);
      } else if (!validCCs.some(cc => cc.id === costCenterId)) {
        setCostCenterId(validCCs[0]?.id || '');
      }
    }
  }, [isOpen]);
  
  // Amount & Destination (No default amount!)
  const [amountRaw, setAmountRaw] = useState<string>('');
  const [destinationCard, setDestinationCard] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [description, setDescription] = useState('');
  const [saveToAddressBook, setSaveToAddressBook] = useState(false);

  // Searchable Beneficiary Combobox State
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);

  // Resolve pre-configured approval chain set by Admin for this user
  let configuredApproverIds = currentUser?.approvalChain || [];

  // Dual-role users (both requestor and approver) skip the normal approval chain
  // when submitting their OWN request: it must go straight to the senior treasury supervisor.
  if (currentUser?.isDualRole) {
    const seniorSupervisor = users.find(u => u.isSeniorTreasurySupervisor) || users.find(u => u.role === 'admin');
    if (seniorSupervisor) configuredApproverIds = [seniorSupervisor.id];
  }

  if (configuredApproverIds.length === 0) {
    if (currentUser?.directBayatPermission) {
      const bayatAdmin = users.find(u => u.role === 'admin' || u.fullName.includes('بیات'));
      if (bayatAdmin) configuredApproverIds = [bayatAdmin.id];
    }
  }
  if (configuredApproverIds.length === 0) {
    const defaultApprover = users.find(u => u.role === 'approver') || users.find(u => u.role === 'admin') || users[0];
    if (defaultApprover) configuredApproverIds = [defaultApprover.id];
  }

  // Get full User objects for the configured chain
  const chainUsers = configuredApproverIds.map(id => users.find(u => u.id === id)).filter(Boolean) as User[];
  const firstApproverObj = chainUsers[0] || users[0];

  // Multi Cost-Center / Multi-Company Split Allocation State
  const [isMultiCostCenter, setIsMultiCostCenter] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  interface AllocationRow {
    id: string;
    companyId: string;
    costCenterId: string;
    amount: string;
    description: string;
  }

  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const toggleMultiCostCenter = () => {
    setFormError(null);
    const nextState = !isMultiCostCenter;
    setIsMultiCostCenter(nextState);

    if (nextState && allocations.length === 0) {
      const cc1 = costCenterId || userAllowedCostCenters[0]?.id || costCenters[0]?.id || '';
      const cc2 = userAllowedCostCenters.find(c => c.id !== cc1)?.id || costCenters.find(c => c.id !== cc1)?.id || cc1;

      const share = numericAmount > 0 ? Math.floor(numericAmount / 2) : 0;
      const remainder = numericAmount > 0 ? numericAmount - (share * 2) : 0;

      setAllocations([
        { id: 'alloc_1', companyId: companyId || defaultCompanyId, costCenterId: cc1, amount: share ? (share + remainder).toString() : '', description: '' },
        { id: 'alloc_2', companyId: companyId || defaultCompanyId, costCenterId: cc2, amount: share ? share.toString() : '', description: '' }
      ]);
    }
  };

  const addAllocationRow = () => {
    setFormError(null);
    const usedCcIds = allocations.map(a => a.costCenterId);
    const unusedCc = userAllowedCostCenters.find(c => !usedCcIds.includes(c.id)) || costCenters.find(c => !usedCcIds.includes(c.id)) || userAllowedCostCenters[0] || costCenters[0];

    setAllocations(prev => [
      ...prev,
      {
        id: `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        companyId: companyId || defaultCompanyId,
        costCenterId: unusedCc?.id || '',
        amount: '',
        description: ''
      }
    ]);
  };

  const removeAllocationRow = (id: string) => {
    setFormError(null);
    if (allocations.length <= 1) {
      setFormError('حداقل یک ردیف مرکز هزینه باید برای تفکیک باقی بماند.');
      return;
    }
    setAllocations(prev => prev.filter(a => a.id !== id));
  };

  const updateAllocationRow = (id: string, field: keyof AllocationRow, val: string) => {
    setFormError(null);
    setAllocations(prev => prev.map(a => {
      if (a.id === id) {
        if (field === 'amount') {
          return { ...a, amount: val.replace(/\D/g, '') };
        }
        if (field === 'companyId') {
          const validCCs = userAllowedCostCenters.filter(cc => cc.companyId === val);
          return { ...a, companyId: val, costCenterId: validCCs[0]?.id || '' };
        }
        return { ...a, [field]: val };
      }
      return a;
    }));
  };

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentCounter = storage.getAndIncrementCounter();
  const trackingCode = generateTrackingCode(currentCounter);

  // Batch items helpers
  const addBatchItem = () => {
    setBatchItems(prev => [
      ...prev,
      { id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, title: '', amount: '', destinationName: '', destinationCard: '' }
    ]);
  };

  const removeBatchItem = (id: string) => {
    if (batchItems.length <= 1) {
      alert('حداقل یک ردیف پرداخت برای درخواست تجمیعی الزامی است.');
      return;
    }
    setBatchItems(prev => prev.filter(item => item.id !== id));
  };

  const updateBatchItem = (id: string, field: keyof BatchItem, val: string) => {
    setBatchItems(prev => prev.map(item => {
      if (item.id === id) {
        if (field === 'amount') {
          return { ...item, amount: val.replace(/\D/g, '') };
        }
        return { ...item, [field]: val };
      }
      return item;
    }));
  };

  const batchTotalAmount = batchItems.reduce((sum, item) => {
    const val = parseFloat(item.amount.replace(/,/g, '')) || 0;
    return sum + val;
  }, 0);

  const numericAmount = entryMode === 'batch' 
    ? batchTotalAmount 
    : (parseFloat(amountRaw.replace(/,/g, '')) || 0);

  const amountWords = numberToPersianWords(numericAmount);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    setAmountRaw(val);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileUrl = event.target?.result as string;
        const newAtt: AttachmentFile = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: file.name,
          url: fileUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
          type: file.type || 'image/jpeg',
          size: file.size,
          uploadedAt: getJalaliNow()
        };
        setAttachments(prev => [...prev, newAtt]);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);

    // Fallback costCenterId if multi-cost-center is active and main dropdown wasn't selected
    let effectiveCostCenterId = costCenterId;
    if (!effectiveCostCenterId && isMultiCostCenter && allocations[0]?.costCenterId) {
      effectiveCostCenterId = allocations[0].costCenterId;
    }

    if (!effectiveCostCenterId) {
      setFormError('لطفاً مرکز هزینه / شعبه اصلی مربوطه را انتخاب کنید.');
      return;
    }

    if (!title.trim()) {
      setFormError('لطفاً عنوان درخواست را وارد کنید.');
      return;
    }

    if (requestType !== 'info_request' && numericAmount <= 0) {
      setFormError('لطفاً مبلغ معتبری به ریال وارد کنید.');
      return;
    }

    if (isMultiCostCenter && requestType !== 'info_request') {
      if (allocations.length === 0) {
        setFormError('لطفاً حداقل یک مرکز هزینه برای تقسیم مبلغ مشخص کنید.');
        return;
      }
      const hasEmptyCostCenter = allocations.some(a => !a.costCenterId);
      if (hasEmptyCostCenter) {
        setFormError('لطفاً مرکز هزینه/شعبه تمام ردیف‌های تقسیم هزینه را انتخاب کنید.');
        return;
      }
      const totalAllocated = allocations.reduce((sum, a) => sum + (parseFloat(a.amount.replace(/,/g, '')) || 0), 0);
      if (totalAllocated !== numericAmount) {
        setFormError(`مجموع مبالغ تقسیم‌شده (${formatRial(totalAllocated)}) با مبلغ کل درخواست (${formatRial(numericAmount)}) برابر نیست! اختلاف: ${formatRial(Math.abs(numericAmount - totalAllocated))}`);
        return;
      }
    }

    setIsSubmitting(true);

    const company = companies.find(c => c.id === companyId) || companies[0];
    const costCenter = userAllowedCostCenters.find(cc => cc.id === effectiveCostCenterId) || userAllowedCostCenters[0] || costCenters[0];

    const reqUser = currentUser || {
      id: 'guest',
      fullName: 'عسل مختاری',
      phone: '09121112233',
      role: 'requestor',
      roleTitle: 'سرپرست شعبه'
    } as User;

    const finalAmount = requestType === 'info_request' ? 0 : numericAmount;
    const finalAmountWords = requestType === 'info_request' ? 'بدون مبلغ (استعلام و صورت‌حساب)' : amountWords;

    let finalCard = requestType === 'info_request' ? '-' : (destinationCard.trim() || '۶۰۳۷-۹۹۱۸-۲۲۳۴-۸۸۹۱');
    let finalAccount = requestType === 'info_request' ? 'درخواست صورت‌حساب' : (destinationName.trim() || 'صاحب حساب مقصد');
    let finalDescription = description.trim();

    if (entryMode === 'batch' && requestType !== 'info_request') {
      finalCard = `شماره شبا و کارت‌های ${batchItems.length} ردیف تجمیعی در توضیحات درج شد`;
      finalAccount = `پرداخت تجمیعی (${batchItems.length} ذینفع)`;
      
      const batchLines = batchItems.map((bi, idx) => 
        `• ردیف ${idx + 1}: ${bi.title.trim() || 'پرداخت بابت فاکتور'} | مبلغ: ${formatRial(parseFloat(bi.amount) || 0)} | ذینفع: ${bi.destinationName.trim() || 'صاحب حساب'} | شماره کارت/شبا: ${bi.destinationCard.trim() || '-'}`
      ).join('\n');

      finalDescription = `📋 لیست ردیف‌های درخواست تجمیعی (${batchItems.length} مورد):\n${batchLines}${description.trim() ? '\n\nتوضیحات تکمیلی: ' + description.trim() : ''}`;
    }

    const finalBatchItems = (entryMode === 'batch' && requestType !== 'info_request')
      ? batchItems.map(bi => {
          const biAmount = parseFloat(bi.amount) || 0;
          return {
            id: bi.id,
            title: bi.title.trim() || 'پرداخت بابت فاکتور',
            amount: biAmount,
            amountInWords: numberToPersianWords(biAmount),
            destinationName: bi.destinationName.trim() || 'صاحب حساب',
            destinationCard: bi.destinationCard.trim() || '-',
            status: 'pending' as const
          };
        })
      : undefined;

    if (!finalDescription) {
      finalDescription = requestType === 'info_request' ? 'درخواست دریافت صورت‌حساب و فایل مالی' : 'توضیحات درخواست جهت بررسی خزانه‌داری';
    }

    const newRequest: PaymentRequest = {
      id: `req_${Date.now()}`,
      trackingCode,
      title: title.trim() + (entryMode === 'batch' ? ` (تجمیعی ${batchItems.length} مورد)` : ''),
      requestType,
      companyId: company.id,
      companyName: company.name,
      costCenterId: costCenter.id,
      costCenterName: costCenter.name,

      // Multi Cost-Center / Multi-Company Split
      isMultiCostCenter: isMultiCostCenter && requestType !== 'info_request',
      costCenterAllocations: (isMultiCostCenter && requestType !== 'info_request') ? allocations.map(a => {
        const comp = companies.find(c => c.id === a.companyId) || companies[0];
        const cc = costCenters.find(c => c.id === a.costCenterId) || costCenters[0];
        return {
          id: a.id,
          companyId: comp.id,
          companyName: comp.name,
          costCenterId: cc.id,
          costCenterName: cc.name,
          amount: parseFloat(a.amount.replace(/,/g, '')) || 0,
          description: a.description.trim()
        };
      }) : undefined,

      amount: finalAmount,
      amountInWords: finalAmountWords,
      destinationCardNumber: finalCard,
      destinationAccountName: finalAccount,
      description: finalDescription,
      batchItems: finalBatchItems,
      requestorId: reqUser.id,
      requestorName: reqUser.fullName,
      requestorPhone: reqUser.phone,
      currentApproverId: firstApproverObj.id,
      currentApproverName: firstApproverObj.fullName,
      currentApproverPhone: firstApproverObj.phone,
      status: 'pending_approval',
      createdAt: getJalaliNow(),
      updatedAt: getJalaliNow(),
      initialAttachments: attachments.length > 0 ? attachments : [
        {
          id: `att_default_${Date.now()}`,
          name: 'تصویر_فاکتور_پیوست.jpg',
          url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=800&q=80',
          type: 'image/jpeg',
          size: 1024000,
          uploadedAt: getJalaliNow()
        }
      ],
      timeline: [
        {
          id: `tl_${Date.now()}`,
          actorName: reqUser.fullName,
          actorRole: reqUser.roleTitle || 'ثبت‌کننده',
          action: 'submitted',
          actionTitle: `ثبت اولیه درخواست (${chainUsers.length} مرحله تایید)`,
          nextActorName: firstApproverObj.fullName,
          timestamp: getJalaliNow(),
          comment: `درخواست با کد پیگیری ${trackingCode} ثبت و جهت بررسی به ${firstApproverObj.fullName} ارسال شد.`
        }
      ]
    };

    onRequestCreated(newRequest);

    // Save vendor/beneficiary to address book if checkbox is enabled
    if (saveToAddressBook && destinationName.trim() && requestType !== 'info_request') {
      try {
        const currentVendors = storage.getVendors();
        const exists = currentVendors.some(v => 
          v.accountHolderName.trim().toLowerCase() === destinationName.trim().toLowerCase() ||
          (destinationCard.trim() && (v.shebaNumber === destinationCard.trim() || v.cardNumber === destinationCard.trim()))
        );
        if (!exists) {
          const newVendor: Vendor = {
            id: `vendor_${Date.now()}`,
            name: destinationName.trim(),
            category: 'ذینفعان پرکاربرد (افزوده شده از فرم)',
            shebaNumber: destinationCard.trim().startsWith('IR') ? destinationCard.trim() : destinationCard.trim(),
            cardNumber: destinationCard.trim(),
            accountNumber: destinationCard.trim(),
            bankName: 'بانک مقصد',
            accountHolderName: destinationName.trim(),
            phone: reqUser.phone || '09120000000',
            totalPaid: finalAmount,
            transactionCount: 1,
            notes: 'افزوده شده به دفترچه تلفن از طریق ثبت سریع درخواست پرداخت'
          };
          storage.saveVendors([newVendor, ...currentVendors]);
        }
      } catch (err) {
        console.error('Error saving vendor to address book', err);
      }
    }

    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden text-right transform transition-all animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-indigo-600 text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg border border-indigo-400/30">
                کد رهگیری: {trackingCode}
              </span>
              <h2 className="text-lg font-extrabold text-white">ثبت فرم درخواست پرداخت جدید</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              تنظیم مشخصات مالی، مرکز هزینه، و آپلود فاکتور و مدارک
            </p>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          
          {/* Entry Mode Switcher: Single vs Batch */}
          <div className="p-3.5 bg-slate-950/80 border border-indigo-500/30 rounded-2xl space-y-2 shadow-inner">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-indigo-300">
                شیوه ثبت درخواست پرداخت
              </label>
              <span className="text-[10px] text-slate-400">
                {entryMode === 'batch' ? 'امکان ثبت ۱۰ الی ۱۵+ ردیف پرداخت در یک پرونده' : 'پرداخت یک فاکتور مجزا'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEntryMode('single')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  entryMode === 'single'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-black'
                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>درخواست تک‌موردی</span>
              </button>
              <button
                type="button"
                onClick={() => setEntryMode('batch')}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  entryMode === 'batch'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30 font-black'
                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-750'
                }`}
              >
                <Layers className="w-4 h-4 text-emerald-300" />
                <span>درخواست تجمیعی (افزودن + +)</span>
              </button>
            </div>
          </div>

          {/* Request Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2">
              نوع درخواست پرداخت
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'current_payment', label: 'پرداخت جاری (فاکتور)', desc: 'پرداخت صورت‌حساب‌ها و خریدهای جاری' },
                { type: 'advance_payment', label: 'مساعده حقوق', desc: 'مساعده پرسنل و پیش‌پرداخت' },
                { type: 'info_request', label: 'درخواست اطلاعات / صورت‌حساب', desc: 'آپلود لیست خریدهای گروهی (۱۰ نفر+)' }
              ].map((item) => (
                <button
                  type="button"
                  key={item.type}
                  onClick={() => setRequestType(item.type as RequestType)}
                  className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
                    requestType === item.type
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <p className="text-xs font-bold mb-1">{item.label}</p>
                  <p className="text-[10px] text-slate-400 leading-tight">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              عنوان کلی درخواست پرداخت <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={entryMode === 'batch' ? "مثال: تجمیع فاکتورهای تدارکات خرد و هزینه‌های پیک تیرماه" : "مثال: خرید اقلام ملزومات و تنظیفات شعبه پونک شب"}
              className="w-full bg-slate-800 text-white text-sm rounded-xl px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Company & Cost Center Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                شرکت متقاضی <span className="text-rose-400">*</span>
              </label>
              <select
                value={companyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500 font-bold"
              >
                {availableCompanies.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                مرکز هزینه / شعبه اصلی <span className="text-rose-400">*</span>
              </label>
              <select
                value={costCenterId}
                onChange={(e) => setCostCenterId(e.target.value)}
                required
                className={`w-full bg-slate-800 text-xs rounded-xl px-3 py-2.5 border focus:outline-none ${
                  !costCenterId ? 'text-amber-300 border-amber-500/60 animate-pulse' : 'text-white border-slate-700 focus:border-indigo-500'
                }`}
              >
                {!costCenterId && (
                  <option value="">-- انتخاب مرکز هزینه / شعبه (الزامی) --</option>
                )}
                {availableCostCentersForCompany.map(cc => (
                  <option key={cc.id} value={cc.id}>{cc.name} ({cc.code})</option>
                ))}
              </select>
              {availableCostCentersForCompany.length === 0 ? (
                <span className="text-[10px] text-rose-400 mt-1 block font-bold">
                  هیچ مرکز هزینه‌ای برای این شرکت در دسترسی شما تعریف نشده است.
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 mt-1 block">
                  هزینه‌ها در سیستم مالی به این مرکز هزینه تخصیص می‌یابند.
                </span>
              )}
            </div>
          </div>

          {/* Multi Cost-Center / Multi-Company Split Allocation Toggle & Form */}
          <div className="p-3.5 bg-slate-950/80 border border-indigo-500/30 rounded-2xl space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-500/30 shrink-0">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white">تقسیم هزینه بین چند شعبه / چند شرکت (Multi Cost-Center)</h4>
                  <p className="text-[10px] text-slate-400">یک واریز به فروشنده، اما تفکیک سهم هزینه بین چند شعبه/شرکت جهت ثبت سند مالی دقیق</p>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleMultiCostCenter}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                  isMultiCostCenter
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{isMultiCostCenter ? '✓ فعال (تقسیم هزینه)' : '+ فعال‌سازی تقسیم چند مرکزی'}</span>
              </button>
            </div>

            {/* Form Error Notice if any */}
            {formError && (
              <div className="p-3 bg-rose-500/20 border-2 border-rose-500/50 rounded-xl text-rose-300 text-xs font-bold flex items-center gap-2 animate-shake">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Multi Allocation Panel */}
            {isMultiCostCenter && (
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="p-3 bg-slate-900/90 rounded-xl border border-indigo-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px] block font-bold">مبلغ کل درخواست:</span>
                      <span className="font-mono font-black text-indigo-300">{formatRial(numericAmount)}</span>
                    </div>
                    <div className="border-r border-slate-800 pr-3">
                      <span className="text-slate-400 text-[10px] block font-bold">مجموع تقسیم‌شده:</span>
                      <span className="font-mono font-black text-emerald-400">
                        {formatRial(allocations.reduce((sum, a) => sum + (parseFloat(a.amount.replace(/,/g, '')) || 0), 0))}
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const totalAllocated = allocations.reduce((sum, a) => sum + (parseFloat(a.amount.replace(/,/g, '')) || 0), 0);
                    const diff = numericAmount - totalAllocated;
                    if (numericAmount > 0 && diff === 0) {
                      return (
                        <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-lg text-[10px] font-bold">
                          ✓ مبالغ کاملاً تراز است
                        </span>
                      );
                    }
                    if (numericAmount > 0 && diff !== 0) {
                      return (
                        <span className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-bold">
                          ⚠️ اختلاف: {formatRial(Math.abs(diff))} {diff > 0 ? 'کمتر از کل' : 'بیشتر از کل'}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="space-y-2.5">
                  {allocations.map((alloc, idx) => (
                    <div key={alloc.id} className="p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                          سهم #{idx + 1}
                        </span>
                        {allocations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAllocationRow(alloc.id)}
                            className="p-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition text-[10px] cursor-pointer"
                            title="حذف این سهم"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1 font-bold">شرکت</label>
                          <select
                            value={alloc.companyId}
                            onChange={(e) => updateAllocationRow(alloc.id, 'companyId', e.target.value)}
                            className="w-full bg-slate-800 text-white text-xs rounded-lg p-1.5 border border-slate-700 font-bold"
                          >
                            {availableCompanies.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1 font-bold">مرکز هزینه / شعبه *</label>
                          <select
                            value={alloc.costCenterId}
                            onChange={(e) => updateAllocationRow(alloc.id, 'costCenterId', e.target.value)}
                            className="w-full bg-slate-800 text-amber-300 text-xs rounded-lg p-1.5 border border-slate-700 font-bold"
                          >
                            <option value="">-- انتخاب شعبه --</option>
                            {userAllowedCostCenters
                              .filter(cc => cc.companyId === alloc.companyId)
                              .map(cc => (
                                <option key={cc.id} value={cc.id}>{cc.name} ({cc.code})</option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1 font-bold">مبلغ سهم (ریال) *</label>
                          <input
                            type="text"
                            value={alloc.amount ? parseFloat(alloc.amount).toLocaleString('en-US') : ''}
                            onChange={(e) => updateAllocationRow(alloc.id, 'amount', e.target.value)}
                            placeholder="مبلغ سهم"
                            className="w-full bg-slate-800 text-emerald-400 font-mono font-bold text-xs rounded-lg p-1.5 border border-slate-700 text-left"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1 font-bold">توضیح / بابت این سهم</label>
                          <input
                            type="text"
                            value={alloc.description}
                            onChange={(e) => updateAllocationRow(alloc.id, 'description', e.target.value)}
                            placeholder="مثال: سهم ۵ کیلو چای"
                            className="w-full bg-slate-800 text-white text-xs rounded-lg p-1.5 border border-slate-700"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={addAllocationRow}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/30 transition flex items-center gap-1 cursor-pointer"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ افزودن مرکز هزینه دیگر</span>
                  </button>

                  {numericAmount > 0 && allocations.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const share = Math.floor(numericAmount / allocations.length);
                        const remainder = numericAmount - (share * allocations.length);
                        setAllocations(prev => prev.map((a, i) => ({
                          ...a,
                          amount: (i === 0 ? share + remainder : share).toString()
                        })));
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>توزیع مساوی مبلغ کل بین {allocations.length} مرکز</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Consolidated Batch Request Form (افزودن ردیف‌های پرداخت +) */}
          {entryMode === 'batch' && requestType !== 'info_request' && (
            <div className="p-4 bg-emerald-950/30 border-2 border-emerald-500/40 rounded-2xl space-y-4 text-right">
              <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-xs font-black text-white">لیست ردیف‌های پرداخت تجمیعی</h3>
                </div>
                <div className="text-[11px] font-mono font-bold text-emerald-300 bg-emerald-900/60 px-3 py-1 rounded-xl border border-emerald-500/30">
                  تعداد ردیف‌ها: {batchItems.length} مورد | مجموع: {formatRial(batchTotalAmount)}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {batchItems.map((item, index) => (
                  <div key={item.id} className="p-3 bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-2xl space-y-2.5 transition relative group">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                        ردیف پرداخت #{index + 1}
                      </span>
                      {batchItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBatchItem(item.id)}
                          className="px-2 py-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="حذف این ردیف"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>حذف ردیف</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1 font-bold">
                          بابت / عنوان هزینه <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => updateBatchItem(item.id, 'title', e.target.value)}
                          placeholder="مثلاً: فاکتور خرید مواد اولیه"
                          className="w-full bg-slate-800 text-white text-xs rounded-xl px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1 font-bold">
                          مبلغ به ریال <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={item.amount ? parseFloat(item.amount).toLocaleString('en-US') : ''}
                          onChange={(e) => updateBatchItem(item.id, 'amount', e.target.value)}
                          placeholder="مثلاً ۵,۰۰۰,۰۰۰"
                          className="w-full bg-slate-800 text-emerald-300 font-mono font-bold text-xs rounded-xl px-2.5 py-1.5 border border-slate-700 text-left focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1 font-bold">
                          نام ذینفع / صاحب حساب
                        </label>
                        <input
                          type="text"
                          list="vendor-names-list"
                          value={item.destinationName}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateBatchItem(item.id, 'destinationName', val);
                            const vendors = storage.getVendors();
                            const match = vendors.find(v => v.accountHolderName === val || v.name === val);
                            if (match) {
                              updateBatchItem(item.id, 'destinationCard', match.shebaNumber || match.cardNumber || '');
                            }
                          }}
                          placeholder="نام و نام خانوادگی"
                          className="w-full bg-slate-800 text-white text-xs rounded-xl px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1 font-bold">
                          شماره کارت / شبا
                        </label>
                        <input
                          type="text"
                          list="vendor-cards-list"
                          value={item.destinationCard}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateBatchItem(item.id, 'destinationCard', val);
                            const vendors = storage.getVendors();
                            const match = vendors.find(v => v.shebaNumber === val || v.cardNumber === val);
                            if (match) {
                              updateBatchItem(item.id, 'destinationName', match.accountHolderName);
                            }
                          }}
                          placeholder="IR..."
                          className="w-full bg-slate-800 text-slate-200 font-mono text-xs rounded-xl px-2.5 py-1.5 border border-slate-700 text-left focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add New Batch Item Button */}
              <button
                type="button"
                onClick={addBatchItem}
                className="w-full py-3 bg-slate-900 hover:bg-emerald-950 text-emerald-400 border border-dashed border-emerald-500/50 hover:border-emerald-400 rounded-2xl font-black text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                <PlusCircle className="w-5 h-5" />
                <span>+ افزودن ردیف پرداخت جدید (پرداخت بعدی)</span>
              </button>

              {/* Total Batch Calculation Box */}
              <div className="p-3 bg-slate-900 rounded-xl border border-emerald-500/30 flex flex-wrap items-center justify-between text-xs gap-2">
                <div>
                  <span className="text-slate-400 font-bold block">مجموع مبلغ درخواست تجمیعی:</span>
                  <span className="text-emerald-300 text-[11px] font-bold">{amountWords}</span>
                </div>
                <span className="text-lg font-mono font-black text-emerald-400">
                  {formatRial(batchTotalAmount)}
                </span>
              </div>
            </div>
          )}

          {/* Conditional Rendering based on Request Type */}
          {requestType === 'info_request' ? (
            /* Special Info/Statement Request Card */
            <div className="p-4 bg-indigo-950/40 border-2 border-indigo-500/40 rounded-2xl space-y-2 text-right">
              <div className="flex items-center gap-2 text-indigo-300 font-extrabold text-xs">
                <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                <span>فرم اختصاصی درخواست اطلاعات و صورت‌حساب (بدون تراکنش ریالی)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                این نوع درخواست برای استعلام لیست خریدهای گروهی پرسنل، دریافت ریز کارکرد، صورت‌حساب‌های ماهانه و خریدهای بالای ۱۰ نفر استفاده می‌شود و نیازی به ثبت مبلغ و شماره کارت ندارد.
              </p>
            </div>
          ) : (
            /* Standard Payment Amount & Card Details */
            <>
              {/* Amount Box with Persian Words Display & Real-time Budget Check */}
              <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-300">
                    مبلغ درخواست به ریال <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {formatRial(numericAmount)}
                  </span>
                </div>

                <input
                  type="text"
                  value={numericAmount > 0 ? numericAmount.toLocaleString('en-US') : ''}
                  onChange={handleAmountChange}
                  required
                  placeholder="۱۰,۰۰۰,۰۰۰"
                  className="w-full bg-slate-900 text-indigo-200 text-lg font-mono font-bold rounded-xl px-4 py-2.5 border border-indigo-500/40 text-left focus:outline-none focus:border-indigo-400"
                />

                {/* Live Persian Words Conversion */}
                <div className="p-2.5 bg-indigo-900/40 rounded-xl border border-indigo-700/40 text-xs text-indigo-200 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>مبلغ به حروف: <strong className="text-white font-bold">{amountWords}</strong></span>
                </div>

                {/* Real-time Branch Budget Variance Meter */}
                {(() => {
                  const selectedCC = costCenters.find(c => c.id === costCenterId);
                  const budget = selectedCC?.monthlyBudget || 400000000;
                  const newTotalWithThis = numericAmount; // estimated new impact
                  const percentOfBudget = Math.round((newTotalWithThis / budget) * 100);

                  if (numericAmount <= 0) return null;

                  return (
                    <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-bold">میزان نسبت به بودجه ماهانه شعبه ({selectedCC?.name}):</span>
                        <span className={`font-mono font-bold ${percentOfBudget > 90 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {percentOfBudget}% بودجه ماهانه
                        </span>
                      </div>

                      {percentOfBudget > 100 && (
                        <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-lg text-[11px] font-bold flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>هشدار: این مبلغ از سقف بودجه مصوب ماهانه شعبه فراتر می‌رود! (نیازمند تایید ویژه خزانه‌داری)</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Searchable Beneficiary Combobox (دفترچه تلفن و ذینفعان) */}
              <div className="p-3.5 bg-slate-800/80 rounded-2xl border border-indigo-500/30 space-y-2.5 relative">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-indigo-300 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-400" />
                    <span>جستجو و انتخاب هوشمند از دفترچه تلفن و ذینفعان</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    جستجوی زنده (نام، فامیلی، شبا، بانک)
                  </span>
                </div>

                {/* Combobox Search Input */}
                <div className="relative">
                  <div className="absolute right-3 top-2.5 text-slate-400 flex items-center gap-1 pointer-events-none">
                    <Search className="w-4 h-4 text-indigo-400" />
                  </div>
                  <input
                    type="text"
                    value={vendorSearchQuery}
                    onFocus={() => setIsVendorDropdownOpen(true)}
                    onChange={(e) => {
                      setVendorSearchQuery(e.target.value);
                      setIsVendorDropdownOpen(true);
                    }}
                    placeholder="🔍 تایپ بخشی از نام، فامیلی، صاحب حساب، شبا یا بانک..."
                    className="w-full bg-slate-900 text-white text-xs rounded-xl pr-9 pl-8 py-2.5 border border-indigo-500/40 focus:outline-none focus:border-indigo-400 font-bold placeholder:font-normal placeholder:text-slate-400"
                  />
                  {vendorSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setVendorSearchQuery('');
                        setIsVendorDropdownOpen(true);
                      }}
                      className="absolute left-3 top-2.5 text-slate-400 hover:text-white text-xs p-0.5 rounded transition"
                      title="پاک کردن عبارت جستجو"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Searchable Dropdown List Results */}
                {isVendorDropdownOpen && (
                  <div className="absolute top-full right-0 left-0 z-50 mt-1 bg-slate-900 border-2 border-indigo-500/50 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto divide-y divide-slate-800 text-right">
                    {(() => {
                      const allVendors = storage.getVendors();
                      const query = vendorSearchQuery.trim().toLowerCase();
                      const filtered = allVendors.filter(v => 
                        !query ||
                        v.name.toLowerCase().includes(query) ||
                        v.accountHolderName.toLowerCase().includes(query) ||
                        (v.shebaNumber && v.shebaNumber.toLowerCase().includes(query)) ||
                        (v.cardNumber && v.cardNumber.toLowerCase().includes(query)) ||
                        (v.bankName && v.bankName.toLowerCase().includes(query)) ||
                        (v.category && v.category.toLowerCase().includes(query)) ||
                        (v.phone && v.phone.includes(query)) ||
                        (v.notes && v.notes.toLowerCase().includes(query))
                      );

                      if (filtered.length === 0) {
                        return (
                          <div className="p-4 text-center text-xs text-amber-300 bg-amber-500/10">
                            هیچ ذینفعی با عبارت «{vendorSearchQuery}» در دفترچه پیدا نشد. می‌توانید نام و شبا را مستقیماً پایین وارد کنید.
                          </div>
                        );
                      }

                      return filtered.map(v => (
                        <div
                          key={v.id}
                          onClick={() => {
                            setDestinationName(v.accountHolderName);
                            setDestinationCard(v.shebaNumber || v.cardNumber || '');
                            setVendorSearchQuery(`${v.name} (${v.accountHolderName})`);
                            setIsVendorDropdownOpen(false);
                          }}
                          className="p-3 hover:bg-indigo-950/60 transition cursor-pointer flex flex-col gap-1 group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-white group-hover:text-indigo-300 transition">
                              {v.name}
                            </span>
                            <span className="text-[10px] bg-slate-800 text-indigo-300 px-2 py-0.5 rounded-full border border-slate-700">
                              {v.bankName || 'بانک مقصد'}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between text-[11px] text-slate-300">
                            <span>صاحب حساب: <strong className="text-amber-300">{v.accountHolderName}</strong></span>
                            {v.phone && <span className="text-[10px] text-slate-400 font-mono">📱 {v.phone}</span>}
                          </div>

                          <div className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20 w-fit">
                            شبا/کارت: {v.shebaNumber || v.cardNumber || '-'}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>

              {/* Destination Account & Card Details with datalist auto-complete */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    شماره کارت / شبا مقصد
                  </label>
                  <input
                    type="text"
                    list="vendor-cards-list"
                    value={destinationCard}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDestinationCard(val);
                      const vendors = storage.getVendors();
                      const match = vendors.find(v => v.shebaNumber === val || v.cardNumber === val);
                      if (match) {
                        setDestinationName(match.accountHolderName);
                      }
                    }}
                    placeholder="IR120170000000109283740001"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500 font-mono text-left"
                  />
                  <datalist id="vendor-cards-list">
                    {storage.getVendors().map(v => (
                      <option key={`card_${v.id}`} value={v.shebaNumber}>{v.accountHolderName} - {v.bankName}</option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    نام صاحب حساب / مقصد
                  </label>
                  <input
                    type="text"
                    list="vendor-names-list"
                    value={destinationName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDestinationName(val);
                      const vendors = storage.getVendors();
                      const match = vendors.find(v => v.accountHolderName === val || v.name === val);
                      if (match) {
                        setDestinationCard(match.shebaNumber || match.cardNumber || '');
                      }
                    }}
                    placeholder="نام دقیق صاحب کارت / حساب"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                  <datalist id="vendor-names-list">
                    {storage.getVendors().map(v => (
                      <option key={`name_${v.id}`} value={v.accountHolderName}>{v.name} ({v.category})</option>
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Option to Save New Person / Vendor to Address Book */}
              <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <BookmarkPlus className="w-5 h-5 text-indigo-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-white block">
                      ذخیره در دفترچه تلفن و ذینفعان پرکاربرد
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      در صورت نبودن شخص در دفترچه، تیک را بزنید تا این اسم و شماره شبا/کارت به لیست ذخیره‌شده‌ها اضافه شود.
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={saveToAddressBook}
                    onChange={(e) => setSaveToAddressBook(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              بابت / توضیحات کامل درخواست
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="توضیحات دقیق جهت شفافیت هزینه، دلیل خرید و جزئیات فاکتور..."
              className="w-full bg-slate-800 text-white text-xs rounded-xl p-3 border border-slate-700 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Multi-file Attachments Upload */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-400" />
                پیوست تصاویر فاکتور و مدارک (امکان آپلود چندگانه)
              </label>
              <span className="text-[10px] text-slate-400">
                عکس فاکتورها، لیست صورت‌حساب، فایل اکسل
              </span>
            </div>

            <div className="p-4 bg-slate-800/80 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl text-center transition">
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.xlsx,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="invoice-file-input"
              />
              <label htmlFor="invoice-file-input" className="cursor-pointer block">
                <ImageIcon className="w-8 h-8 text-indigo-400 mx-auto mb-2 opacity-80" />
                <p className="text-xs font-bold text-slate-200">
                  برای انتخاب یا آپلود عکس فاکتور و صورت‌حساب اینجا کلیک کنید
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  پشتیبانی از گوشی موبایل و سیستم (تصاویر، PDF و اکسل)
                </p>
              </label>
            </div>

            {/* Attachments List Preview */}
            {attachments.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {attachments.map((att) => (
                  <div key={att.id} className="relative p-2 bg-slate-800 border border-slate-700 rounded-xl flex items-center gap-2 overflow-hidden">
                    <img src={att.url} alt={att.name} className="w-10 h-10 object-cover rounded-lg shrink-0" />
                    <div className="overflow-hidden flex-1 text-right">
                      <p className="text-[11px] font-bold text-slate-200 truncate">{att.name}</p>
                      <p className="text-[9px] text-slate-400">فایل پیوست</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="p-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflow Referral Step (Pre-Configured by Admin) */}
          <div className="p-4 bg-slate-950/80 rounded-2xl border border-indigo-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>مسیر و مراحل تایید این درخواست (تعیین‌شده توسط ادمین سیستم)</span>
              </label>
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full border border-indigo-500/30 font-bold">
                ارسال هوشمند سیستمی
              </span>
            </div>

            <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-400">ترتیب تاییدکنندگان:</span>
              {chainUsers.map((appr, idx) => (
                <React.Fragment key={appr.id}>
                  <div className="px-3 py-1.5 bg-slate-800 text-indigo-200 rounded-lg font-bold text-xs border border-slate-700 flex items-center gap-1.5">
                    <span className="text-slate-400 text-[10px] font-mono">{idx + 1}.</span>
                    <span>{appr.fullName}</span>
                    <span className="text-[10px] text-indigo-300 font-normal">({appr.roleTitle || 'تاییدکننده'})</span>
                  </div>
                  {idx < chainUsers.length - 1 && (
                    <span className="text-indigo-400 font-extrabold text-sm">←</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              * درخواست شما به طور مستقیم جهت تایید مرحله اول به <strong>{firstApproverObj.fullName} ({firstApproverObj.roleTitle})</strong> ارجاع خواهد شد و پس از تایید ایشان، به سادگی در مسیر سازمان به خزانه‌داری هدایت می‌گردد.
            </p>
          </div>

          {/* Action Footer */}
          {formError && (
            <div className="p-3 bg-rose-500/20 border-2 border-rose-500/50 rounded-xl text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>ارسال و ثبت نهایی درخواست</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
