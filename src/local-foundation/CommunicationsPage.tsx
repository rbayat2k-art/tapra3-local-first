import {useEffect, useMemo, useRef, useState, type ChangeEvent} from 'react';
import {Building2, Download, FileText, MessageCircle, Mic, Paperclip, Plus, Search, Send, UserRound, UsersRound, X} from 'lucide-react';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalFoundationService} from './service';
import {
  chatAttachment, chatConversationSubtitle, chatKind, chatMemberUserIds, chatMessages,
  MAX_CHAT_FILE_SIZE, MAX_CHAT_VOICE_SIZE, type ChatAttachmentInput, type ChatConversationKind,
} from './communications';
import {RecordDialog} from './RecordDialog';
import {FormValidationSummary, RequiredLabel} from './FormValidation';

interface Props {
  state: FoundationState;
  service: LocalFoundationService;
  execute: (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
}

const dateTime = new Intl.DateTimeFormat('fa-IR', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

export function CommunicationsPage({state, service, execute}: Props) {
  const conversations = useMemo(() => state.operationalRecords.filter((record)=>record.moduleId==='chat').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)), [state.operationalRecords]);
  const [selectedId,setSelectedId]=useState<string>();
  const [query,setQuery]=useState('');
  const [creating,setCreating]=useState(false);
  const selected=conversations.find((record)=>record.id===selectedId)??conversations[0];
  useEffect(()=>{if(selected&&!selectedId)setSelectedId(selected.id);if(selectedId&&!conversations.some((item)=>item.id===selectedId))setSelectedId(conversations[0]?.id);},[conversations,selected,selectedId]);
  const visible=conversations.filter((record)=>`${record.title} ${chatConversationSubtitle(record,state)}`.toLocaleLowerCase('fa').includes(query.trim().toLocaleLowerCase('fa')));
  return <section className="communications-page">
    <aside className="chat-sidebar" aria-label="فهرست گفت‌وگوها">
      <header><div><span className="eyebrow">همکاری سازمانی</span><h2>گفت‌وگوها</h2></div><button className="button button--primary button--compact" onClick={()=>setCreating(true)}><Plus size={17}/> گفت‌وگوی جدید</button></header>
      <label className="search-field"><Search size={17}/><input aria-label="جست‌وجوی گفت‌وگوها" placeholder="نام فرد، گروه یا واحد…" value={query} onChange={(event)=>setQuery(event.target.value)}/></label>
      <div className="chat-conversation-list">{visible.map((record)=><button key={record.id} className={selected?.id===record.id?'chat-conversation chat-conversation--active':'chat-conversation'} onClick={()=>setSelectedId(record.id)}>
        <ChatKindIcon record={record}/><span><strong>{record.title}</strong><small>{chatConversationSubtitle(record,state)||'گفت‌وگوی شخصی'}</small></span><time>{dateTime.format(new Date(record.updatedAt))}</time>
      </button>)}{visible.length===0&&<div className="chat-empty"><MessageCircle size={32}/><strong>گفت‌وگویی پیدا نشد</strong><span>یک گفت‌وگوی شخصی، گروهی یا واحدی بسازید.</span></div>}</div>
    </aside>
    <main className="chat-workspace">{selected?<ChatThread key={selected.id} conversation={selected} state={state} service={service} execute={execute}/>:<div className="chat-empty chat-empty--large"><MessageCircle size={48}/><h2>همکاری از همین‌جا شروع می‌شود</h2><p>پیام شخصی، گروه کاری و گفت‌وگوی واحدی را با فایل و ویس کنار هم داشته باشید.</p><button className="button button--primary" onClick={()=>setCreating(true)}><Plus size={18}/> ساخت اولین گفت‌وگو</button></div>}</main>
    {creating&&<NewConversationDialog state={state} onClose={()=>setCreating(false)} onSave={async(input)=>{const ok=await execute('chat-create',()=>service.createChatConversation(input),'گفت‌وگو آماده شد.');if(ok)setCreating(false);}}/>}
  </section>;
}

function ChatThread({conversation,state,service,execute}:{conversation:OperationalRecord;state:FoundationState;service:LocalFoundationService;execute:Props['execute']}) {
  const messages=chatMessages(state,conversation.id);
  const [body,setBody]=useState('');
  const [attachment,setAttachment]=useState<ChatAttachmentInput>();
  const [fileError,setFileError]=useState('');
  const [sending,setSending]=useState(false);
  const endRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{endRef.current?.scrollIntoView({block:'end'});},[messages.length]);
  const readFile=(kind:'file'|'voice')=>(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;const maximum=kind==='voice'?MAX_CHAT_VOICE_SIZE:MAX_CHAT_FILE_SIZE;if(file.size>maximum){setFileError(`حجم ${kind==='voice'?'ویس':'فایل'} بیشتر از حد مجاز است.`);return;}const reader=new FileReader();reader.onerror=()=>setFileError('خواندن فایل ممکن نشد؛ دوباره انتخاب کنید.');reader.onload=()=>{if(typeof reader.result!=='string'){setFileError('محتوای فایل معتبر نیست.');return;}setAttachment({kind,fileName:file.name,mimeType:file.type,size:file.size,dataUrl:reader.result});setFileError('');};reader.readAsDataURL(file);};
  const send=async()=>{if(sending||(!body.trim()&&!attachment))return;setSending(true);try{const ok=await execute('chat-send',()=>service.sendChatMessage({conversationId:conversation.id,body,attachment}),'پیام ارسال شد.');if(ok){setBody('');setAttachment(undefined);}}finally{setSending(false);}};
  return <>
    <header className="chat-thread-header"><ChatKindIcon record={conversation}/><div><h2>{conversation.title}</h2><span>{chatConversationSubtitle(conversation,state)}</span></div><span className="chat-member-count"><UsersRound size={16}/>{chatKind(conversation)==='unit'?'اعضای فعال واحد':`${chatMemberUserIds(conversation).length.toLocaleString('fa-IR')} عضو`}</span></header>
    <div className="chat-message-list" aria-label={`پیام‌های ${conversation.title}`}>
      {messages.length===0&&<div className="chat-empty"><MessageCircle size={34}/><strong>هنوز پیامی ثبت نشده</strong><span>اولین پیام این گفت‌وگو را ارسال کنید.</span></div>}
      {messages.map((message)=>{const mine=message.createdByUserId===state.activeUser.id;const sender=state.users.find((user)=>user.id===message.createdByUserId);const itemAttachment=chatAttachment(message);return <article key={message.id} className={mine?'chat-message chat-message--mine':'chat-message'}>
        <div className="chat-message-meta"><strong>{mine?'شما':sender?.name??'کاربر سازمانی'}</strong><time>{dateTime.format(new Date(message.createdAt))}</time></div>
        {message.description&&<p>{message.description}</p>}
        {itemAttachment?.kind==='voice'&&<div className="chat-voice"><Mic size={18}/><audio controls preload="metadata" src={itemAttachment.dataUrl}/></div>}
        {itemAttachment?.kind==='file'&&<a className="chat-file" href={itemAttachment.dataUrl} download={itemAttachment.fileName}><FileText size={21}/><span><strong>{itemAttachment.fileName}</strong><small>{formatBytes(itemAttachment.size)}</small></span><Download size={17}/></a>}
      </article>;})}<div ref={endRef}/>
    </div>
    <footer className="chat-composer">
      {fileError&&<div className="chat-file-error" role="alert">{fileError}</div>}
      {attachment&&<div className="chat-pending-attachment"><span>{attachment.kind==='voice'?<Mic size={17}/>:<FileText size={17}/>}<b>{attachment.fileName}</b><small>{formatBytes(attachment.size)}</small></span><button onClick={()=>setAttachment(undefined)} aria-label="حذف فایل انتخاب‌شده"><X size={16}/></button></div>}
      <div className="chat-composer-row"><textarea disabled={sending} aria-label="متن پیام" placeholder="پیام خود را بنویسید…" rows={2} maxLength={4000} value={body} onChange={(event)=>setBody(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}}/><label className="icon-button" aria-disabled={sending} title="افزودن فایل"><Paperclip size={19}/><input disabled={sending} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,.docx,.xlsx" onChange={readFile('file')}/></label><label className="icon-button" aria-disabled={sending} title="ضبط یا افزودن ویس"><Mic size={19}/><input disabled={sending} hidden type="file" capture accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm" onChange={readFile('voice')}/></label><button className="button button--primary chat-send" disabled={sending||(!body.trim()&&!attachment)} onClick={()=>void send()} aria-label={sending?'در حال ارسال پیام':'ارسال پیام'}><Send size={19}/></button></div>
    </footer>
  </>;
}

function NewConversationDialog({state,onClose,onSave}:{state:FoundationState;onClose:()=>void;onSave:(input:{kind:ChatConversationKind;title?:string;memberUserIds?:string[];unitId?:string})=>Promise<void>}) {
  const [kind,setKind]=useState<ChatConversationKind>('direct');const [title,setTitle]=useState('');const [selected,setSelected]=useState<string[]>([]);const [errors,setErrors]=useState<string[]>([]);const [saving,setSaving]=useState(false);const candidates=state.users.filter((user)=>user.status==='active'&&user.companyId===state.activeUser.companyId&&user.id!==state.activeUser.id);
  const safeClose=()=>{if(!saving)onClose();};
  const submit=async()=>{if(saving)return;const next:string[]=[];if(kind==='direct'&&selected.length!==1)next.push('برای گفت‌وگوی شخصی دقیقاً یک نفر را انتخاب کنید.');if(kind==='group'&&selected.length<1)next.push('برای گروه حداقل یک عضو دیگر انتخاب کنید.');if(kind==='group'&&title.trim().length<3)next.push('نام گروه باید حداقل ۳ نویسه باشد.');if(kind==='unit'&&!state.activeUser.unitId)next.push('برای حساب شما واحد سازمانی ثبت نشده است.');setErrors(next);if(next.length)return;setSaving(true);try{await onSave({kind,title,memberUserIds:selected,unitId:state.activeUser.unitId});}finally{setSaving(false);}};
  return <RecordDialog ariaLabel="ساخت گفت‌وگوی جدید" className="chat-create-dialog" onClose={safeClose}><header><div><span className="eyebrow">همکاری سازمانی</span><h2>ساخت گفت‌وگوی جدید</h2></div><button className="icon-button" disabled={saving} onClick={safeClose} aria-label="بستن"><X size={20}/></button></header><fieldset className="drawer-body chat-create-fields" disabled={saving}><FormValidationSummary errors={errors}/><div className="chat-kind-picker" role="radiogroup" aria-label="نوع گفت‌وگو">{([{id:'direct',label:'شخصی',icon:UserRound},{id:'group',label:'گروهی',icon:UsersRound},{id:'unit',label:'واحد سازمانی',icon:Building2}] as const).map((item)=>{const Icon=item.icon;return <button key={item.id} type="button" role="radio" aria-checked={kind===item.id} className={kind===item.id?'chat-kind-option chat-kind-option--active':'chat-kind-option'} onClick={()=>{setKind(item.id);setSelected([]);}}><Icon size={20}/><strong>{item.label}</strong></button>;})}</div>{kind==='group'&&<label className="field"><RequiredLabel>نام گروه</RequiredLabel><input value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="مثلاً تیم پروژه فروش" autoFocus/></label>}{kind==='unit'?<div className="notice"><Building2 size={18}/><span>اعضای فعال واحد «{state.units.find((unit)=>unit.id===state.activeUser.unitId)?.name??'ثبت‌نشده'}» به‌صورت خودکار عضو می‌شوند.</span></div>:<fieldset className="chat-member-picker"><legend>{kind==='direct'?'انتخاب شخص':'انتخاب اعضا'}</legend>{candidates.map((user)=>{const personnel=state.personnel.find((person)=>person.id===user.personnelId||person.linkedUserId===user.id);const unit=state.units.find((item)=>item.id===user.unitId)?.name??'بدون واحد';const position=state.positions.find((item)=>item.id===user.positionId)?.title??'بدون سمت';return <label key={user.id}><input type={kind==='direct'?'radio':'checkbox'} name={kind==='direct'?'direct-member':undefined} checked={selected.includes(user.id)} onChange={()=>setSelected((current)=>kind==='direct'?[user.id]:current.includes(user.id)?current.filter((id)=>id!==user.id):[...current,user.id])}/><span className="chat-member-identity"><strong>{user.name}</strong><small><bdi dir="ltr">@{user.username}</bdi>{personnel&&<> · <bdi dir="ltr">{personnel.personnelCode}</bdi></>}<span> · {unit} · {position}</span></small></span></label>;})}</fieldset>}</fieldset><footer><button className="button button--ghost" disabled={saving} onClick={safeClose}>انصراف</button><button className="button button--primary" disabled={saving} onClick={()=>void submit()}>{saving?'در حال ساخت…':'ساخت گفت‌وگو'}</button></footer></RecordDialog>;
}

function ChatKindIcon({record}:{record:OperationalRecord}) {const Icon=chatKind(record)==='direct'?UserRound:chatKind(record)==='unit'?Building2:UsersRound;return <span className="chat-kind-icon"><Icon size={20}/></span>;}
function formatBytes(size:number){return size<1024*1024?`${Math.max(1,Math.round(size/1024)).toLocaleString('fa-IR')} کیلوبایت`:`${(size/1024/1024).toLocaleString('fa-IR',{maximumFractionDigits:1})} مگابایت`;}
