import type {FoundationState, LocalUser, OperationalRecord, OperationalPayloadValue} from './model';

export type ChatConversationKind = 'direct' | 'group' | 'unit';
export type ChatAttachmentKind = 'file' | 'voice';

export interface ChatConversationInput {
  kind: ChatConversationKind;
  title?: string;
  memberUserIds?: string[];
  unitId?: string;
}

export interface ChatAttachmentInput {
  kind: ChatAttachmentKind;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface ChatMessageInput {
  conversationId: string;
  body?: string;
  attachment?: ChatAttachmentInput;
}

const CHAT_FILE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const CHAT_VOICE_TYPES = new Set(['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-wav']);
export const MAX_CHAT_FILE_SIZE = 8 * 1024 * 1024;
export const MAX_CHAT_VOICE_SIZE = 12 * 1024 * 1024;

function payloadText(value: OperationalPayloadValue | undefined): string {return typeof value === 'string' ? value : '';}
function payloadStrings(value: OperationalPayloadValue | undefined): string[] {return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];}

export function chatKind(record: OperationalRecord): ChatConversationKind {
  const value = payloadText(record.payload.conversationKind);
  return value === 'direct' || value === 'unit' ? value : 'group';
}

export function chatMemberUserIds(record: OperationalRecord): string[] {
  return [...new Set(payloadStrings(record.payload.memberUserIds))];
}

export function chatHiddenForUserIds(record: OperationalRecord): string[] {
  return [...new Set(payloadStrings(record.payload.hiddenForUserIds))];
}

export function isChatMember(record: OperationalRecord, user: LocalUser): boolean {
  if (record.moduleId !== 'chat' || record.companyId !== user.companyId) return false;
  if (chatKind(record) === 'unit') return Boolean(record.unitId && record.unitId === user.unitId);
  return chatMemberUserIds(record).includes(user.id);
}

export function visibleChatRecords(records: OperationalRecord[], user: LocalUser): OperationalRecord[] {
  return records.filter((record) => record.moduleId === 'chat' && isChatMember(record, user) && !chatHiddenForUserIds(record).includes(user.id));
}

export function normalizeChatSearch(value: string): string {
  return value.normalize('NFKC').replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\u200f]/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('fa');
}

export function chatMessages(state: FoundationState, conversationId: string): OperationalRecord[] {
  return state.operationalRecords
    .filter((record) => record.moduleId === 'message' && record.relatedRecordId === conversationId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function chatAttachment(record: OperationalRecord): ChatAttachmentInput | undefined {
  const value = record.payload.attachment;
  if (!value || Array.isArray(value) || typeof value !== 'object') return undefined;
  const attachment = value as Record<string, OperationalPayloadValue>;
  const kind = payloadText(attachment.kind);
  if (kind !== 'file' && kind !== 'voice') return undefined;
  return {
    kind,
    fileName: payloadText(attachment.fileName),
    mimeType: payloadText(attachment.mimeType),
    size: typeof attachment.size === 'number' ? attachment.size : 0,
    dataUrl: payloadText(attachment.dataUrl),
  };
}

export function validateChatAttachment(input: ChatAttachmentInput): ChatAttachmentInput {
  const allowed = input.kind === 'voice' ? CHAT_VOICE_TYPES : CHAT_FILE_TYPES;
  const maximum = input.kind === 'voice' ? MAX_CHAT_VOICE_SIZE : MAX_CHAT_FILE_SIZE;
  if (!allowed.has(input.mimeType)) throw new Error(input.kind === 'voice' ? 'فرمت ویس پشتیبانی نمی‌شود.' : 'فرمت فایل پشتیبانی نمی‌شود.');
  if (!Number.isFinite(input.size) || input.size <= 0) throw new Error('فایل خالی قابل ارسال نیست.');
  if (input.size > maximum) throw new Error(`حجم ${input.kind === 'voice' ? 'ویس' : 'فایل'} بیشتر از حد مجاز است.`);
  const prefix = `data:${input.mimeType};base64,`;
  if (!input.dataUrl.startsWith(prefix) || input.dataUrl.length <= prefix.length) throw new Error('محتوای فایل معتبر نیست.');
  const fileName = input.fileName.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
  if (!fileName) throw new Error('نام فایل معتبر نیست.');
  return {...input, fileName};
}

export function chatConversationSubtitle(record: OperationalRecord, state: FoundationState): string {
  if (chatKind(record) === 'unit') return `گفت‌وگوی واحد ${state.units.find((unit) => unit.id === record.unitId)?.name ?? 'سازمانی'}`;
  const members = chatMemberUserIds(record).filter((id) => id !== state.activeUser.id).map((id) => state.users.find((user) => user.id === id)?.name).filter(Boolean);
  return members.slice(0, 3).join('، ') + (members.length > 3 ? ` و ${members.length - 3} نفر دیگر` : '');
}
