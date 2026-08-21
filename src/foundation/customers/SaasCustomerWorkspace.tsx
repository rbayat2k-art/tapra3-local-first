import { useState } from 'react';
import { FileUp, Users } from 'lucide-react';
import { useFoundationSession } from '../auth/FoundationSessionContext';
import { CustomerImportView } from './CustomerImportView';
import { SaasCustomersView } from './SaasCustomersView';

export function SaasCustomerWorkspace() {
  const { session } = useFoundationSession();
  const [tab, setTab] = useState<'profiles' | 'imports'>('profiles');
  const permissions = session?.activeContext?.permissions ?? [];
  const canSeeImports = permissions.includes('customer.import.read') || permissions.includes('customer.import.create');

  return <div className="space-y-4 dir-rtl">
    {canSeeImports && <nav aria-label="بخش‌های مدیریت مشتریان" className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1 text-sm">
      <button type="button" onClick={() => setTab('profiles')} className={`flex items-center gap-2 rounded-lg px-4 py-2 font-bold ${tab === 'profiles' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}><Users size={17} />پروفایل‌ها</button>
      <button type="button" onClick={() => setTab('imports')} className={`flex items-center gap-2 rounded-lg px-4 py-2 font-bold ${tab === 'imports' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}><FileUp size={17} />ورود CSV</button>
    </nav>}
    {tab === 'imports' && canSeeImports ? <CustomerImportView /> : <SaasCustomersView />}
  </div>;
}
