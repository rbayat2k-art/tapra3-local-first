import type {ChatPreference, LocalUser, OperationalPayloadValue, OperationalRecord} from './model';

export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export interface ProjectInput {
  title: string;
  description?: string;
  memberUserIds: string[];
  unitId?: string;
  dueAt?: string;
  createChat?: boolean;
}

export interface ProjectUpdateInput {
  title: string;
  description?: string;
  memberUserIds: string[];
  unitId?: string;
  dueAt?: string;
  createChat?: boolean;
}

export interface TaskChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;
  completedByUserId?: string;
}

export interface ProjectTaskInput {
  title: string;
  description?: string;
  projectId?: string;
  assigneeUserId: string;
  dueAt?: string;
  reminderAt?: string;
  labels?: string[];
  checklist?: Array<{id?: string; title: string}>;
  priority?: OperationalRecord['priority'];
}

export interface ProjectTaskBatchInput extends Omit<ProjectTaskInput, 'assigneeUserId'> {
  assigneeUserIds: string[];
}

export interface ProjectTaskUpdateInput {
  title: string;
  description?: string;
  dueAt?: string;
  reminderAt?: string;
  labels?: string[];
  priority?: OperationalRecord['priority'];
  assigneeUserId?: string;
}

export interface ChatPreferenceInput {
  pinned: boolean;
  muted: boolean;
}

function text(value: OperationalPayloadValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

function strings(value: OperationalPayloadValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function projectMemberUserIds(record: OperationalRecord): string[] {
  return [...new Set(strings(record.payload.memberUserIds))];
}

export function projectChatId(record: OperationalRecord): string | undefined {
  return text(record.payload.chatId) || undefined;
}

export function isProjectMember(record: OperationalRecord, user: Pick<LocalUser, 'id' | 'companyId' | 'status'>): boolean {
  return record.moduleId === 'project'
    && record.companyId === user.companyId
    && user.status === 'active'
    && projectMemberUserIds(record).includes(user.id);
}

export function taskProjectId(record: OperationalRecord): string | undefined {
  return text(record.payload.projectId) || undefined;
}

export function taskLabels(record: OperationalRecord): string[] {
  return [...new Set(strings(record.payload.labels))];
}

export function taskReminderAt(record: OperationalRecord): string | undefined {
  return text(record.payload.reminderAt) || undefined;
}

export function taskChecklist(record: OperationalRecord): TaskChecklistItem[] {
  if (!Array.isArray(record.payload.checklist)) return [];
  return record.payload.checklist.flatMap((value) => {
    if (!value || Array.isArray(value) || typeof value !== 'object') return [];
    const row = value as Record<string, OperationalPayloadValue>;
    const id = text(row.id);
    const title = text(row.title);
    if (!id || !title) return [];
    const completedAt = text(row.completedAt) || undefined;
    const completedByUserId = text(row.completedByUserId) || undefined;
    return [{id, title, completed: row.completed === true, completedAt, completedByUserId}];
  });
}

export function normalizeTaskLabels(values: string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 12);
}

export function chatPreferenceId(chatId: string, userId: string): string {
  return `${chatId}:${userId}`;
}

export function preferenceForChat(preferences: ChatPreference[], chatId: string, userId: string): ChatPreference | undefined {
  return preferences.find((item) => item.id === chatPreferenceId(chatId, userId));
}
