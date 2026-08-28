import {useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent} from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, AudioLines, Bell, BellOff, Building2, CalendarDays, Download, FileText, FolderOpen,
  Check, Image as ImageIcon, MessageCircle, Mic, Paperclip, Pencil, Pin, PinOff, Plus, Reply, Search, Send, Settings2, Square, Trash2, UserRound, UsersRound, X,
} from 'lucide-react';
import type {FoundationState, LocalUser, OperationalRecord} from './model';
import type {LocalFoundationService} from './service';
import {
  chatAdminUserIds, chatAttachment, chatConversationSubtitle, chatKind, chatMemberUserIds, chatMessageCanBeChanged,
  chatMessageEditedAt, chatMessageIsDeleted, chatMessages, chatOwnerUserId, chatReadAt, chatReplyToMessageId, chatUnreadCount,
  normalizeChatSearch, validateChatAttachment, type ChatAttachmentInput, type ChatConversationKind, type ChatGroupUpdateInput,
} from './communications';
import {preferenceForChat} from './collaborationDomain';
import {can} from './authorization';
import {permissionFor} from './erpCatalog';
import {messageIsoDay,sharedMediaCategory,sortConversationsByPreference,type SharedMediaFilter} from './communicationsUi';
import {PersianDateInput} from './PersianDate';
import {RecordDialog} from './RecordDialog';
import {FormValidationSummary, RequiredLabel} from './FormValidation';

interface Props {
  state: FoundationState;
  service: LocalFoundationService;
  execute: (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
  initialConversationId?: string;
}

interface ChatDraft {body:string;attachment?:ChatAttachmentInput;replyToMessageId?:string;editingMessageId?:string}

const dateTime = new Intl.DateTimeFormat('fa-IR', {timeZone:'Asia/Tehran',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const dialogRootFor=(ariaLabel:string)=>document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${ariaLabel}"]`)?.closest<HTMLElement>('.drawer-scrim');

export function CommunicationsPage({state, service, execute, initialConversationId}: Props) {
  const conversations = useMemo(() => sortConversationsByPreference(state.operationalRecords.filter((record)=>record.moduleId==='chat'),state.chatPreferences??[],state.activeUser.id), [state.activeUser.id,state.chatPreferences,state.operationalRecords]);
  const [selectedId,setSelectedId]=useState<string>(initialConversationId);
  const [query,setQuery]=useState('');
  const [creating,setCreating]=useState(false);
  const [drafts,setDrafts]=useState<Record<string,ChatDraft>>({});
  const [recordingChatId,setRecordingChatId]=useState<string>();
  const chatCreateCommandRef=useRef<{id:string;fingerprint:string}|undefined>(undefined);
  const chatCreateBusyRef=useRef(false);
  const selected=conversations.find((record)=>record.id===selectedId)??conversations[0];
  const workspaceDirty=Boolean(recordingChatId||Object.values(drafts).some((draft)=>Boolean(draft.body.trim()||draft.attachment||draft.replyToMessageId||draft.editingMessageId)));
  const updateSelectedDraft=useCallback((draft:ChatDraft)=>{if(selected?.id)setDrafts((current)=>({...current,[selected.id]:draft}));},[selected?.id]);
  const updateRecordingState=useCallback((recording:boolean)=>setRecordingChatId(recording?selected?.id:undefined),[selected?.id]);
  useEffect(()=>{if(initialConversationId&&conversations.some((item)=>item.id===initialConversationId))setSelectedId(initialConversationId);else if(selected&&!selectedId)setSelectedId(selected.id);if(selectedId&&!conversations.some((item)=>item.id===selectedId))setSelectedId(conversations[0]?.id);},[conversations,initialConversationId,selected,selectedId]);
  const normalizedQuery=normalizeChatSearch(query);
  const visible=conversations.filter((record)=>normalizeChatSearch(`${record.title} ${chatConversationSubtitle(record,state)}`).includes(normalizedQuery));
  const mayCreateChat=can(state.activeUser,permissionFor('chat','create'));
  return <section className="communications-page" data-workspace-dirty={workspaceDirty?'true':undefined}>
    <aside className="chat-sidebar" aria-label="فهرست گفت‌وگوها">
      <header><div><span className="eyebrow">همکاری سازمانی</span><h2>گفت‌وگوها</h2></div>{mayCreateChat&&<button className="button button--primary button--compact" onClick={()=>setCreating(true)}><Plus size={17}/> گفت‌وگوی جدید</button>}</header>
      <label className="search-field"><Search size={17}/><input aria-label="جست‌وجوی گفت‌وگوها" placeholder="نام فرد، گروه یا واحد…" value={query} onChange={(event)=>setQuery(event.target.value)}/></label>
      <div className="chat-conversation-list">{visible.map((record)=>{const unread=chatUnreadCount(state,record.id,state.activeUser.id);const preference=preferenceForChat(state.chatPreferences??[],record.id,state.activeUser.id);const locked=Boolean(recordingChatId&&recordingChatId!==record.id);return <button key={record.id} disabled={locked} title={locked?'ابتدا ضبط ویس جاری را متوقف کنید.':undefined} className={selected?.id===record.id?'chat-conversation chat-conversation--active':'chat-conversation'} onClick={()=>setSelectedId(record.id)}>
        <ChatKindIcon record={record}/><span><strong>{record.title}</strong><small>{chatConversationSubtitle(record,state)||'گفت‌وگوی شخصی'}</small></span><span className="chat-conversation-tail"><time>{dateTime.format(new Date(record.updatedAt))}</time><span className="chat-conversation-preferences">{preference?.pinned&&<span role="img" aria-label="گفت‌وگوی سنجاق‌شده" title="سنجاق‌شده"><Pin size={13}/></span>}{preference?.muted&&<span role="img" aria-label="اعلان‌های گفت‌وگو بی‌صدا است" title="بی‌صدا"><BellOff size={13}/></span>}{unread>0&&<b aria-label={`${unread.toLocaleString('fa-IR')} پیام خوانده‌نشده`}>{unread.toLocaleString('fa-IR')}</b>}</span></span>
      </button>;})}{visible.length===0&&<div className="chat-empty"><MessageCircle size={32}/><strong>گفت‌وگویی پیدا نشد</strong><span>عبارت دیگری جست‌وجو کنید یا گفت‌وگوی تازه بسازید.</span></div>}</div>
    </aside>
    <main className="chat-workspace">{selected?<ChatThread key={selected.id} conversation={selected} state={state} service={service} execute={execute} draft={drafts[selected.id]} onDraftChange={updateSelectedDraft} onRecordingChange={updateRecordingState}/>:<div className="chat-empty chat-empty--large"><MessageCircle size={48}/><h2>همکاری از همین‌جا شروع می‌شود</h2><p>پیام شخصی، گروه کاری و گفت‌وگوی واحدی را با فایل و ویس کنار هم داشته باشید.</p>{mayCreateChat&&<button className="button button--primary" onClick={()=>setCreating(true)}><Plus size={18}/> ساخت اولین گفت‌وگو</button>}</div>}</main>
    {creating&&mayCreateChat&&<NewConversationDialog state={state} onClose={()=>{chatCreateCommandRef.current=undefined;setCreating(false);}} onSave={async(input)=>{
      if(chatCreateBusyRef.current)return;
      const fingerprint=JSON.stringify(input);
      if(!chatCreateCommandRef.current||chatCreateCommandRef.current.fingerprint!==fingerprint)chatCreateCommandRef.current={id:`chat-create-${crypto.randomUUID()}`,fingerprint};
      const commandId=chatCreateCommandRef.current.id;chatCreateBusyRef.current=true;
      try{const ok=await execute('chat-create',()=>service.createChatConversation(input,commandId),'گفت‌وگو آماده شد.');if(ok){chatCreateCommandRef.current=undefined;setCreating(false);}}finally{chatCreateBusyRef.current=false;}
    }}/>}
  </section>;
}

function ChatThread({conversation,state,service,execute,draft,onDraftChange,onRecordingChange}:{conversation:OperationalRecord;state:FoundationState;service:LocalFoundationService;execute:Props['execute'];draft?:ChatDraft;onDraftChange:(draft:ChatDraft)=>void;onRecordingChange:(recording:boolean)=>void}) {
  const messages=chatMessages(state,conversation.id);
  const [body,setBody]=useState(draft?.body??'');
  const [attachment,setAttachment]=useState<ChatAttachmentInput|undefined>(draft?.attachment);
  const [fileError,setFileError]=useState('');
  const [sending,setSending]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [recording,setRecording]=useState(false);
  const [recordingSeconds,setRecordingSeconds]=useState(0);
  const [confirmHide,setConfirmHide]=useState(false);
  const [hiding,setHiding]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [messageQuery,setMessageQuery]=useState('');
  const [activeSearchIndex,setActiveSearchIndex]=useState(0);
  const [sharedOpen,setSharedOpen]=useState(false);
  const [sharedQuery,setSharedQuery]=useState('');
  const [sharedFilter,setSharedFilter]=useState<SharedMediaFilter>('all');
  const [dateOpen,setDateOpen]=useState(false);
  const [jumpDate,setJumpDate]=useState('');
  const [dateJumpStatus,setDateJumpStatus]=useState('');
  const [jumpedMessageId,setJumpedMessageId]=useState<string>();
  const [preferenceBusy,setPreferenceBusy]=useState(false);
  const [replyTo,setReplyTo]=useState<OperationalRecord|undefined>(()=>messages.find((item)=>item.id===draft?.replyToMessageId));
  const [editingMessage,setEditingMessage]=useState<OperationalRecord|undefined>(()=>messages.find((item)=>item.id===draft?.editingMessageId));
  const [confirmDelete,setConfirmDelete]=useState<OperationalRecord>();
  const [messageBusy,setMessageBusy]=useState(false);
  const [managingGroup,setManagingGroup]=useState(false);
  const endRef=useRef<HTMLDivElement>(null);
  const composerRef=useRef<HTMLTextAreaElement>(null);
  const searchInputRef=useRef<HTMLInputElement>(null);
  const messageRefs=useRef(new Map<string,HTMLElement>());
  const dragDepth=useRef(0);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const timerRef=useRef<number|null>(null);
  const discardRecording=useRef(false);
  const readBusyRef=useRef(false);
  const sendBusyRef=useRef(false);
  const messageCommandRef=useRef<{id:string;fingerprint:string}|undefined>(undefined);

  const normalizedMessageQuery=normalizeChatSearch(messageQuery);
  const searchResultIds=useMemo(()=>normalizedMessageQuery?messages.filter((message)=>{if(chatMessageIsDeleted(message))return false;const sender=state.users.find((user)=>user.id===message.createdByUserId);const itemAttachment=chatAttachment(message);return normalizeChatSearch(`${message.description} ${sender?.name??''} ${sender?.username??''} ${itemAttachment?.fileName??''}`).includes(normalizedMessageQuery);}).map((message)=>message.id):[],[messages,normalizedMessageQuery,state.users]);
  const sharedItems=useMemo(()=>messages.map((message)=>({message,attachment:chatAttachment(message),sender:state.users.find((user)=>user.id===message.createdByUserId)})).filter((item):item is {message:OperationalRecord;attachment:ChatAttachmentInput;sender:LocalUser|undefined}=>Boolean(item.attachment)),[messages,state.users]);
  const normalizedSharedQuery=normalizeChatSearch(sharedQuery);
  const visibleSharedItems=sharedItems.filter((item)=>(sharedFilter==='all'||sharedMediaCategory(item.attachment)===sharedFilter)&&normalizeChatSearch(`${item.attachment.fileName} ${item.sender?.name??''} ${item.message.description}`).includes(normalizedSharedQuery));
  const activeSearchId=searchResultIds[activeSearchIndex];
  const unreadCount=chatUnreadCount(state,conversation.id,state.activeUser.id);
  const mayCreateMessage=can(state.activeUser,permissionFor('message','create'));
  const mayEditMessage=can(state.activeUser,permissionFor('message','edit'));
  const mayEditChat=can(state.activeUser,permissionFor('chat','edit'));
  const mayManageGroup=mayEditChat&&chatKind(conversation)==='group'&&chatAdminUserIds(conversation).includes(state.activeUser.id);
  const preference=preferenceForChat(state.chatPreferences??[],conversation.id,state.activeUser.id);

  useEffect(()=>{onDraftChange({body,attachment,replyToMessageId:replyTo?.id,editingMessageId:editingMessage?.id});},[attachment,body,editingMessage?.id,onDraftChange,replyTo?.id]);
  useEffect(()=>{onRecordingChange(recording);return()=>onRecordingChange(false);},[onRecordingChange,recording]);

  useEffect(()=>{endRef.current?.scrollIntoView({block:'end'});},[messages.length]);
  useEffect(()=>{setActiveSearchIndex(0);},[normalizedMessageQuery]);
  useEffect(()=>{if(activeSearchId)messageRefs.current.get(activeSearchId)?.scrollIntoView({behavior:'smooth',block:'center'});},[activeSearchId]);
  useEffect(()=>{if(searchOpen)window.setTimeout(()=>searchInputRef.current?.focus(),0);},[searchOpen]);
  useEffect(()=>{if(!sharedOpen)return;const close=(event:PointerEvent)=>{if(event.target instanceof Element&&!event.target.closest('.chat-shared-panel,[aria-label^="فایل‌های به‌اشتراک"]'))setSharedOpen(false);};const focus=window.setTimeout(()=>document.querySelector<HTMLElement>('.chat-shared-panel input')?.focus(),0);document.addEventListener('pointerdown',close,true);return()=>{window.clearTimeout(focus);document.removeEventListener('pointerdown',close,true);};},[sharedOpen]);
  useEffect(()=>{if(!unreadCount||readBusyRef.current)return;readBusyRef.current=true;void execute('chat-read',()=>service.markChatRead(conversation.id),'').finally(()=>{readBusyRef.current=false;});},[conversation.id,execute,service,unreadCount]);
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;if(sharedOpen)setSharedOpen(false);else if(dateOpen){setDateOpen(false);setDateJumpStatus('');}else if(searchOpen){setSearchOpen(false);setMessageQuery('');}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[dateOpen,searchOpen,sharedOpen]);
  useEffect(()=>()=>{
    if(timerRef.current!==null)window.clearInterval(timerRef.current);
    if(recorderRef.current?.state==='recording'){recorderRef.current.onstop=null;recorderRef.current.stop();}
    streamRef.current?.getTracks().forEach((track)=>track.stop());
  },[]);

  const setAttachmentFromBlob=(blob:Blob,fileName:string,kind:'file'|'voice')=>{
    const reader=new FileReader();
    reader.onerror=()=>setFileError('خواندن فایل ممکن نشد؛ دوباره انتخاب کنید.');
    reader.onload=()=>{
      if(typeof reader.result!=='string'){setFileError('محتوای فایل معتبر نیست.');return;}
      try{setAttachment(validateChatAttachment({kind,fileName,mimeType:blob.type,size:blob.size,dataUrl:reader.result}));setFileError('');}
      catch(error){setFileError(error instanceof Error?error.message:'فایل معتبر نیست.');}
    };
    reader.readAsDataURL(blob);
  };
  const acceptFile=(file:File,forcedKind?:'file'|'voice')=>{
    if(editingMessage){setFileError('هنگام ویرایش پیام نمی‌توان فایل تازه‌ای اضافه کرد.');return;}
    const kind=forcedKind??(file.type.startsWith('audio/')?'voice':'file');
    setAttachmentFromBlob(file,file.name,kind);
  };
  const readFile=(kind:'file'|'voice')=>(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];event.target.value='';if(file)acceptFile(file,kind);};
  const stopMediaStream=()=>{streamRef.current?.getTracks().forEach((track)=>track.stop());streamRef.current=null;};
  const startRecording=async()=>{
    if(sending||recording)return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setFileError('ضبط مستقیم ویس در این مرورگر پشتیبانی نمی‌شود؛ از گزینه افزودن فایل صوتی استفاده کنید.');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;
      const preferred=['audio/webm;codecs=opus','audio/webm','audio/ogg'].find((type)=>MediaRecorder.isTypeSupported?.(type));
      const recorder=new MediaRecorder(stream,preferred?{mimeType:preferred}:undefined);recorderRef.current=recorder;chunksRef.current=[];discardRecording.current=false;
      recorder.ondataavailable=(event)=>{if(event.data.size)chunksRef.current.push(event.data);};
      recorder.onstop=()=>{
        if(timerRef.current!==null)window.clearInterval(timerRef.current);timerRef.current=null;setRecording(false);stopMediaStream();
        if(discardRecording.current){chunksRef.current=[];setRecordingSeconds(0);return;}
        const mimeType=(recorder.mimeType||preferred||'audio/webm').split(';')[0];
        const blob=new Blob(chunksRef.current,{type:mimeType});chunksRef.current=[];
        if(!blob.size){setFileError('ویسی ثبت نشد؛ دوباره تلاش کنید.');return;}
        const extension=mimeType.includes('ogg')?'ogg':mimeType.includes('mp4')?'m4a':'webm';
        setAttachmentFromBlob(blob,`voice-${Date.now()}.${extension}`,'voice');setRecordingSeconds(0);
      };
      recorder.onerror=()=>{setFileError('ضبط ویس با خطا متوقف شد؛ دوباره تلاش کنید.');stopMediaStream();setRecording(false);};
      recorder.start();setRecording(true);setRecordingSeconds(0);timerRef.current=window.setInterval(()=>setRecordingSeconds((value)=>value+1),1000);
    }catch{stopMediaStream();setFileError('دسترسی میکروفن داده نشد. مجوز میکروفن مرورگر را فعال و دوباره تلاش کنید.');}
  };
  const stopRecording=()=>{if(recorderRef.current?.state==='recording')recorderRef.current.stop();};
  const cancelRecording=()=>{discardRecording.current=true;stopRecording();};
  const onDragEnter=(event:DragEvent<HTMLDivElement>)=>{if(!event.dataTransfer.types.includes('Files'))return;event.preventDefault();dragDepth.current+=1;setDragging(true);};
  const onDragLeave=(event:DragEvent<HTMLDivElement>)=>{event.preventDefault();dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false);};
  const onDrop=(event:DragEvent<HTMLDivElement>)=>{event.preventDefault();dragDepth.current=0;setDragging(false);const file=event.dataTransfer.files?.[0];if(file)acceptFile(file);};
  const send=async()=>{if((editingMessage?!mayEditMessage:!mayCreateMessage)||sendBusyRef.current||sending||recording||(editingMessage?!body.trim():(!body.trim()&&!attachment)))return;sendBusyRef.current=true;setSending(true);try{const messageInput={conversationId:conversation.id,body,attachment,replyToMessageId:replyTo?.id};const fingerprint=JSON.stringify(messageInput);if(!editingMessage&&(!messageCommandRef.current||messageCommandRef.current.fingerprint!==fingerprint))messageCommandRef.current={id:`message-create-${crypto.randomUUID()}`,fingerprint};const ok=editingMessage
    ?await execute('chat-edit-message',()=>service.editChatMessage(editingMessage.id,body,editingMessage.version),'پیام ویرایش شد.')
    :await execute('chat-send',()=>service.sendChatMessage(messageInput,messageCommandRef.current!.id),'پیام ارسال شد.');
    if(ok){messageCommandRef.current=undefined;setBody('');setAttachment(undefined);setReplyTo(undefined);setEditingMessage(undefined);}}finally{sendBusyRef.current=false;setSending(false);}};
  const hide=async()=>{if(hiding)return;setHiding(true);try{const ok=await execute('chat-hide',()=>service.hideChatForMe(conversation.id,conversation.version),'گفت‌وگو از فهرست شما حذف شد.');if(ok)setConfirmHide(false);}finally{setHiding(false);}};
  const removeMessage=async()=>{if(!confirmDelete||messageBusy)return;setMessageBusy(true);try{const ok=await execute('chat-delete-message',()=>service.deleteChatMessage(confirmDelete.id,confirmDelete.version),'پیام برای اعضای گفتگو حذف شد.');if(ok)setConfirmDelete(undefined);}finally{setMessageBusy(false);}};
  const beginReply=(message:OperationalRecord)=>{setEditingMessage(undefined);setReplyTo(message);setBody('');window.setTimeout(()=>composerRef.current?.focus(),0);};
  const beginEdit=(message:OperationalRecord)=>{setReplyTo(undefined);setAttachment(undefined);setEditingMessage(message);setBody(message.description);window.setTimeout(()=>{composerRef.current?.focus();composerRef.current?.setSelectionRange(message.description.length,message.description.length);},0);};
  const stepSearch=(direction:1|-1)=>{if(!searchResultIds.length)return;setActiveSearchIndex((current)=>(current+direction+searchResultIds.length)%searchResultIds.length);};
  const revealMessage=(messageId:string)=>{setSharedOpen(false);window.setTimeout(()=>messageRefs.current.get(messageId)?.scrollIntoView({behavior:'smooth',block:'center'}),0);};
  const jumpToDate=()=>{
    if(!jumpDate){setDateJumpStatus('ابتدا تاریخ موردنظر را انتخاب کنید.');return;}
    const target=messages.find((message)=>messageIsoDay(message.createdAt)===jumpDate);
    if(!target){setDateJumpStatus('در این تاریخ پیامی در گفت‌وگو ثبت نشده است.');return;}
    const node=messageRefs.current.get(target.id);
    if(!node){setDateJumpStatus('پیام پیدا شد اما اکنون قابل نمایش نیست؛ دوباره تلاش کنید.');return;}
    setDateJumpStatus('به اولین پیام این تاریخ رفتید.');setJumpedMessageId(target.id);
    node.scrollIntoView({behavior:'smooth',block:'center'});node.focus({preventScroll:true});
    window.setTimeout(()=>setJumpedMessageId((current)=>current===target.id?undefined:current),1800);
  };
  const updatePreference=async(next:{pinned:boolean;muted:boolean})=>{if(preferenceBusy)return;setPreferenceBusy(true);try{await execute('chat-preference',()=>service.updateChatPreference(conversation.id,next,preference?.version??0),next.pinned!==Boolean(preference?.pinned)?next.pinned?'گفت‌وگو سنجاق شد.':'گفت‌وگو از سنجاق خارج شد.':next.muted?'اعلان‌های گفت‌وگو بی‌صدا شد.':'اعلان‌های گفت‌وگو فعال شد.');}finally{setPreferenceBusy(false);}};
  const readByCount=(message:OperationalRecord)=>{const participantIds=chatKind(conversation)==='unit'?state.users.filter((user)=>user.status==='active'&&user.unitId===conversation.unitId&&user.companyId===conversation.companyId).map((user)=>user.id):chatMemberUserIds(conversation);return participantIds.filter((userId)=>userId!==message.createdByUserId&&Boolean(chatReadAt(state.operationalHistory,conversation.id,userId)&&chatReadAt(state.operationalHistory,conversation.id,userId)!>=message.createdAt)).length;};
  return <>
    <header className="chat-thread-header"><ChatKindIcon record={conversation}/><div><h2>{conversation.title}</h2><span>{chatConversationSubtitle(conversation,state)}</span></div><span className="chat-member-count"><UsersRound size={16}/>{chatKind(conversation)==='unit'?'اعضای فعال واحد':`${chatMemberUserIds(conversation).length.toLocaleString('fa-IR')} عضو`}</span>{mayManageGroup&&<button className="icon-button" title="مدیریت گروه" aria-label="مدیریت اعضا و مدیران گروه" onClick={()=>setManagingGroup(true)}><Settings2 size={18}/></button>}<button className={preference?.pinned?'icon-button chat-header-action--active':'icon-button'} disabled={preferenceBusy} title={preference?.pinned?'برداشتن سنجاق':'سنجاق‌کردن گفتگو'} aria-label={preference?.pinned?'برداشتن گفت‌وگو از سنجاق':'سنجاق‌کردن گفت‌وگو'} aria-pressed={Boolean(preference?.pinned)} onClick={()=>void updatePreference({pinned:!preference?.pinned,muted:Boolean(preference?.muted)})}>{preference?.pinned?<PinOff size={18}/>:<Pin size={18}/>}</button><button className={preference?.muted?'icon-button chat-header-action--active':'icon-button'} disabled={preferenceBusy} title={preference?.muted?'فعال‌کردن اعلان‌ها':'بی‌صداکردن اعلان‌ها'} aria-label={preference?.muted?'فعال‌کردن اعلان‌های گفت‌وگو':'بی‌صداکردن اعلان‌های گفت‌وگو'} aria-pressed={Boolean(preference?.muted)} onClick={()=>void updatePreference({pinned:Boolean(preference?.pinned),muted:!preference?.muted})}>{preference?.muted?<BellOff size={18}/>:<Bell size={18}/>}</button><button className={searchOpen?'icon-button chat-header-action--active':'icon-button'} title="جست‌وجو در گفتگو" aria-label="جست‌وجو در پیام‌ها و فایل‌ها" aria-pressed={searchOpen} onClick={()=>{setSearchOpen((value)=>!value);setSharedOpen(false);setDateOpen(false);}}><Search size={18}/></button><button className={dateOpen?'icon-button chat-header-action--active':'icon-button'} title="رفتن به تاریخ" aria-label="رفتن به پیام‌های یک تاریخ" aria-pressed={dateOpen} onClick={()=>{setDateOpen((value)=>!value);setSharedOpen(false);setSearchOpen(false);setDateJumpStatus('');}}><CalendarDays size={18}/></button><button className={sharedOpen?'icon-button chat-header-action--active':'icon-button'} title="فایل‌های به‌اشتراک‌گذاشته‌شده" aria-label={`فایل‌های به‌اشتراک‌گذاشته‌شده؛ ${sharedItems.length.toLocaleString('fa-IR')} مورد`} aria-pressed={sharedOpen} onClick={()=>{setSharedOpen((value)=>!value);setSearchOpen(false);setDateOpen(false);}}><FolderOpen size={18}/>{sharedItems.length>0&&<b className="chat-header-count">{sharedItems.length.toLocaleString('fa-IR')}</b>}</button>{chatKind(conversation)!=='unit'&&<button className="icon-button chat-hide-button" title="حذف از فهرست من" aria-label="حذف گفتگو از فهرست من" onClick={()=>setConfirmHide(true)}><Trash2 size={18}/></button>}</header>
    {searchOpen&&<div className="chat-message-search"><label className="search-field"><Search size={17}/><input ref={searchInputRef} aria-label="جست‌وجو در پیام‌ها و نام فایل‌ها" placeholder="متن پیام، نام فرستنده یا نام فایل…" value={messageQuery} onChange={(event)=>setMessageQuery(event.target.value)}/>{messageQuery&&<button type="button" onClick={()=>setMessageQuery('')} aria-label="پاک‌کردن جست‌وجوی پیام‌ها"><X size={16}/></button>}</label><span role="status">{normalizedMessageQuery?searchResultIds.length?`${(activeSearchIndex+1).toLocaleString('fa-IR')} از ${searchResultIds.length.toLocaleString('fa-IR')}`:'نتیجه‌ای پیدا نشد':'عبارت موردنظر را بنویسید'}</span><button className="icon-button" disabled={!searchResultIds.length} onClick={()=>stepSearch(-1)} aria-label="نتیجه قبلی"><ArrowUp size={17}/></button><button className="icon-button" disabled={!searchResultIds.length} onClick={()=>stepSearch(1)} aria-label="نتیجه بعدی"><ArrowDown size={17}/></button><button className="icon-button" onClick={()=>{setSearchOpen(false);setMessageQuery('');}} aria-label="بستن جست‌وجوی گفتگو"><X size={18}/></button></div>}
    {dateOpen&&<div className="chat-date-jump"><label><span>تاریخ پیام</span><PersianDateInput value={jumpDate} onChange={(value)=>{setJumpDate(value);setDateJumpStatus('');}} ariaLabel="انتخاب تاریخ برای رفتن به پیام"/></label><button type="button" className="button button--secondary button--compact" onClick={jumpToDate}>رفتن به اولین پیام</button><span role="status">{dateJumpStatus||'اولین پیام ثبت‌شده در تاریخ انتخابی نمایش داده می‌شود.'}</span><button className="icon-button" onClick={()=>{setDateOpen(false);setDateJumpStatus('');}} aria-label="بستن انتخاب تاریخ"><X size={18}/></button></div>}
    <div className={dragging?'chat-message-list chat-message-list--dragging':'chat-message-list'} aria-label={`پیام‌های ${conversation.title}`} onDragEnter={mayCreateMessage?onDragEnter:undefined} onDragOver={mayCreateMessage?(event)=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}}:undefined} onDragLeave={mayCreateMessage?onDragLeave:undefined} onDrop={mayCreateMessage?onDrop:undefined}>
      {dragging&&<div className="chat-drop-overlay" aria-hidden="true"><Paperclip size={32}/><strong>فایل یا ویس را اینجا رها کنید</strong><span>پس از بررسی، پیش‌نمایش آن برای ارسال آماده می‌شود.</span></div>}
      {messages.length===0&&<div className="chat-empty"><MessageCircle size={34}/><strong>هنوز پیامی ثبت نشده</strong><span>اولین پیام این گفت‌وگو را ارسال کنید.</span></div>}
      {messages.map((message)=>{const mine=message.createdByUserId===state.activeUser.id;const sender=state.users.find((user)=>user.id===message.createdByUserId);const itemAttachment=chatAttachment(message);const isDeleted=chatMessageIsDeleted(message);const replyTarget=messages.find((item)=>item.id===chatReplyToMessageId(message));const isMatch=searchResultIds.includes(message.id);const isCurrent=activeSearchId===message.id;const isDateTarget=jumpedMessageId===message.id;const mayChange=mayEditMessage&&chatMessageCanBeChanged(message,state.activeUser.id);const readCount=mine?readByCount(message):0;return <article tabIndex={-1} ref={(node)=>{if(node)messageRefs.current.set(message.id,node);else messageRefs.current.delete(message.id);}} key={message.id} className={`${mine?'chat-message chat-message--mine':'chat-message'}${isDeleted?' chat-message--deleted':''}${isMatch?' chat-message--search-match':''}${isCurrent?' chat-message--search-current':''}${isDateTarget?' chat-message--date-target':''}`}>
        <div className="chat-message-meta"><strong>{mine?'شما':sender?.name??'کاربر سازمانی'}</strong><span>{chatMessageEditedAt(message)&&<small>ویرایش‌شده</small>}<time>{dateTime.format(new Date(message.createdAt))}</time></span></div>
        {replyTarget&&<button type="button" className="chat-reply-quote" onClick={()=>messageRefs.current.get(replyTarget.id)?.scrollIntoView({behavior:'smooth',block:'center'})}><Reply size={14}/><span><strong>{replyTarget.createdByUserId===state.activeUser.id?'شما':state.users.find((user)=>user.id===replyTarget.createdByUserId)?.name??'کاربر سازمانی'}</strong><small>{chatMessageIsDeleted(replyTarget)?'پیام حذف شده است':replyTarget.description||chatAttachment(replyTarget)?.fileName||'پیوست'}</small></span></button>}
        {isDeleted?<p className="chat-deleted-copy">این پیام توسط فرستنده حذف شده است.</p>:<>{message.description&&<p>{message.description}</p>}{itemAttachment?.kind==='voice'&&<div className="chat-voice"><Mic size={18}/><audio controls preload="metadata" src={itemAttachment.dataUrl}/></div>}{itemAttachment?.kind==='file'&&<a className="chat-file" href={itemAttachment.dataUrl} download={itemAttachment.fileName}><FileText size={21}/><span><strong>{itemAttachment.fileName}</strong><small>{formatBytes(itemAttachment.size)}</small></span><Download size={17}/></a>}<div className="chat-message-actions">{mayCreateMessage&&<button type="button" onClick={()=>beginReply(message)} aria-label="پاسخ به پیام"><Reply size={14}/> پاسخ</button>}{mayChange&&<button type="button" onClick={()=>beginEdit(message)} aria-label="ویرایش پیام"><Pencil size={14}/> ویرایش</button>}{mayChange&&<button type="button" className="danger" onClick={()=>setConfirmDelete(message)} aria-label="حذف پیام برای همه"><Trash2 size={14}/> حذف</button>}</div></>}
        {mine&&!isDeleted&&<small className="chat-read-receipt"><Check size={13}/>{readCount>0?`خوانده‌شده توسط ${readCount.toLocaleString('fa-IR')} نفر`:'ارسال‌شده'}</small>}
      </article>;})}<div ref={endRef}/>
    </div>
    {(mayCreateMessage||editingMessage)&&<footer className="chat-composer">
      {fileError&&<div className="chat-file-error" role="alert">{fileError}</div>}
      {recording&&<div className="chat-recording-status" role="status"><span className="chat-recording-dot"/><strong>در حال ضبط ویس</strong><bdi dir="ltr">{formatDuration(recordingSeconds)}</bdi><button type="button" onClick={cancelRecording}>لغو ضبط</button></div>}
      {(replyTo||editingMessage)&&<div className="chat-compose-context"><span>{editingMessage?<Pencil size={17}/>:<Reply size={17}/>}<span><strong>{editingMessage?'ویرایش پیام':'پاسخ به پیام'}</strong><small>{editingMessage?.description||replyTo?.description||(replyTo?chatAttachment(replyTo)?.fileName:'')||'پیوست'}</small></span></span><button type="button" onClick={()=>{setReplyTo(undefined);setEditingMessage(undefined);setBody('');}} aria-label="لغو پاسخ یا ویرایش"><X size={16}/></button></div>}
      {attachment&&<div className="chat-pending-attachment"><span>{attachment.kind==='voice'?<Mic size={17}/>:<FileText size={17}/>}<b>{attachment.fileName}</b><small>{formatBytes(attachment.size)}</small></span><button onClick={()=>setAttachment(undefined)} aria-label="حذف فایل انتخاب‌شده"><X size={16}/></button></div>}
      <div className="chat-composer-row"><textarea ref={composerRef} disabled={sending||recording} aria-label={editingMessage?'ویرایش متن پیام':'متن پیام'} placeholder={editingMessage?'متن پیام را ویرایش کنید…':'پیام خود را بنویسید…'} rows={2} maxLength={4000} value={body} onChange={(event)=>setBody(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}}/><label className="icon-button" aria-disabled={sending||recording||Boolean(editingMessage)} title="افزودن فایل"><Paperclip size={19}/><input disabled={sending||recording||Boolean(editingMessage)} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,.docx,.xlsx" onChange={readFile('file')}/></label><label className="icon-button" aria-disabled={sending||recording||Boolean(editingMessage)} title="افزودن فایل صوتی"><AudioLines size={19}/><input disabled={sending||recording||Boolean(editingMessage)} hidden type="file" accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm" onChange={readFile('voice')}/></label>{recording?<button type="button" className="icon-button chat-stop-recording" onClick={stopRecording} aria-label="توقف ضبط ویس" title="توقف و آماده‌سازی ویس"><Square size={18}/></button>:<button type="button" className="icon-button" disabled={sending||Boolean(editingMessage)} onClick={()=>void startRecording()} aria-label="شروع ضبط ویس" title="شروع ضبط از میکروفن"><Mic size={19}/></button>}<button className="button button--primary chat-send" disabled={sending||recording||(editingMessage?!body.trim():(!body.trim()&&!attachment))} onClick={()=>void send()} aria-label={sending?'در حال ثبت':editingMessage?'ثبت ویرایش':'ارسال پیام'}>{editingMessage?<Check size={19}/>:<Send size={19}/>}</button></div>
      <small className="chat-drop-hint">می‌توانید فایل یا ویس را بکشید و داخل صفحه گفت‌وگو رها کنید.</small>
    </footer>}
    {sharedOpen&&<aside className="chat-shared-panel" aria-label="فایل‌های به‌اشتراک‌گذاشته‌شده"><header><div><span className="eyebrow">رسانه‌های گفتگو</span><h3>فایل‌های به‌اشتراک‌گذاشته‌شده</h3></div><button className="icon-button" onClick={()=>setSharedOpen(false)} aria-label="بستن فایل‌های به‌اشتراک‌گذاشته‌شده"><X size={19}/></button></header><label className="search-field"><Search size={17}/><input aria-label="جست‌وجو در فایل‌های به‌اشتراک‌گذاشته‌شده" placeholder="نام فایل یا فرستنده…" value={sharedQuery} onChange={(event)=>setSharedQuery(event.target.value)}/>{sharedQuery&&<button type="button" onClick={()=>setSharedQuery('')} aria-label="پاک‌کردن جست‌وجوی فایل‌ها"><X size={15}/></button>}</label><div className="chat-shared-filters" role="group" aria-label="نوع فایل">{([{id:'all',label:'همه'},{id:'image',label:'تصویر'},{id:'audio',label:'صوت'},{id:'document',label:'سند'}] as const).map((filter)=><button key={filter.id} className={sharedFilter===filter.id?'active':''} aria-pressed={sharedFilter===filter.id} onClick={()=>setSharedFilter(filter.id)}>{filter.label}</button>)}</div><div className="chat-shared-list">{visibleSharedItems.map(({message,attachment:itemAttachment,sender})=>{const mediaCategory=sharedMediaCategory(itemAttachment);return <article key={message.id} className="chat-shared-item"><span className="chat-shared-icon">{mediaCategory==='audio'?<Mic size={19}/>:mediaCategory==='image'?<ImageIcon size={19}/>:<FileText size={19}/>}</span><div><strong title={itemAttachment.fileName}>{itemAttachment.fileName}</strong><small>{sender?.id===state.activeUser.id?'شما':sender?.name??'کاربر سازمانی'} · {dateTime.format(new Date(message.createdAt))} · {formatBytes(itemAttachment.size)}</small>{message.description&&<p>{message.description}</p>}</div>{mediaCategory==='audio'?<audio controls preload="metadata" src={itemAttachment.dataUrl}/>:<a href={itemAttachment.dataUrl} download={itemAttachment.fileName} aria-label={`دانلود ${itemAttachment.fileName}`}><Download size={17}/></a>}<button className="chat-jump-message" onClick={()=>revealMessage(message.id)}>رفتن به پیام</button></article>;})}{visibleSharedItems.length===0&&<div className="chat-empty"><FolderOpen size={34}/><strong>{sharedItems.length?'فایلی با این مشخصات پیدا نشد':'هنوز فایلی به اشتراک گذاشته نشده'}</strong><span>{sharedItems.length?'فیلتر یا نام دیگری را امتحان کنید.':'فایل یا ویس‌های این گفتگو اینجا جمع می‌شوند.'}</span></div>}</div></aside>}
    {managingGroup&&<ManageGroupDialog conversation={conversation} state={state} onClose={()=>setManagingGroup(false)} onSave={async(input)=>{const ok=await execute('chat-group-update',()=>service.updateChatGroup(conversation.id,input,conversation.version),'مشخصات و اعضای گروه به‌روزرسانی شد.');if(ok)setManagingGroup(false);}}/>}
    {confirmDelete&&<RecordDialog ariaLabel="حذف پیام برای همه" className="chat-hide-dialog" onClose={()=>{if(!messageBusy)setConfirmDelete(undefined);}}><header><div><span className="eyebrow">حذف کنترل‌شده</span><h2>پیام برای همه حذف شود؟</h2></div><button className="icon-button" disabled={messageBusy} onClick={()=>setConfirmDelete(undefined)} aria-label="بستن"><X size={20}/></button></header><div className="drawer-body chat-hide-content"><AlertTriangle size={32}/><p>محتوای پیام و پیوست از گفت‌وگو حذف می‌شود، اما زمان حذف و اثرانگشت محتوا برای حسابرسی باقی می‌ماند. این امکان فقط تا ۱۵ دقیقه پس از ارسال فعال است.</p></div><footer><button className="button button--ghost" disabled={messageBusy} onClick={()=>setConfirmDelete(undefined)}>انصراف</button><button className="button button--danger" disabled={messageBusy} onClick={()=>void removeMessage()}>{messageBusy?'در حال حذف…':'حذف برای همه'}</button></footer></RecordDialog>}
    {confirmHide&&<RecordDialog ariaLabel="حذف گفتگو از فهرست من" className="chat-hide-dialog" onClose={()=>{if(!hiding)setConfirmHide(false);}}><header><div><span className="eyebrow">حذف امن گفتگو</span><h2>از فهرست شما حذف شود؟</h2></div><button className="icon-button" disabled={hiding} onClick={()=>setConfirmHide(false)} aria-label="بستن"><X size={20}/></button></header><div className="drawer-body chat-hide-content"><AlertTriangle size={32}/><p>گفت‌وگوی «{conversation.title}» فقط از فهرست شما پنهان می‌شود. پیام‌ها برای طرف مقابل یا اعضای گروه حذف نمی‌شوند و با دریافت پیام جدید دوباره نمایش داده می‌شود.</p></div><footer><button className="button button--ghost" disabled={hiding} onClick={()=>setConfirmHide(false)}>انصراف</button><button className="button button--danger" disabled={hiding} onClick={()=>void hide()}>{hiding?'در حال حذف…':'حذف از فهرست من'}</button></footer></RecordDialog>}
  </>;
}

function ManageGroupDialog({conversation,state,onClose,onSave}:{conversation:OperationalRecord;state:FoundationState;onClose:()=>void;onSave:(input:ChatGroupUpdateInput)=>Promise<void>}){
  const ownerUserId=chatOwnerUserId(conversation),actorIsOwner=ownerUserId===state.activeUser.id;
  const initialMembers=chatMemberUserIds(conversation);
  const initialAdmins=chatAdminUserIds(conversation);
  const [title,setTitle]=useState(conversation.title);
  const [members,setMembers]=useState(initialMembers);
  const [admins,setAdmins]=useState(initialAdmins);
  const [query,setQuery]=useState('');const [errors,setErrors]=useState<string[]>([]);const [saving,setSaving]=useState(false);
  const candidates=useMemo(()=>state.users.filter((user)=>user.status==='active'&&user.companyId===state.activeUser.companyId).map((user)=>{const personnel=state.personnel.find((person)=>person.id===user.personnelId||person.linkedUserId===user.id);const unit=state.units.find((item)=>item.id===user.unitId)?.name??'بدون واحد';const position=state.positions.find((item)=>item.id===user.positionId)?.title??'بدون سمت';return{user,personnel,unit,position,search:normalizeChatSearch(`${user.name} ${user.username} ${personnel?.personnelCode??''} ${unit} ${position}`)};}),[state]);
  const visible=candidates.filter((item)=>item.search.includes(normalizeChatSearch(query)));
  const dirty=title!==conversation.title||[...members].sort().join('|')!==[...initialMembers].sort().join('|')||[...admins].sort().join('|')!==[...initialAdmins].sort().join('|');
  useEffect(()=>{const root=dialogRootFor('مدیریت اعضا و مدیران گروه');if(!root)return;root.dataset.workspaceDirty=dirty?'true':'false';return()=>{delete root.dataset.workspaceDirty;};},[dirty]);
  const safeClose=()=>{const discardConfirmed=dialogRootFor('مدیریت اعضا و مدیران گروه')?.dataset.workspaceDiscard==='true';if(!saving&&(discardConfirmed||!dirty||window.confirm('تغییرات ذخیره‌نشده مدیریت گروه بسته شود؟')))onClose();};
  const submit=async()=>{if(saving)return;const next:string[]=[];if(title.trim().length<3)next.push('نام گروه باید حداقل ۳ نویسه باشد.');if(members.length<2)next.push('گروه باید دست‌کم دو عضو داشته باشد.');setErrors(next);if(next.length)return;setSaving(true);try{await onSave({title,memberUserIds:members,adminUserIds:admins});}finally{setSaving(false);}};
  return <RecordDialog ariaLabel="مدیریت اعضا و مدیران گروه" className="chat-create-dialog" onClose={safeClose}><header><div><span className="eyebrow">مدیریت گروه</span><h2>اعضا و مدیران «{conversation.title}»</h2></div><button className="icon-button" disabled={saving} onClick={safeClose} aria-label="بستن"><X size={20}/></button></header><fieldset className="drawer-body chat-create-fields" disabled={saving}><FormValidationSummary errors={errors}/><label className="field"><RequiredLabel>نام گروه</RequiredLabel><input value={title} onChange={(event)=>setTitle(event.target.value)} maxLength={120}/></label><div className="notice"><UsersRound size={18}/><span>{actorIsOwner?'به‌عنوان مالک می‌توانید اعضا و مدیران را تغییر دهید.':'به‌عنوان مدیر می‌توانید اعضای عادی را تغییر دهید؛ تغییر مدیران فقط با مالک گروه است.'}</span></div><label className="search-field chat-member-search"><Search size={18}/><input autoFocus aria-label="جست‌وجوی اعضای گروه" placeholder="نام، نام کاربری، کد پرسنلی، واحد یا سمت…" value={query} onChange={(event)=>setQuery(event.target.value)}/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="پاک‌کردن جست‌وجو"><X size={16}/></button>}</label><div className="chat-member-search-meta" role="status"><span>{visible.length.toLocaleString('fa-IR')} نفر پیدا شد</span><strong>{members.length.toLocaleString('fa-IR')} عضو · {admins.length.toLocaleString('fa-IR')} مدیر</strong></div><fieldset className="chat-member-picker chat-group-members"><legend>عضویت و سطح مدیریت</legend>{visible.map(({user,personnel,unit,position})=>{const isOwner=user.id===ownerUserId,isAdmin=admins.includes(user.id),memberLocked=isOwner||(!actorIsOwner&&isAdmin);return <div className="chat-group-member" key={user.id}><label><input type="checkbox" checked={members.includes(user.id)} disabled={memberLocked} onChange={()=>setMembers((current)=>current.includes(user.id)?current.filter((id)=>id!==user.id):[...current,user.id])}/><span className="chat-member-identity"><strong>{user.name}{isOwner&&<em>مالک گروه</em>}</strong><small><bdi dir="ltr">@{user.username}</bdi>{personnel&&<> · <bdi dir="ltr">{personnel.personnelCode}</bdi></>}<span> · {unit} · {position}</span></small></span></label><label className="chat-group-role"><input type="checkbox" checked={isAdmin} disabled={!actorIsOwner||isOwner||!members.includes(user.id)} onChange={()=>setAdmins((current)=>current.includes(user.id)?current.filter((id)=>id!==user.id):[...current,user.id])}/><span>مدیر گروه</span></label></div>;})}</fieldset></fieldset><footer><button className="button button--ghost" disabled={saving} onClick={safeClose}>انصراف</button><button className="button button--primary" disabled={saving} onClick={()=>void submit()}>{saving?'در حال ذخیره…':'ذخیره تغییرات گروه'}</button></footer></RecordDialog>;
}

function NewConversationDialog({state,onClose,onSave}:{state:FoundationState;onClose:()=>void;onSave:(input:{kind:ChatConversationKind;title?:string;memberUserIds?:string[];unitId?:string})=>Promise<void>}) {
  const [kind,setKind]=useState<ChatConversationKind>('direct');
  const [title,setTitle]=useState('');
  const [selected,setSelected]=useState<string[]>([]);
  const [memberQuery,setMemberQuery]=useState('');
  const [errors,setErrors]=useState<string[]>([]);
  const [saving,setSaving]=useState(false);
  const candidates=useMemo(()=>state.users.filter((user)=>user.status==='active'&&user.companyId===state.activeUser.companyId&&user.id!==state.activeUser.id).map((user)=>{const personnel=state.personnel.find((person)=>person.id===user.personnelId||person.linkedUserId===user.id);const unit=state.units.find((item)=>item.id===user.unitId)?.name??'بدون واحد';const position=state.positions.find((item)=>item.id===user.positionId)?.title??'بدون سمت';return {user,personnel,unit,position,search:normalizeChatSearch(`${user.name} ${user.username} ${personnel?.personnelCode??''} ${unit} ${position}`)};}),[state]);
  const filteredCandidates=candidates.filter((item)=>item.search.includes(normalizeChatSearch(memberQuery)));
  const dirty=kind!=='direct'||Boolean(title.trim())||selected.length>0;
  useEffect(()=>{const root=dialogRootFor('ساخت گفت‌وگوی جدید');if(!root)return;root.dataset.workspaceDirty=dirty?'true':'false';return()=>{delete root.dataset.workspaceDirty;};},[dirty]);
  const safeClose=()=>{const discardConfirmed=dialogRootFor('ساخت گفت‌وگوی جدید')?.dataset.workspaceDiscard==='true';if(!saving&&(discardConfirmed||!dirty||window.confirm('اطلاعات واردشده گفت‌وگوی جدید بسته شود؟')))onClose();};
  const submit=async()=>{if(saving)return;const next:string[]=[];if(kind==='direct'&&selected.length!==1)next.push('برای گفت‌وگوی شخصی دقیقاً یک نفر را انتخاب کنید.');if(kind==='group'&&selected.length<1)next.push('برای گروه حداقل یک عضو دیگر انتخاب کنید.');if(kind==='group'&&title.trim().length<3)next.push('نام گروه باید حداقل ۳ نویسه باشد.');if(kind==='unit'&&!state.activeUser.unitId)next.push('برای حساب شما واحد سازمانی ثبت نشده است.');setErrors(next);if(next.length)return;setSaving(true);try{await onSave({kind,title,memberUserIds:selected,unitId:state.activeUser.unitId});}finally{setSaving(false);}};
  return <RecordDialog ariaLabel="ساخت گفت‌وگوی جدید" className="chat-create-dialog" onClose={safeClose}><header><div><span className="eyebrow">همکاری سازمانی</span><h2>ساخت گفت‌وگوی جدید</h2></div><button className="icon-button" disabled={saving} onClick={safeClose} aria-label="بستن"><X size={20}/></button></header><fieldset className="drawer-body chat-create-fields" disabled={saving}><FormValidationSummary errors={errors}/><div className="chat-kind-picker" role="radiogroup" aria-label="نوع گفت‌وگو">{([{id:'direct',label:'شخصی',icon:UserRound},{id:'group',label:'گروهی',icon:UsersRound},{id:'unit',label:'واحد سازمانی',icon:Building2}] as const).map((item)=>{const Icon=item.icon;return <button key={item.id} type="button" role="radio" aria-checked={kind===item.id} className={kind===item.id?'chat-kind-option chat-kind-option--active':'chat-kind-option'} onClick={()=>{setKind(item.id);setSelected([]);setMemberQuery('');}}><Icon size={20}/><strong>{item.label}</strong></button>;})}</div>{kind==='group'&&<label className="field"><RequiredLabel>نام گروه</RequiredLabel><input value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="مثلاً تیم پروژه فروش"/></label>}{kind==='unit'?<div className="notice"><Building2 size={18}/><span>اعضای فعال واحد «{state.units.find((unit)=>unit.id===state.activeUser.unitId)?.name??'ثبت‌نشده'}» به‌صورت خودکار عضو می‌شوند.</span></div>:<><label className="search-field chat-member-search"><Search size={18}/><input autoFocus aria-label="جست‌وجوی شخص یا عضو" placeholder="نام، نام کاربری، کد پرسنلی، واحد یا سمت…" value={memberQuery} onChange={(event)=>setMemberQuery(event.target.value)}/>{memberQuery&&<button type="button" onClick={()=>setMemberQuery('')} aria-label="پاک‌کردن جست‌وجو"><X size={16}/></button>}</label><div className="chat-member-search-meta" role="status"><span>{filteredCandidates.length.toLocaleString('fa-IR')} نفر پیدا شد</span>{selected.length>0&&<strong>{selected.length.toLocaleString('fa-IR')} نفر انتخاب شده</strong>}</div><fieldset className="chat-member-picker"><legend>{kind==='direct'?'انتخاب شخص':'انتخاب اعضا'}</legend>{filteredCandidates.map(({user,personnel,unit,position})=><label key={user.id}><input type={kind==='direct'?'radio':'checkbox'} name={kind==='direct'?'direct-member':undefined} checked={selected.includes(user.id)} onChange={()=>setSelected((current)=>kind==='direct'?[user.id]:current.includes(user.id)?current.filter((id)=>id!==user.id):[...current,user.id])}/><span className="chat-member-identity"><strong>{user.name}</strong><small><bdi dir="ltr">@{user.username}</bdi>{personnel&&<> · <bdi dir="ltr">{personnel.personnelCode}</bdi></>}<span> · {unit} · {position}</span></small></span></label>)}{filteredCandidates.length===0&&<div className="chat-member-empty"><Search size={25}/><strong>فردی با این مشخصات پیدا نشد</strong><span>نام، کد پرسنلی یا واحد دیگری را جست‌وجو کنید.</span></div>}</fieldset></>}</fieldset><footer><button className="button button--ghost" disabled={saving} onClick={safeClose}>انصراف</button><button className="button button--primary" disabled={saving} onClick={()=>void submit()}>{saving?'در حال ساخت…':'ساخت گفت‌وگو'}</button></footer></RecordDialog>;
}

function ChatKindIcon({record}:{record:OperationalRecord}) {const Icon=chatKind(record)==='direct'?UserRound:chatKind(record)==='unit'?Building2:UsersRound;return <span className="chat-kind-icon"><Icon size={20}/></span>;}
function formatBytes(size:number){return size<1024*1024?`${Math.max(1,Math.round(size/1024)).toLocaleString('fa-IR')} کیلوبایت`:`${(size/1024/1024).toLocaleString('fa-IR',{maximumFractionDigits:1})} مگابایت`;}
function formatDuration(seconds:number){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
