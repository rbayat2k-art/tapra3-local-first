import React, { useState } from 'react';
import { Customer, User } from '../types';
import { getJalaliNow } from '../utils/persianDate';
import {
  getVisibleCustomerIds,
  findCustomerByPhone,
  canStartNewSale,
  getCurrentActiveSalespersonId,
  startNewSaleCycle,
  closeSaleCycle
} from '../utils/salesHierarchy';
import { Phone, UserPlus, Search, Lock, Clock, CheckCircle2, History, MapPin, Users as UsersIcon, PlayCircle, StopCircle } from 'lucide-react';

interface CustomersViewProps {
  customers: Customer[];
  users: User[];
  currentUser: User | null;
  onUpdateCustomers: (customers: Customer[]) => void;
}

const emptyForm = { fullName: '', phone2: '', address: '', province: '', city: '', postalCode: '' };

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  users,
  currentUser,
  onUpdateCustomers
}) => {
  const [phoneSearchInput, setPhoneSearchInput] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [newCustomerForm, setNewCustomerForm] = useState(emptyForm);

  if (!currentUser) return null;

  const userNameById = (id: string) => users.find((u) => u.id === id)?.fullName || id;

  const selectedCustomer = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) || null : null;

  const visibleCustomerIds = getVisibleCustomerIds(currentUser, users, customers);
  const visibleCustomers = customers.filter((c) => visibleCustomerIds.includes(c.id));

  const handleSearch = () => {
    const phone = phoneSearchInput.trim();
    if (!phone) {
      alert('لطفاً شماره تماس مشتری را وارد کنید.');
      return;
    }
    const found = findCustomerByPhone(phone, customers);
    if (found) {
      setSelectedCustomerId(found.id);
      setHasSearched(false);
    } else {
      setSelectedCustomerId(null);
      setNewCustomerForm(emptyForm);
      setHasSearched(true);
    }
  };

  const handleRegisterNewCustomer = () => {
    const phone = phoneSearchInput.trim();
    if (!phone) return;
    const newCustomer: Customer = {
      id: `cust_${Date.now()}`,
      fullName: newCustomerForm.fullName.trim() || undefined,
      phone1: phone,
      phone2: newCustomerForm.phone2.trim() || undefined,
      address: newCustomerForm.address.trim() || undefined,
      province: newCustomerForm.province.trim() || undefined,
      city: newCustomerForm.city.trim() || undefined,
      postalCode: newCustomerForm.postalCode.trim() || undefined,
      createdAt: getJalaliNow(),
      activityLog: [{ salespersonId: currentUser.id, startedAt: getJalaliNow(), status: 'active' }]
    };
    onUpdateCustomers([newCustomer, ...customers]);
    setSelectedCustomerId(newCustomer.id);
    setHasSearched(false);
    setNewCustomerForm(emptyForm);
    alert('مشتری جدید ثبت و چرخه‌ی فروش برای شما آغاز شد.');
  };

  const handleStartNewCycle = (customer: Customer) => {
    if (!canStartNewSale(customer)) return;
    const updated = startNewSaleCycle(customer, currentUser.id);
    onUpdateCustomers(customers.map((c) => (c.id === customer.id ? updated : c)));
    setSelectedCustomerId(customer.id);
    setHasSearched(false);
  };

  const handleCloseCycle = (customer: Customer) => {
    if (getCurrentActiveSalespersonId(customer) !== currentUser.id) return;
    if (!confirm('چرخه‌ی فروش فعلی این مشتری بسته شود؟')) return;
    const updated = closeSaleCycle(customer, currentUser.id);
    onUpdateCustomers(customers.map((c) => (c.id === customer.id ? updated : c)));
  };

  const renderCustomerDetail = (customer: Customer) => {
    const activeSalespersonId = getCurrentActiveSalespersonId(customer);
    const isFree = activeSalespersonId === null;
    const isOwnedByMe = activeSalespersonId === currentUser.id;
    const isLockedByOther = !isFree && !isOwnedByMe;

    return (
      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-white">{customer.fullName || 'مشتری بدون نام ثبت‌شده'}</h3>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5" dir="ltr">{customer.phone1}{customer.phone2 ? ` / ${customer.phone2}` : ''}</p>
          </div>
          {isFree && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">آزاد</span>
          )}
          {isOwnedByMe && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">در حال پیگیری توسط شما</span>
          )}
          {isLockedByOther && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">قفل‌شده توسط دیگری</span>
          )}
        </div>

        {(customer.address || customer.province || customer.city || customer.postalCode) && (
          <div className="text-[11px] text-slate-400 flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <span>{[customer.province, customer.city, customer.address, customer.postalCode].filter(Boolean).join('، ')}</span>
          </div>
        )}

        {isLockedByOther && (
          <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>این مشتری هم‌اکنون توسط <strong className="text-amber-200">{userNameById(activeSalespersonId!)}</strong> در حال پیگیری است. تا تکمیل/بسته‌شدن این چرخه، امکان ثبت چرخه‌ی فروش جدید برای شما وجود ندارد.</span>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-500" />
            تاریخچه‌ی چرخه‌های فروش
          </div>
          {(customer.activityLog || []).length === 0 ? (
            <p className="text-[11px] text-slate-500">هنوز چرخه‌ای ثبت نشده است.</p>
          ) : (
            <div className="space-y-1.5">
              {(customer.activityLog || []).map((log, idx) => (
                <div key={idx} className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    {log.status === 'active' ? <PlayCircle className="w-3.5 h-3.5 text-indigo-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    <span className="font-bold">{userNameById(log.salespersonId)}</span>
                  </div>
                  <span className="text-slate-500 font-mono" dir="ltr">{log.startedAt}</span>
                  <span className={`px-2 py-0.5 rounded-full font-bold ${log.status === 'active' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {log.status === 'active' ? 'در جریان' : 'تکمیل‌شده'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
          {isFree && (
            <button
              onClick={() => handleStartNewCycle(customer)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" />
              شروع چرخه‌ی فروش جدید
            </button>
          )}
          {isOwnedByMe && (
            <button
              onClick={() => handleCloseCycle(customer)}
              className="px-4 py-2 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition"
              title="عملیات دستی/تستی — منطق واقعی تکمیل فاکتور در فاز بعدی اضافه می‌شود"
            >
              <StopCircle className="w-4 h-4" />
              بستن چرخه‌ی فروش
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl space-y-6 dir-rtl">
      {/* Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-3">
        <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center shrink-0">
          <UsersIcon className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-white">مشتریان (ماژول فروش)</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            جستجو یا ثبت مشتری بر اساس شماره تماس؛ قفل مالکیت پویا از ثبت هم‌زمان دو فروشنده روی یک مشتری جلوگیری می‌کند.
          </p>
        </div>
      </div>

      {/* Phone search / register form */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5 text-slate-500" />
          شماره تماس مشتری
        </label>
        <div className="flex items-center gap-2">
          <input
            value={phoneSearchInput}
            onChange={(e) => setPhoneSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="مثلاً 09121234567"
            dir="ltr"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            جستجو
          </button>
        </div>

        {hasSearched && !selectedCustomer && (
          <div className="p-4 bg-slate-950/70 border border-dashed border-slate-700 rounded-xl space-y-3">
            <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" />
              این شماره پیدا نشد — ثبت مشتری جدید
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                value={newCustomerForm.fullName}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="نام و نام خانوادگی (اختیاری)"
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                value={newCustomerForm.phone2}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, phone2: e.target.value }))}
                placeholder="شماره تماس دوم (اختیاری)"
                dir="ltr"
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
              <input
                value={newCustomerForm.province}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, province: e.target.value }))}
                placeholder="استان (اختیاری)"
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                value={newCustomerForm.city}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="شهر (اختیاری)"
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                value={newCustomerForm.address}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="آدرس (اختیاری)"
                className="sm:col-span-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <input
                value={newCustomerForm.postalCode}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, postalCode: e.target.value }))}
                placeholder="کد پستی (اختیاری)"
                dir="ltr"
                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleRegisterNewCustomer}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              ثبت مشتری و شروع فروش
            </button>
          </div>
        )}
      </div>

      {selectedCustomer && renderCustomerDetail(selectedCustomer)}

      {/* Visible customers list (hierarchy-scoped) */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
          <UsersIcon className="w-3.5 h-3.5 text-slate-500" />
          مشتریان قابل‌مشاهده برای شما ({visibleCustomers.length})
        </div>
        {visibleCustomers.length === 0 ? (
          <div className="text-center text-xs text-slate-500 p-8 border border-dashed border-slate-800 rounded-2xl">
            هنوز مشتری‌ای در دید سلسله‌مراتبی شما ثبت نشده است.
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleCustomers.map((c) => {
              const activeId = getCurrentActiveSalespersonId(c);
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCustomerId(c.id); setHasSearched(false); }}
                  className="w-full text-right p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl flex items-center justify-between gap-2 transition cursor-pointer"
                >
                  <div>
                    <span className="text-xs font-bold text-white">{c.fullName || 'بدون نام'}</span>
                    <span className="text-[10px] text-slate-500 font-mono mr-2" dir="ltr">{c.phone1}</span>
                  </div>
                  {activeId ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-400">
                      <Clock className="w-3 h-3" />
                      {userNameById(activeId)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-400">آزاد</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
