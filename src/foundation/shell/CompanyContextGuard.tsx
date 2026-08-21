import type { ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { useFoundationSession } from '../auth/FoundationSessionContext';

export function CompanyContextGuard({ children }: { children: ReactNode }) {
  const { session } = useFoundationSession();
  if (session?.activeContext?.company) return <>{children}</>;

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center" dir="rtl">
      <Building2 className="mx-auto h-10 w-10 text-amber-600" />
      <h2 className="mt-3 text-lg font-black text-[var(--text-primary)]">انتخاب شرکت لازم است</h2>
      <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">این بخش به اطلاعات یک شرکت مشخص وابسته است. از نوار بالای صفحه، محیط شرکت موردنظر را انتخاب کنید.</p>
    </section>
  );
}
