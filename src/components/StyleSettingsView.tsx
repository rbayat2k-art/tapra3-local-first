import React, { useState } from 'react';
import { 
  Palette, Type, Sun, Moon, Check, Sparkles, Sliders, Eye, RefreshCw, Layers
} from 'lucide-react';

export interface FontOption {
  id: string;
  name: string;
  persianName: string;
  description: string;
  cssFamily: string;
  sampleText: string;
}

export const AVAILABLE_FONTS: FontOption[] = [
  {
    id: 'vazir',
    name: 'Vazirmatn / Vazir',
    persianName: 'فونت وزیر / وزیرمتن',
    description: 'فونت استاندارد، بسیار خوانا و محترمانه مخصوص سیستم‌های اداری و مالی',
    cssFamily: "'Vazirmatn', 'Vazir', system-ui, sans-serif",
    sampleText: 'سامانه خزانه‌داری یکپارچه tapra - مبلغ ۲۵۰,۰۰۰,۰۰۰ ریال'
  },
  {
    id: 'shabnam',
    name: 'Shabnam',
    persianName: 'فونت شبنم',
    description: 'فونت مدرن، زیبا و خوش‌ساخت برای داشبوردهای مدیریتی و گزارشات',
    cssFamily: "'Shabnam', 'Vazirmatn', system-ui, sans-serif",
    sampleText: 'درخواست پرداخت بابت خرید چای و تشریفات شعبه دفتر مرکزی'
  },
  {
    id: 'samim',
    name: 'Samim',
    persianName: 'فونت صمیم',
    description: 'فونت صمیمی، ساده و روان برای گفتگوی همکاران و ثبت سریع اطلاعات',
    cssFamily: "'Samim', 'Vazirmatn', system-ui, sans-serif",
    sampleText: 'کارتابل تایید خزانه‌داری - ۵ درخواست در انتظار واریز بانک'
  },
  {
    id: 'sahel',
    name: 'Sahel',
    persianName: 'فونت ساحل',
    description: 'فونت کلاسیک و هموار مناسب برای مطالعه طولانی اسناد و نامه‌های رسمی',
    cssFamily: "'Sahel', 'Vazirmatn', system-ui, sans-serif",
    sampleText: 'گزارش ارزیابی صورت‌حساب‌ها و فاکتورهای رسمی ارسالی از تامین‌کنندگان'
  },
  {
    id: 'yekan',
    name: 'Yekan Bakh',
    persianName: 'فونت یکان / یکان‌بخ',
    description: 'فونت هندسی و ساختاریافته برای اعداد و جدول‌های مالی سنگین',
    cssFamily: "'Yekan', 'Vazirmatn', system-ui, sans-serif",
    sampleText: 'شماره پیگیری: K50002 | تاریخ: ۱۴۰۵/۰۵/۱۱ | مبلغ: ۴۵,۸۰۰,۰۰۰ ریال'
  },
  {
    id: 'system',
    name: 'System Default',
    persianName: 'فونت پیش‌فرض سیستم (System UI)',
    description: 'استفاده از فونت اصلی دستگاه بدون بارگذاری اضافه',
    cssFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    sampleText: 'سیستم استاندارد سیستم‌عامل کاربر (تلفن همراه یا ویندوز)'
  }
];

interface StyleSettingsViewProps {
  currentFont: string;
  onSelectFont: (fontId: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  fontSize: 'normal' | 'medium' | 'large';
  onChangeFontSize: (size: 'normal' | 'medium' | 'large') => void;
  accentColor: 'emerald' | 'indigo' | 'rose' | 'amber';
  onChangeAccentColor: (color: 'emerald' | 'indigo' | 'rose' | 'amber') => void;
}

export const StyleSettingsView: React.FC<StyleSettingsViewProps> = ({
  currentFont,
  onSelectFont,
  theme,
  onToggleTheme,
  fontSize,
  onChangeFontSize,
  accentColor,
  onChangeAccentColor
}) => {
  const activeFontObj = AVAILABLE_FONTS.find(f => f.id === currentFont) || AVAILABLE_FONTS[0];

  return (
    <div className="space-y-6 dir-rtl max-w-6xl mx-auto">
      
      {/* Header Banner */}
      <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950 border border-slate-800 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/30 shrink-0">
            <Palette className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">تنظیمات استایل و فونت سیستم</h2>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold text-[11px] rounded-full border border-emerald-500/30">
                شخصی‌سازی ظاهری
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              تنظیم فونت‌های لوکال، تم تاریک/روشن و رنگ‌های شاخص سامانه خزانه‌داری بدون نیاز به اینترنت یا سرور خارجی
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-2xl border border-slate-700 text-xs text-slate-300 font-bold">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>تغییرات به صورت آنی (Live) اعمال می‌شوند</span>
        </div>
      </div>

      {/* Main Grid: Font Selector & Customization */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Columns: Font Selection Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Type className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-black text-slate-800 dark:text-white">۱. انتخاب فونت اصلی سامانه (Local Font Selection)</h3>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">
                فونت فعلی: <strong className="text-emerald-600 dark:text-emerald-400">{activeFontObj.persianName}</strong>
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              تمامی فونت‌ها به صورت کامل روی فایل‌های پروژه پیاده‌سازی شده‌اند و جهت حفظ امنیت و سرعت، نیازی به اتصال به گوگل‌فونتس یا CDN خارجی ندارند.
            </p>

            {/* Font Options Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {AVAILABLE_FONTS.map((f) => {
                const isSelected = f.id === currentFont;
                return (
                  <div
                    key={f.id}
                    onClick={() => onSelectFont(f.id)}
                    className={`p-4 rounded-2xl border-2 transition cursor-pointer relative flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-600/10'
                        : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900/80'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-xs font-black ${isSelected ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-white'}`}>
                          {f.persianName}
                        </span>
                        {isSelected ? (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{f.name}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                        {f.description}
                      </p>
                    </div>

                    {/* Font Preview Snippet */}
                    <div 
                      style={{ fontFamily: f.cssFamily }}
                      className="p-2.5 bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 text-center tracking-normal shadow-xs"
                    >
                      {f.sampleText}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Typography Scale / Density */}
          <div className="p-5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Sliders className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-black text-slate-800 dark:text-white">۲. تراکم قلم و اندازه فونت‌ها (Font Size Scaling)</h3>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'normal', label: 'اندازه استاندارد (۱۰۰٪)', desc: 'مناسب مانیتورهای عادی' },
                { id: 'medium', label: 'اندازه بزرگ (۱۱۰٪)', desc: 'خوانایی بالا برای آمار و جدول‌ها' },
                { id: 'large', label: 'اندازه بسیار بزرگ (۱۲۰٪)', desc: 'مناسب افراد کم‌بینا یا صفحات بزرگ' },
              ].map((sz) => (
                <button
                  key={sz.id}
                  type="button"
                  onClick={() => onChangeFontSize(sz.id as any)}
                  className={`p-3 rounded-xl border text-right transition cursor-pointer ${
                    fontSize === sz.id
                      ? 'bg-indigo-50 dark:bg-indigo-600/20 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-bold'
                      : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xs font-black block">{sz.label}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1">{sz.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Column: Theme, Colors & Live Preview Box */}
        <div className="space-y-4">
          
          {/* Theme Selector */}
          <div className="p-5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Layers className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              <h3 className="text-sm font-black text-slate-800 dark:text-white">۳. حالت تم ظاهری (Theme Mode)</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (theme !== 'dark') onToggleTheme();
                }}
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center gap-2 transition cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-slate-950 border-amber-500 text-amber-300 font-black shadow-lg shadow-amber-500/10'
                    : 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Moon className="w-6 h-6 text-amber-400" />
                <span className="text-xs font-bold">تم تاریک (شب)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (theme !== 'light') onToggleTheme();
                }}
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center gap-2 transition cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white border-emerald-600 text-emerald-800 font-black shadow-lg shadow-emerald-600/10'
                    : 'bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Sun className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold">تم روشن (روز)</span>
              </button>
            </div>
          </div>

          {/* Accent Colors */}
          <div className="p-5 bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Palette className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-black text-slate-800 dark:text-white">۴. رنگ شاخص سیستم (Accent Color)</h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'emerald', name: 'زمردی خزانه‌داری', bg: 'bg-emerald-600' },
                { id: 'indigo', name: 'نیلی شاهانه', bg: 'bg-indigo-600' },
                { id: 'rose', name: 'یاقوتی سری', bg: 'bg-rose-600' },
                { id: 'amber', name: 'کهربایی زرین', bg: 'bg-amber-500' },
              ].map((ac) => (
                <button
                  key={ac.id}
                  type="button"
                  onClick={() => onChangeAccentColor(ac.id as any)}
                  className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition cursor-pointer ${
                    accentColor === ac.id
                      ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 dark:border-white text-slate-900 dark:text-white font-extrabold shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full ${ac.bg} border border-black/10 dark:border-white/20`} />
                  <span>{ac.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Live System Preview */}
          <div className="p-5 bg-slate-50 dark:bg-slate-950 border-2 border-indigo-400/40 dark:border-indigo-500/40 rounded-2xl space-y-3 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-black text-indigo-700 dark:text-indigo-300">پیش‌نمایش زنده المان‌های سیستم</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">Live UI Preview</span>
            </div>

            <div className="space-y-2.5">
              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 shadow-xs">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block">عنوان نمونه:</span>
                <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                  درخواست پرداخت فاکتور شرکت مادر tapra
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">مبلغ کل:</span>
                  <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono dir-ltr">
                    ۱۲۵,۰۰۰,۰۰۰ ریال
                  </span>
                </div>
                <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-extrabold">
                  تایید شده
                </span>
              </div>

              <div className="p-2.5 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-600 dark:text-slate-300">
                این پیش‌نمایش نحوه نمایش اعداد فارسی، متون و دکمه‌ها را با فونت انتخاب شده نشان می‌دهد.
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
