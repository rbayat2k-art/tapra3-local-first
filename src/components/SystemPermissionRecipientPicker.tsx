import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, SystemRole, Company, CostCenter } from '../types';
import { storage } from '../utils/storage';
import { Shield, User as UserIcon, Building2, ChevronDown, Search, Check, Layers } from 'lucide-react';

interface OptionItem {
  id: string;
  category: 'role' | 'user' | 'department' | 'cost_center';
  label: string;
  subLabel?: string;
  userId?: string;
  userName?: string;
}

interface SystemPermissionRecipientPickerProps {
  value: string;
  onChange: (value: string, userId?: string, userName?: string) => void;
  users?: User[];
  roles?: SystemRole[];
  companies?: Company[];
  costCenters?: CostCenter[];
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
}

export const SystemPermissionRecipientPicker: React.FC<SystemPermissionRecipientPickerProps> = ({
  value,
  onChange,
  users: propUsers,
  roles: propRoles,
  companies: propCompanies,
  costCenters: propCostCenters,
  placeholder = 'جستجو و انتخاب واحد، نقش یا کاربر گیرنده...',
  disabled = false,
  label,
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Fallback to storage if props not provided
  const users = useMemo(() => propUsers || storage.getUsers(), [propUsers]);
  const roles = useMemo(() => propRoles || storage.getRoles(), [propRoles]);
  const companies = useMemo(() => propCompanies || storage.getCompanies(), [propCompanies]);
  const costCenters = useMemo(() => propCostCenters || storage.getCostCenters(), [propCostCenters]);

  // Standard Organizational Departments
  const standardDepartments: OptionItem[] = [
    { id: 'dept_treasury', category: 'department', label: 'واحد خزانه‌داری' },
    { id: 'dept_finance', category: 'department', label: 'واحد مالی و حسابداری' },
    { id: 'dept_support', category: 'department', label: 'واحد پشتیبانی و خدمات پس از فروش' },
    { id: 'dept_sales', category: 'department', label: 'مدیریت و توسعه فروش' },
    { id: 'dept_procurement', category: 'department', label: 'واحد تدارکات و تامین' },
    { id: 'dept_hq', category: 'department', label: 'دفتر مرکزی و مدیریت ارشد' },
  ];

  // Map Roles to OptionItems
  const roleOptions: OptionItem[] = useMemo(() => {
    return roles.map((r) => ({
      id: `role_${r.id}`,
      category: 'role',
      label: r.name,
      subLabel: `دسترسی سیستم (${r.code})`
    }));
  }, [roles]);

  // Map Users to OptionItems
  const userOptions: OptionItem[] = useMemo(() => {
    return users.filter(u => u.isActive).map((u) => ({
      id: `user_${u.id}`,
      category: 'user',
      label: `${u.fullName}`,
      subLabel: `${u.roleTitle} ${u.phone ? `— ${u.phone}` : ''}`,
      userId: u.id,
      userName: u.fullName
    }));
  }, [users]);

  // Map Cost Centers & Companies
  const costCenterOptions: OptionItem[] = useMemo(() => {
    const ccItems: OptionItem[] = costCenters.map((cc) => ({
      id: `cc_${cc.id}`,
      category: 'cost_center',
      label: `شعبه / مرکز هزینه: ${cc.name}`,
      subLabel: cc.code
    }));
    const compItems: OptionItem[] = companies.map((c) => ({
      id: `comp_${c.id}`,
      category: 'cost_center',
      label: `شرکت: ${c.name}`,
      subLabel: c.code
    }));
    return [...ccItems, ...compItems];
  }, [costCenters, companies]);

  // Combine All Options
  const allOptions = useMemo(() => {
    return [
      ...roleOptions,
      ...userOptions,
      ...standardDepartments,
      ...costCenterOptions
    ];
  }, [roleOptions, userOptions, costCenterOptions]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return allOptions;
    const term = searchTerm.trim().toLowerCase();
    return allOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(term))
    );
  }, [allOptions, searchTerm]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: OptionItem) => {
    onChange(item.label, item.userId, item.userName);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    setSearchTerm(val);
    if (!isOpen) setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative w-full space-y-1">
      {label && (
        <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
          <span>{label} {required && <span className="text-rose-400">*</span>}</span>
          <span className="text-[10px] text-indigo-400 font-normal">انتخاب کشویی یا تایپ دستی</span>
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition disabled:opacity-60 pr-9"
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400 pointer-events-none">
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1.5 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
          {/* Quick Search bar inside dropdown */}
          <div className="p-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در دسترسی‌ها، نقش‌ها، کاربران و واحدها..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 bg-slate-800 rounded"
              >
                پاک کردن
              </button>
            )}
          </div>

          {/* Scrollable List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60 p-1.5">
            {/* Custom Input Header if value typed isn't matching perfectly */}
            {searchTerm.trim() && !filteredOptions.some(o => o.label === searchTerm.trim()) && (
              <button
                type="button"
                onClick={() => {
                  onChange(searchTerm.trim());
                  setIsOpen(false);
                }}
                className="w-full text-right p-2.5 hover:bg-indigo-900/40 text-indigo-300 text-xs rounded-xl flex items-center justify-between transition cursor-pointer"
              >
                <span>استفاده از عنوان دستی: <b className="text-white">«{searchTerm.trim()}»</b></span>
                <Check className="w-3.5 h-3.5" />
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                موردی یافت نشد. می‌توانید عنوان مورد نظر را مستقیماً در کادر بالا تایپ کنید.
              </div>
            ) : (
              <>
                {/* 1. Roles & Permissions Group */}
                {filteredOptions.some(o => o.category === 'role') && (
                  <div className="p-1">
                    <div className="px-2 py-1 text-[10px] font-black text-indigo-400 flex items-center gap-1.5 uppercase">
                      <Shield className="w-3 h-3" />
                      <span>دسترسی‌ها و نقش‌های سیستم</span>
                    </div>
                    {filteredOptions.filter(o => o.category === 'role').map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelect(opt)}
                        className={`w-full text-right px-3 py-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                          value === opt.label ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40' : 'hover:bg-slate-800/80 text-slate-200'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-100">{opt.label}</div>
                          {opt.subLabel && <div className="text-[10px] text-slate-400">{opt.subLabel}</div>}
                        </div>
                        {value === opt.label && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. Users Group */}
                {filteredOptions.some(o => o.category === 'user') && (
                  <div className="p-1">
                    <div className="px-2 py-1 text-[10px] font-black text-emerald-400 flex items-center gap-1.5 uppercase">
                      <UserIcon className="w-3 h-3" />
                      <span>کاربران و پرسنل سیستم</span>
                    </div>
                    {filteredOptions.filter(o => o.category === 'user').map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelect(opt)}
                        className={`w-full text-right px-3 py-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                          value === opt.label ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40' : 'hover:bg-slate-800/80 text-slate-200'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-100">{opt.label}</div>
                          {opt.subLabel && <div className="text-[10px] text-slate-400">{opt.subLabel}</div>}
                        </div>
                        {value === opt.label && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* 3. Departments Group */}
                {filteredOptions.some(o => o.category === 'department') && (
                  <div className="p-1">
                    <div className="px-2 py-1 text-[10px] font-black text-amber-400 flex items-center gap-1.5 uppercase">
                      <Layers className="w-3 h-3" />
                      <span>واحدهای سازمانی</span>
                    </div>
                    {filteredOptions.filter(o => o.category === 'department').map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelect(opt)}
                        className={`w-full text-right px-3 py-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                          value === opt.label ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40' : 'hover:bg-slate-800/80 text-slate-200'
                        }`}
                      >
                        <div className="font-bold text-slate-100">{opt.label}</div>
                        {value === opt.label && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* 4. Cost Centers & Companies */}
                {filteredOptions.some(o => o.category === 'cost_center') && (
                  <div className="p-1">
                    <div className="px-2 py-1 text-[10px] font-black text-sky-400 flex items-center gap-1.5 uppercase">
                      <Building2 className="w-3 h-3" />
                      <span>شرکت‌ها و مراکز هزینه شعب</span>
                    </div>
                    {filteredOptions.filter(o => o.category === 'cost_center').map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelect(opt)}
                        className={`w-full text-right px-3 py-2 rounded-xl text-xs flex items-center justify-between transition cursor-pointer ${
                          value === opt.label ? 'bg-sky-600/30 text-sky-200 border border-sky-500/40' : 'hover:bg-slate-800/80 text-slate-200'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-slate-100">{opt.label}</div>
                          {opt.subLabel && <div className="text-[10px] text-slate-400">{opt.subLabel}</div>}
                        </div>
                        {value === opt.label && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
