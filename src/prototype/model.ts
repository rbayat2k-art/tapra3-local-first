export type ModuleId =
  | 'dashboard' | 'tasks' | 'customers' | 'leads' | 'invoices' | 'payments'
  | 'warehouse' | 'finance' | 'vendors' | 'catalog' | 'campaigns' | 'fulfillment'
  | 'support' | 'letters' | 'users' | 'roles' | 'workflows' | 'reports' | 'settings';

export type RoleId =
  | 'super_admin' | 'executive' | 'finance_manager' | 'finance_requester' | 'treasury'
  | 'sales_manager' | 'seller' | 'marketing' | 'customer_success' | 'support'
  | 'warehouse_manager' | 'warehouse_operator' | 'communications' | 'auditor';

export interface PrototypeRole {
  id: RoleId;
  title: string;
  description: string;
  color: string;
  modules: ModuleId[];
  canEdit: ModuleId[];
  canApprove: ModuleId[];
}

export interface FlowStep {
  id: string;
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
}

export interface ModuleDefinition {
  id: ModuleId;
  title: string;
  shortTitle: string;
  description: string;
  group: 'کار روزانه' | 'فروش و مشتری' | 'عملیات و مالی' | 'ارتباطات' | 'مدیریت';
  icon: string;
  singular: string;
  flow: FlowStep[];
  fields: Array<'amount' | 'customer' | 'owner' | 'dueDate' | 'phone' | 'category' | 'quantity'>;
}

export interface RecordEvent {
  id: string;
  kind: 'created' | 'edited' | 'status' | 'note';
  summary: string;
  actor: string;
  occurredAt: string;
}

export interface PrototypeRecord {
  id: string;
  module: Exclude<ModuleId, 'dashboard' | 'reports' | 'settings'>;
  code: string;
  title: string;
  description: string;
  status: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  amount?: number;
  customer?: string;
  owner?: string;
  dueDate?: string;
  phone?: string;
  category?: string;
  quantity?: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  events: RecordEvent[];
}

export interface PrototypeState {
  records: PrototypeRecord[];
  activeRole: RoleId;
  activeModule: ModuleId;
  theme: 'light' | 'dark';
  accent: 'indigo' | 'emerald' | 'rose';
  density: 'comfortable' | 'compact';
  sidebarCollapsed: boolean;
}

