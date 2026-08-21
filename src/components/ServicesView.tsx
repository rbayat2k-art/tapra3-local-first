import React, { useState } from 'react';
import { ServiceCatalogItem, User, SystemRole, SystemPermission } from '../types';
import { applyCatalogRevision, validateNonNegativeCatalogNumbers, validateUniqueCatalogCode, withCatalogMetadata } from '../utils/catalog';
import { hasPermission } from '../utils/permissions';
import { storage } from '../utils/storage';
import { logAudit } from '../utils/auditLog';
import { formatPortalMoney, getPortalNowTimestamp, splitPortalTimestamp } from '../utils/operationalFormat';
import { Pencil, Plus, Wrench, X } from 'lucide-react';

interface ServicesViewProps {
  services: ServiceCatalogItem[];
  onUpdateServices: (services: ServiceCatalogItem[]) => void;
  currentUser: User | null;
  roles: SystemRole[];
  effectivePermissions: SystemPermission[] | null;
  impersonatorAdmin: User | null;
}

const emptyForm = { code:'', name:'', category:'', salePrice:'0', internalCost:'0', responsibleUnit:'', description:'', terms:'', warrantyOrValidityPeriod:'', requiresActivation:false, isActive:true, editReason:'' };
const inputClass = 'min-h-11 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]';

export const ServicesView: React.FC<ServicesViewProps> = ({ services, onUpdateServices, currentUser, roles, effectivePermissions, impersonatorAdmin }) => {
  const [form,setForm]=useState(emptyForm);
  const [showForm,setShowForm]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [error,setError]=useState('');
  const canManage=hasPermission(effectivePermissions,['manage_services']);
  const canViewInternalCost=hasPermission(effectivePermissions,['view_purchase_price']);
  if(!currentUser) return null;
  if(!canManage) return <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-secondary)]">دسترسی مدیریت خدمات را ندارید.</div>;

  const closeForm=()=>{setForm(emptyForm);setEditingId(null);setShowForm(false);setError('');};
  const startCreate=()=>{setForm(emptyForm);setEditingId(null);setShowForm(true);setError('');};
  const startEdit=(service:ServiceCatalogItem)=>{setEditingId(service.id);setForm({
    code:service.code,name:service.name,category:service.category,salePrice:String(service.salePrice),internalCost:String(service.internalCost||0),
    responsibleUnit:service.responsibleUnit||'',description:service.description||'',terms:service.terms||'',warrantyOrValidityPeriod:service.warrantyOrValidityPeriod||'',
    requiresActivation:service.requiresActivation,isActive:service.isActive,editReason:''
  });setShowForm(true);setError('');};

  const handleSave=()=>{
    if(!hasPermission(effectivePermissions,['manage_services'])){setError('مجوز مدیریت خدمت را ندارید.');return;}
    if(!form.name.trim()){setError('نام خدمت الزامی است.');return;}
    const codeError=validateUniqueCatalogCode(services,form.code,editingId||undefined);if(codeError){setError(codeError);return;}
    const numbers={salePrice:Number(form.salePrice),internalCost:Number(form.internalCost)};
    const numberError=validateNonNegativeCatalogNumbers(numbers);if(numberError){setError(numberError);return;}
    if(!editingId){
      const created:ServiceCatalogItem=withCatalogMetadata({id:`svc_${Date.now()}`,code:form.code.trim(),name:form.name.trim(),category:form.category.trim()||'سایر',salePrice:numbers.salePrice,
        internalCost:canViewInternalCost?numbers.internalCost:0,responsibleUnit:form.responsibleUnit.trim()||undefined,description:form.description.trim()||undefined,
        terms:form.terms.trim()||undefined,warrantyOrValidityPeriod:form.warrantyOrValidityPeriod.trim()||undefined,requiresActivation:form.requiresActivation,isActive:form.isActive});
      const updated=[created,...services];storage.saveServices(updated);logAudit({action:'service_created',effectiveUser:currentUser,impersonatorAdmin,roles,permissionUsed:'manage_services',targetId:created.id,details:`${created.code} — ${created.name}`});onUpdateServices(updated);closeForm();return;
    }
    const existing=services.find((item)=>item.id===editingId);if(!existing){setError('رکورد خدمت پیدا نشد.');return;}
    const revision=applyCatalogRevision({existing:withCatalogMetadata(existing),actor:currentUser,reason:form.editReason,changedAt:getPortalNowTimestamp(),patch:{
      code:form.code.trim(),name:form.name.trim(),category:form.category.trim()||'سایر',salePrice:numbers.salePrice,internalCost:canViewInternalCost?numbers.internalCost:existing.internalCost,
      responsibleUnit:form.responsibleUnit.trim()||undefined,description:form.description.trim()||undefined,terms:form.terms.trim()||undefined,
      warrantyOrValidityPeriod:form.warrantyOrValidityPeriod.trim()||undefined,requiresActivation:form.requiresActivation,isActive:form.isActive
    }});
    if(revision.ok===false){setError(revision.error);return;}
    const updated=services.map((item)=>item.id===editingId?revision.record:item);storage.saveServices(updated);
    logAudit({action:'service_version_created',effectiveUser:currentUser,impersonatorAdmin,roles,permissionUsed:'manage_services',targetId:existing.id,details:`v${revision.record.version}: ${revision.changedFields.join(', ')} — ${form.editReason.trim()}`});
    onUpdateServices(updated);closeForm();
  };

  return <div className="space-y-5" dir="rtl">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]"><Wrench className="h-5 w-5"/> خدمات</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">این صفحه فقط کاتالوگ خدمت را مدیریت می‌کند؛ کارتابل اجرای خدمت مستقل است.</p></div><button onClick={startCreate} className="flex min-h-11 items-center gap-1 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4"/> خدمت جدید</button></header>
    {showForm&&<section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="font-bold text-[var(--text-primary)]">{editingId?'ویرایش نسخه‌دار خدمت':'خدمت جدید'}</h3><button onClick={closeForm} aria-label="بستن"><X className="h-5 w-5 text-[var(--text-secondary)]"/></button></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input className={inputClass} placeholder="کد خدمت *" value={form.code} onChange={(e)=>setForm({...form,code:e.target.value})}/><input className={inputClass} placeholder="نام خدمت *" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/><input className={inputClass} placeholder="دسته‌بندی" value={form.category} onChange={(e)=>setForm({...form,category:e.target.value})}/><input className={inputClass} placeholder="واحد مسئول" value={form.responsibleUnit} onChange={(e)=>setForm({...form,responsibleUnit:e.target.value})}/>
        <input className={inputClass} type="number" min="0" placeholder="قیمت فروش" value={form.salePrice} onChange={(e)=>setForm({...form,salePrice:e.target.value})}/>{canViewInternalCost&&<input className={inputClass} type="number" min="0" placeholder="بهای داخلی" value={form.internalCost} onChange={(e)=>setForm({...form,internalCost:e.target.value})}/>}<input className={inputClass} placeholder="اعتبار/گارانتی" value={form.warrantyOrValidityPeriod} onChange={(e)=>setForm({...form,warrantyOrValidityPeriod:e.target.value})}/>
        <textarea className={`${inputClass} md:col-span-2`} placeholder="توضیح خدمت" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}/><textarea className={`${inputClass} md:col-span-2`} placeholder="شرایط استفاده/مدارک" value={form.terms} onChange={(e)=>setForm({...form,terms:e.target.value})}/>
        <label className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={form.requiresActivation} onChange={(e)=>setForm({...form,requiresActivation:e.target.checked})}/> نیازمند فعال‌سازی</label>
        <select className={inputClass} value={form.isActive?'active':'inactive'} onChange={(e)=>setForm({...form,isActive:e.target.value==='active'})}><option value="active">فعال</option><option value="inactive">غیرفعال</option></select>
        {editingId&&<input className={`${inputClass} md:col-span-2`} placeholder="دلیل ویرایش *" value={form.editReason} onChange={(e)=>setForm({...form,editReason:e.target.value})}/>}
      </div>{error&&<div className="rounded-lg bg-[var(--danger-soft)] p-2 text-sm text-[var(--danger)]">{error}</div>}<button onClick={handleSave} className="min-h-11 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white">{editingId?'ثبت نسخه جدید':'ثبت خدمت'}</button>
    </section>}
    <section className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b border-[var(--border)] text-right text-[var(--text-secondary)]"><th className="p-2">کد</th><th className="p-2">نام</th><th className="p-2">دسته</th>{canViewInternalCost&&<th className="p-2">بهای داخلی</th>}<th className="p-2">قیمت فروش</th><th className="p-2">فعال‌سازی</th><th className="p-2">نسخه/آخرین تغییر</th><th className="p-2">وضعیت</th><th className="p-2">عملیات</th></tr></thead><tbody>{services.map((service)=>{const stamp=splitPortalTimestamp(service.updatedAt);return <tr key={service.id} className="border-b border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"><td className="p-2 font-mono">{service.code}</td><td className="p-2">{service.name}</td><td className="p-2 text-[var(--text-secondary)]">{service.category}</td>{canViewInternalCost&&<td className="p-2">{formatPortalMoney(service.internalCost||0)}</td>}<td className="p-2">{formatPortalMoney(service.salePrice)}</td><td className="p-2">{service.requiresActivation?'بله':'خیر'}</td><td className="p-2 text-xs text-[var(--text-secondary)]">v{service.version||1}{service.updatedAt?` — ${stamp.date} ${stamp.time}`:' — اولیه'}</td><td className="p-2">{service.isActive?'فعال':'غیرفعال'}</td><td className="p-2"><button onClick={()=>startEdit(service)} className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-[var(--primary)]"><Pencil className="h-4 w-4"/> ویرایش</button></td></tr>})}</tbody></table></section>
  </div>;
};
