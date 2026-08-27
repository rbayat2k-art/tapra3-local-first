import type {ChatPreference,OperationalRecord} from './model';
import type {ChatAttachmentInput} from './communications';

export type SharedMediaFilter = 'all'|'image'|'audio'|'document';

export function sharedMediaCategory(attachment: Pick<ChatAttachmentInput,'kind'|'mimeType'>): Exclude<SharedMediaFilter,'all'> {
  const mimeType=attachment.mimeType.toLocaleLowerCase('en-US');
  if(attachment.kind==='voice'||mimeType.startsWith('audio/'))return 'audio';
  if(mimeType.startsWith('image/'))return 'image';
  return 'document';
}

export function messageIsoDay(value:string):string {
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(type:'year'|'month'|'day')=>parts.find((item)=>item.type===type)?.value??'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function sortConversationsByPreference(records:OperationalRecord[],preferences:ChatPreference[],userId:string):OperationalRecord[] {
  const pinnedIds=new Set(preferences.filter((item)=>item.userId===userId&&item.pinned).map((item)=>item.chatId));
  return [...records].sort((a,b)=>Number(pinnedIds.has(b.id))-Number(pinnedIds.has(a.id))||b.updatedAt.localeCompare(a.updatedAt));
}
