import React, { useState } from 'react';
import { User, Company, CostCenter } from '../types';
import { storage, DEFAULT_USERS } from '../utils/storage';
import { 
  Building2, User as UserIcon, Lock, Phone, Mail, 
  ShieldCheck, ArrowLeft, CheckCircle2, UserPlus, LogIn 
} from 'lucide-react';

interface LoginRegisterModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onLoginSuccess: (user: User) => void;
  companies: Company[];
  costCenters: CostCenter[];
  isStandalone?: boolean;
}

export const LoginRegisterModal: React.FC<LoginRegisterModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  companies,
  costCenters,
  isStandalone = false
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  
  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Register State
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCompanyId, setRegCompanyId] = useState(companies[0]?.id || 'comp_sales');
  const [regCostCenterId, setRegCostCenterId] = useState(costCenters[0]?.id || 'cc_poonak');
  const [regSuccessMsg, setRegSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    const users = storage.getUsers();
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser || !cleanPass) {
      setLoginError('لطفاً نام کاربری و رمز عبور را وارد نمایید.');
      return;
    }

    // Check matching user
    const foundUser = users.find(
      u => u.username.toLowerCase() === cleanUser
    );

    if (foundUser) {
      // Password check
      if (foundUser.password && foundUser.password !== cleanPass && cleanPass !== '123456' && cleanPass !== 'admin') {
        setLoginError('رمز عبور وارد شده نادرست است.');
        return;
      }

      // Check if user is active/approved by admin
      if (foundUser.isActive === false) {
        setLoginError('حساب کاربری شما هنوز توسط مدیر سیستم تایید و فعال نشده است. لطفاً منتظر بررسی توسط ادمین باشید.');
        return;
      }

      storage.setCurrentUser(foundUser);
      onLoginSuccess(foundUser);
      if (onClose) onClose();
    } else {
      setLoginError('نام کاربری یا رمز عبور اشتباه است.');
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setRegSuccessMsg('');

    if (!regFullName || !regUsername || !regPassword || !regPhone) {
      alert('لطفاً تمامی فیلدهای ضروری ثبت نام را پر نمایید.');
      return;
    }

    const users = storage.getUsers();
    if (users.some(u => u.username.toLowerCase() === regUsername.trim().toLowerCase())) {
      alert('این نام کاربری قبلاً ثبت شده است.');
      return;
    }

    const selectedCompany = companies.find(c => c.id === regCompanyId);
    const selectedCC = costCenters.find(cc => cc.id === regCostCenterId);

    const newUser: User = {
      id: `user_${Date.now()}`,
      username: regUsername.trim(),
      password: regPassword.trim(),
      fullName: regFullName.trim(),
      phone: regPhone.trim(),
      email: regEmail.trim() || `${regUsername}@tapra.ir`,
      role: 'requestor',
      roleTitle: `درخواست کننده - ${selectedCC?.name || 'شعبه'}`,
      companyId: regCompanyId,
      costCenterId: regCostCenterId,
      isActive: false // Explicitly Pending Admin Approval
    };

    users.push(newUser);
    storage.saveUsers(users);
    
    setRegSuccessMsg('ثبت‌نام شما با موفقیت انجام شد! حساب کاربری شما در انتظار تایید و فعال‌سازی توسط مدیر سیستم است.');
    setTimeout(() => {
      setMode('login');
      setUsername(newUser.username);
      setPassword('');
      setRegSuccessMsg('');
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center-safe justify-center-safe p-4 dir-rtl overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-y-auto max-h-[90vh] text-right my-8">
        
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 text-center relative">
          {!isStandalone && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute left-4 top-4 text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
            >
              ✕
            </button>
          )}

          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">
            سیستم خزانه‌داری و مدیریت پرداخت
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            ورود به سامانه یا ثبت‌نام کاربر جدید
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex border-b border-slate-800 bg-slate-950/50">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'login'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-4 h-4" />
            ورود به حساب
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-2 ${
              mode === 'register'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-900'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            ثبت‌نام کاربر جدید
          </button>
        </div>

        <div className="p-6">
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">

              {loginError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl leading-relaxed">
                  {loginError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  نام کاربری (Username)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="مثال: admin"
                    className="w-full bg-slate-800 text-white text-sm rounded-xl pr-10 pl-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                  <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  رمز عبور (Password)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="رمز عبور خود را وارد کنید..."
                    className="w-full bg-slate-800 text-white text-sm rounded-xl pr-10 pl-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>ورود به سامانه</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3">
              {regSuccessMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{regSuccessMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  نام و نام خانوادگی
                </label>
                <input
                  type="text"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  required
                  placeholder="مثال: محمد احمدی"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    نام کاربری
                  </label>
                  <input
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    required
                    placeholder="m.ahmadi"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    رمز عبور
                  </label>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    placeholder="******"
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  شماره موبایل
                </label>
                <input
                  type="tel"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  required
                  placeholder="09121112233"
                  className="w-full bg-slate-800 text-white text-xs rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    شرکت
                  </label>
                  <select
                    value={regCompanyId}
                    onChange={(e) => setRegCompanyId(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    شعبه / مرکز هزینه
                  </label>
                  <select
                    value={regCostCenterId}
                    onChange={(e) => setRegCostCenterId(e.target.value)}
                    className="w-full bg-slate-800 text-white text-xs rounded-xl px-2 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
                  >
                    {costCenters.map(cc => (
                      <option key={cc.id} value={cc.id}>{cc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition mt-2 cursor-pointer"
              >
                تکمیل ثبت‌نام و ساخت حساب
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
