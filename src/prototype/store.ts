import { useCallback, useEffect, useState } from 'react';
import { SEED_RECORDS } from './catalog';
import type { ModuleId, PrototypeRecord, PrototypeState, RoleId } from './model';

const STORAGE_KEY = 'tapra2_frontend_prototype_v1';
const initialState: PrototypeState = {
  records: SEED_RECORDS,
  activeRole: 'super_admin',
  activeModule: 'dashboard',
  theme: 'light',
  accent: 'indigo',
  density: 'comfortable',
  sidebarCollapsed: false,
};

function readState(): PrototypeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...initialState, ...JSON.parse(raw) as Partial<PrototypeState> } : initialState;
  } catch { return initialState; }
}

export function usePrototypeStore() {
  const [state, setState] = useState<PrototypeState>(readState);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
    document.documentElement.dataset.accent = state.accent;
    document.documentElement.dataset.density = state.density;
  }, [state.accent, state.density, state.theme]);

  const patchState = useCallback((patch: Partial<PrototypeState>) => setState((current) => ({ ...current, ...patch })), []);
  const saveRecord = useCallback((record: PrototypeRecord, actor: string) => setState((current) => {
    const exists = current.records.some((item) => item.id === record.id);
    const timestamp = new Date().toISOString();
    const next = {
      ...record,
      updatedAt: timestamp,
      events: [
        { id: crypto.randomUUID(), kind: exists ? 'edited' as const : 'created' as const, summary: exists ? 'اطلاعات رکورد ویرایش شد.' : 'رکورد جدید ایجاد شد.', actor, occurredAt: timestamp },
        ...(exists ? record.events : []),
      ],
    };
    return { ...current, records: exists ? current.records.map((item) => item.id === next.id ? next : item) : [next, ...current.records] };
  }), []);
  const changeStatus = useCallback((recordId: string, status: string, actor: string, label: string, reason: string) => setState((current) => ({
    ...current,
    records: current.records.map((record) => record.id !== recordId ? record : {
      ...record, status, updatedAt: new Date().toISOString(),
      events: [{ id: crypto.randomUUID(), kind: 'status', summary: `وضعیت به «${label}» تغییر کرد — ${reason}`, actor, occurredAt: new Date().toISOString() }, ...record.events],
    }),
  })), []);
  const addNote = useCallback((recordId: string, actor: string, summary: string) => setState((current) => ({
    ...current,
    records: current.records.map((record) => record.id !== recordId ? record : {
      ...record, updatedAt: new Date().toISOString(),
      events: [{ id: crypto.randomUUID(), kind: 'note', summary, actor, occurredAt: new Date().toISOString() }, ...record.events],
    }),
  })), []);
  const reset = useCallback(() => { localStorage.removeItem(STORAGE_KEY); setState({ ...initialState, records: SEED_RECORDS }); }, []);

  return {
    state,
    setRole: (activeRole: RoleId) => patchState({ activeRole, activeModule: 'dashboard' }),
    setModule: (activeModule: ModuleId) => patchState({ activeModule }),
    setTheme: (theme: PrototypeState['theme']) => patchState({ theme }),
    setAccent: (accent: PrototypeState['accent']) => patchState({ accent }),
    setDensity: (density: PrototypeState['density']) => patchState({ density }),
    setSidebarCollapsed: (sidebarCollapsed: boolean) => patchState({ sidebarCollapsed }),
    saveRecord, changeStatus, addNote, reset,
  };
}

