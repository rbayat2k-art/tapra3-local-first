import React, { useState } from 'react';
import { Product, User, SystemRole, SystemPermission } from '../types';
import {
  applyCatalogRevision, toVisibleProductView, validateNonNegativeCatalogNumbers,
  validateUniqueCatalogCode, withCatalogMetadata
} from '../utils/catalog';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { formatPortalMoney, getPortalNowTimestamp, splitPortalTimestamp } from '../utils/operationalFormat';
import { Package, Pencil, Plus, X } from 'lucide-react';

interface ProductsViewProps {
  products: Product[];
  onUpdateProducts: (products: Product[]) => void;
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const emptyForm = {
  code: '', name: '', category: '', model: '', color: '', weight: '', dimensions: '', unit: 'دستگاه',
  quantity: '0', purchasePrice: '0', salePrice: '0', warranty: '', description: '', isActive: true, editReason: ''
};
const inputClass = 'min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]';

export const ProductsView: React.FC<ProductsViewProps> = ({ products, onUpdateProducts, currentUser, roles, effectivePermissions, impersonatorAdmin }) => {
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canManage = hasPermission(effectivePermissions, ['manage_products']);
  const canViewPurchasePrice = hasPermission(effectivePermissions, ['view_purchase_price']);
  if (!currentUser) return null;
  if (!canManage) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-secondary)]">دسترسی مدیریت کالا را ندارید.</div>;

  const closeForm = () => { setForm(emptyForm); setEditingId(null); setShowForm(false); setError(''); };
  const startCreate = () => { setForm(emptyForm); setEditingId(null); setShowForm(true); setError(''); };
  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      code: product.code, name: product.name, category: product.category, model: product.model || '', color: product.color || '',
      weight: product.weight || '', dimensions: product.dimensions || '', unit: product.unit, quantity: String(product.quantity),
      purchasePrice: String(product.purchasePrice), salePrice: String(product.salePrice), warranty: product.warranty || '',
      description: product.description || '', isActive: product.isActive, editReason: ''
    });
    setShowForm(true); setError('');
  };

  const handleSave = () => {
    if (!hasPermission(effectivePermissions, ['manage_products'])) { setError('مجوز مدیریت کالا را ندارید.'); return; }
    if (!form.name.trim()) { setError('نام کالا الزامی است.'); return; }
    const codeError = validateUniqueCatalogCode(products, form.code, editingId || undefined);
    if (codeError) { setError(codeError); return; }
    const numbers = { quantity: Number(form.quantity), salePrice: Number(form.salePrice), purchasePrice: Number(form.purchasePrice) };
    const numberError = validateNonNegativeCatalogNumbers(numbers);
    if (numberError) { setError(numberError); return; }

    if (!editingId) {
      const created: Product = withCatalogMetadata({
        id: `prod_${Date.now()}`, code: form.code.trim(), name: form.name.trim(), category: form.category.trim() || 'سایر',
        model: form.model.trim() || undefined, color: form.color.trim() || undefined, weight: form.weight.trim() || undefined,
        dimensions: form.dimensions.trim() || undefined, unit: form.unit.trim() || 'دستگاه', quantity: numbers.quantity,
        purchasePrice: canViewPurchasePrice ? numbers.purchasePrice : 0, salePrice: numbers.salePrice,
        warranty: form.warranty.trim() || undefined, description: form.description.trim() || undefined, isActive: form.isActive
      });
      const updated = [created, ...products];
      storage.saveProducts(updated);
      logAudit({ action: 'product_created', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'manage_products', targetId: created.id, details: `${created.code} — ${created.name}` });
      onUpdateProducts(updated); closeForm(); return;
    }

    const existing = products.find((item) => item.id === editingId);
    if (!existing) { setError('رکورد کالا پیدا نشد.'); return; }
    const revision = applyCatalogRevision({
      existing: withCatalogMetadata(existing), actor: currentUser, reason: form.editReason, changedAt: getPortalNowTimestamp(),
      patch: {
        code: form.code.trim(), name: form.name.trim(), category: form.category.trim() || 'سایر', model: form.model.trim() || undefined,
        color: form.color.trim() || undefined, weight: form.weight.trim() || undefined, dimensions: form.dimensions.trim() || undefined,
        unit: form.unit.trim() || 'دستگاه', quantity: numbers.quantity,
        purchasePrice: canViewPurchasePrice ? numbers.purchasePrice : existing.purchasePrice,
        salePrice: numbers.salePrice, warranty: form.warranty.trim() || undefined,
        description: form.description.trim() || undefined, isActive: form.isActive
      }
    });
    if (revision.ok === false) { setError(revision.error); return; }
    const updated = products.map((item) => item.id === editingId ? revision.record : item);
    storage.saveProducts(updated);
    logAudit({ action: 'product_version_created', effectiveUser: currentUser, impersonatorAdmin, roles, permissionUsed: 'manage_products', targetId: existing.id, details: `v${revision.record.version}: ${revision.changedFields.join(', ')} — ${form.editReason.trim()}` });
    onUpdateProducts(updated); closeForm();
  };

  return <div className="space-y-5" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]"><Package className="h-5 w-5"/> کالاها</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">ویرایش نسخه‌دار است؛ Snapshot فاکتورهای قبلی تغییر نمی‌کند و قیمت خرید فقط با مجوز مستقل دیده می‌شود.</p></div>
      <button onClick={startCreate} className="flex min-h-11 items-center gap-1 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4"/> کالای جدید</button>
    </header>

    {showForm && <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="font-bold text-[var(--text-primary)]">{editingId ? 'ویرایش نسخه‌دار کالا' : 'کالای جدید'}</h3><button onClick={closeForm} aria-label="بستن"><X className="h-5 w-5 text-[var(--text-secondary)]"/></button></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input className={inputClass} placeholder="کد کالا *" value={form.code} onChange={(e) => setForm({...form, code:e.target.value})}/>
        <input className={inputClass} placeholder="نام کالا *" value={form.name} onChange={(e) => setForm({...form, name:e.target.value})}/>
        <input className={inputClass} placeholder="دسته‌بندی" value={form.category} onChange={(e) => setForm({...form, category:e.target.value})}/>
        <input className={inputClass} placeholder="واحد شمارش" value={form.unit} onChange={(e) => setForm({...form, unit:e.target.value})}/>
        <input className={inputClass} placeholder="مدل" value={form.model} onChange={(e) => setForm({...form, model:e.target.value})}/>
        <input className={inputClass} placeholder="رنگ" value={form.color} onChange={(e) => setForm({...form, color:e.target.value})}/>
        <input className={inputClass} placeholder="وزن" value={form.weight} onChange={(e) => setForm({...form, weight:e.target.value})}/>
        <input className={inputClass} placeholder="ابعاد" value={form.dimensions} onChange={(e) => setForm({...form, dimensions:e.target.value})}/>
        <input className={inputClass} type="number" min="0" placeholder="موجودی" value={form.quantity} onChange={(e) => setForm({...form, quantity:e.target.value})}/>
        {canViewPurchasePrice && <input className={inputClass} type="number" min="0" placeholder="قیمت خرید" value={form.purchasePrice} onChange={(e) => setForm({...form, purchasePrice:e.target.value})}/>}
        <input className={inputClass} type="number" min="0" placeholder="قیمت فروش" value={form.salePrice} onChange={(e) => setForm({...form, salePrice:e.target.value})}/>
        <input className={inputClass} placeholder="گارانتی" value={form.warranty} onChange={(e) => setForm({...form, warranty:e.target.value})}/>
        <textarea className={`${inputClass} md:col-span-2`} placeholder="توضیح" value={form.description} onChange={(e) => setForm({...form, description:e.target.value})}/>
        <select className={inputClass} value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm({...form, isActive:e.target.value === 'active'})}><option value="active">فعال</option><option value="inactive">غیرفعال</option></select>
        {editingId && <input className={`${inputClass} md:col-span-2`} placeholder="دلیل ویرایش *" value={form.editReason} onChange={(e) => setForm({...form, editReason:e.target.value})}/>}
      </div>
      {error && <div className="rounded-lg bg-[var(--danger-soft)] p-2 text-sm text-[var(--danger)]">{error}</div>}
      <button onClick={handleSave} className="min-h-11 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white">{editingId ? 'ثبت نسخه جدید' : 'ثبت کالا'}</button>
    </section>}

    <section className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <table className="w-full min-w-[900px] text-sm"><thead><tr className="border-b border-[var(--border)] text-right text-[var(--text-secondary)]">
        <th className="p-2">کد</th><th className="p-2">نام</th><th className="p-2">دسته</th><th className="p-2">موجودی</th>{canViewPurchasePrice && <th className="p-2">قیمت خرید</th>}<th className="p-2">قیمت فروش</th><th className="p-2">نسخه/آخرین تغییر</th><th className="p-2">وضعیت</th><th className="p-2">عملیات</th>
      </tr></thead><tbody>{products.map((product) => { const view=toVisibleProductView(product,canViewPurchasePrice); const stamp=splitPortalTimestamp(product.updatedAt); return <tr key={product.id} className="border-b border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
        <td className="p-2 font-mono">{view.code}</td><td className="p-2">{view.name}</td><td className="p-2 text-[var(--text-secondary)]">{view.category}</td><td className="p-2">{product.quantity}</td>
        {canViewPurchasePrice && <td className="p-2">{formatPortalMoney(view.purchasePrice || 0)}</td>}<td className="p-2">{formatPortalMoney(view.salePrice)}</td>
        <td className="p-2 text-xs text-[var(--text-secondary)]">v{product.version || 1}{product.updatedAt ? ` — ${stamp.date} ${stamp.time}` : ' — اولیه'}</td>
        <td className="p-2"><span className={`rounded-full px-2 py-1 text-xs ${product.isActive ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'}`}>{product.isActive?'فعال':'غیرفعال'}</span></td>
        <td className="p-2"><button onClick={()=>startEdit(product)} className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-[var(--primary)]"><Pencil className="h-4 w-4"/> ویرایش</button></td>
      </tr>})}</tbody></table>
    </section>
  </div>;
};
