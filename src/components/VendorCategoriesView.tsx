import React, { useState } from 'react';
import { Vendor, VendorCategory, User } from '../types';
import { Tags, Plus, Pencil, Trash2, X, ShieldAlert, Check } from 'lucide-react';

interface VendorCategoriesViewProps {
  categories: VendorCategory[];
  vendors: Vendor[];
  currentUser: User | null;
  onUpdateCategories: (categories: VendorCategory[]) => void;
}

export const VendorCategoriesView: React.FC<VendorCategoriesViewProps> = ({
  categories,
  vendors,
  currentUser,
  onUpdateCategories
}) => {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const isAdmin = currentUser?.role === 'admin' || !!currentUser?.customPermissions?.includes('manage_vendors');

  const countFor = (catName: string) => vendors.filter((v) => v.category === catName).length;

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto mt-10 p-6 bg-slate-900 border border-rose-500/30 rounded-3xl text-center space-y-3 dir-rtl">
        <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto" />
        <h2 className="text-sm font-black text-white">دسترسی محدود</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          مدیریت دسته‌بندی‌های دفترچه ذینفعان (افزودن، ویرایش، حذف) فقط در اختیار ادمین سیستم است.
          برای ثبت ذینفع جدید می‌توانید از لیست دسته‌بندی‌های موجود استفاده کنید.
        </p>
      </div>
    );
  }

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (categories.some((c) => c.name === name)) {
      alert('این دسته‌بندی از قبل وجود دارد.');
      return;
    }
    onUpdateCategories([...categories, { id: `vcat_${Date.now()}`, name }]);
    setNewName('');
  };

  const startEdit = (cat: VendorCategory) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  const saveEdit = (cat: VendorCategory) => {
    const name = editingName.trim();
    if (!name) return;
    onUpdateCategories(categories.map((c) => (c.id === cat.id ? { ...c, name } : c)));
    setEditingId(null);
  };

  const handleDelete = (cat: VendorCategory) => {
    const usageCount = countFor(cat.name);
    if (usageCount > 0) {
      alert(`این دسته‌بندی توسط ${usageCount} ذینفع استفاده شده و قابل حذف نیست. ابتدا دسته‌بندی آن ذینفعان را از دفترچه تغییر دهید.`);
      return;
    }
    if (!confirm(`دسته‌بندی «${cat.name}» حذف شود؟`)) return;
    onUpdateCategories(categories.filter((c) => c.id !== cat.id));
  };

  return (
    <div className="max-w-2xl space-y-6 dir-rtl">
      {/* Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center gap-3">
        <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center shrink-0">
          <Tags className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-white">دسته‌بندی‌های دفترچه ذینفعان</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            مدیریت زمینه‌های فعالیت ذینفعان و فروشندگان — فقط ادمین می‌تواند دسته‌بندی اضافه، ویرایش یا حذف کند.
          </p>
        </div>
      </div>

      {/* Add new */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="نام دسته‌بندی جدید (مثال: خدمات فنی و تاسیسات)"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleAdd}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          افزودن
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {categories.length === 0 && (
          <div className="text-center text-xs text-slate-500 p-8 border border-dashed border-slate-800 rounded-2xl">
            هنوز دسته‌بندی‌ای ثبت نشده است.
          </div>
        )}
        {categories.map((cat) => (
          <div key={cat.id} className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between gap-2">
            {editingId === cat.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEdit(cat)}
                  className="flex-1 bg-slate-800 border border-indigo-400 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
                <button onClick={() => saveEdit(cat)} className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer">
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingId(null)} className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-white">{cat.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    {countFor(cat.name)} ذینفع
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => startEdit(cat)} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer" title="ویرایش">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(cat)} className="p-2 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg cursor-pointer" title="حذف">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
