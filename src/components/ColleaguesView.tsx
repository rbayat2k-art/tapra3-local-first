import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, DirectMessage, DirectMessageAttachment } from '../types';
import { getJalaliNow } from '../utils/persianDate';
import {
  Send, Paperclip, Mic, Square, Search, MessageCircleMore,
  Download, FileText, CheckCheck, Users2
} from 'lucide-react';

interface ColleaguesViewProps {
  users: User[];
  currentUser: User | null;
  messages: DirectMessage[];
  initialTargetUserId?: string | null;
  onSendMessage: (msg: DirectMessage) => void;
  onMarkConversationRead: (partnerId: string) => void;
}

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB - localStorage has a hard ~5-10MB total ceiling
const MAX_VOICE_SECONDS = 90;

const conversationId = (a: string, b: string) => [a, b].sort().join('__');

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ColleaguesView: React.FC<ColleaguesViewProps> = ({
  users,
  currentUser,
  messages,
  initialTargetUserId,
  onSendMessage,
  onMarkConversationRead
}) => {
  const colleagues = useMemo(() => users.filter(u => u.id !== currentUser?.id), [users, currentUser]);

  const [selectedId, setSelectedId] = useState<string | null>(initialTargetUserId || null);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Jump to a specific colleague when opened from the sidebar shortcut
  useEffect(() => {
    if (initialTargetUserId) setSelectedId(initialTargetUserId);
  }, [initialTargetUserId]);

  // Build per-colleague conversation summaries
  const conversationSummaries = useMemo(() => {
    return colleagues.map((u) => {
      const convId = conversationId(currentUser?.id || '', u.id);
      const convMsgs = messages
        .filter((m) => m.conversationId === convId)
        .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
      const lastMsg = convMsgs[convMsgs.length - 1];
      const unread = convMsgs.filter((m) => m.recipientId === currentUser?.id && !m.readAt).length;
      return { user: u, lastMsg, unread, hasHistory: convMsgs.length > 0 };
    });
  }, [colleagues, messages, currentUser]);

  const activeConversations = conversationSummaries
    .filter((c) => c.hasHistory)
    .sort((a, b) => (b.lastMsg?.timestamp || '').localeCompare(a.lastMsg?.timestamp || ''));

  const otherColleagues = conversationSummaries
    .filter((c) => !c.hasHistory)
    .filter((c) => !search.trim() || c.user.fullName.includes(search.trim()))
    .sort((a, b) => (a.user?.fullName || '').localeCompare(b.user?.fullName || ''));

  const filteredActive = activeConversations.filter(
    (c) => !search.trim() || c.user.fullName.includes(search.trim())
  );

  const selectedUser = colleagues.find((u) => u.id === selectedId) || null;
  const activeConvId = selectedUser ? conversationId(currentUser?.id || '', selectedUser.id) : null;
  const activeMessages = activeConvId
    ? messages.filter((m) => m.conversationId === activeConvId).sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
    : [];

  // Mark as read whenever a conversation is opened / receives new messages while open
  useEffect(() => {
    if (selectedUser) onMarkConversationRead(selectedUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [activeMessages.length, selectedId]);

  const sendMessage = (content: string, attachment?: DirectMessageAttachment) => {
    if (!currentUser || !selectedUser) return;
    if (!content.trim() && !attachment) return;

    const msg: DirectMessage = {
      id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      conversationId: conversationId(currentUser.id, selectedUser.id),
      senderId: currentUser.id,
      senderName: currentUser.fullName,
      recipientId: selectedUser.id,
      recipientName: selectedUser.fullName,
      content: content.trim(),
      attachment,
      timestamp: getJalaliNow(),
      readAt: null
    };
    onSendMessage(msg);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendMessage(inputText);
    setInputText('');
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert(`حجم فایل «${file.name}» بیشتر از سقف مجاز (۳ مگابایت) است. این محدودیت برای حفظ سلامت ذخیره‌سازی مرورگر اعمال شده — لطفاً فایل کوچک‌تری انتخاب کنید.`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      sendMessage('', {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: reader.result as string
      });
    };
    reader.onerror = () => alert('خطا در خواندن فایل. لطفاً دوباره تلاش کنید.');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordChunksRef.current = [];
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) recordChunksRef.current.push(ev.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
        if (blob.size > MAX_FILE_SIZE) {
          alert('پیام صوتی بیش از حد مجاز طولانی شد. لطفاً پیام کوتاه‌تری ضبط کنید.');
          setIsRecording(false);
          setRecordSeconds(0);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          sendMessage('', {
            name: `پیام صوتی - ${recordSeconds} ثانیه`,
            mimeType: 'audio/webm',
            size: blob.size,
            dataUrl: reader.result as string,
            isVoice: true,
            durationSeconds: recordSeconds
          });
        };
        reader.readAsDataURL(blob);
        setIsRecording(false);
        setRecordSeconds(0);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s + 1 >= MAX_VOICE_SECONDS) {
            mediaRecorderRef.current?.stop();
          }
          return s + 1;
        });
      }, 1000);
    } catch (err) {
      setMicError('دسترسی به میکروفون امکان‌پذیر نشد. لطفاً از مرورگر خود اجازه‌ی دسترسی به میکروفون را تایید کنید.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  return (
    <div className="dir-rtl h-[calc(100vh-140px)] min-h-[560px] flex gap-4">
      {/* Contacts / Conversations Panel */}
      <div className="w-72 shrink-0 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Users2 className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-black text-white">همکاران</h2>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جست‌وجوی همکار..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-8 pl-3 py-2 text-[11px] text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredActive.length > 0 && (
            <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-500">گفتگوها</div>
          )}
          {filteredActive.map(({ user, lastMsg, unread }) => (
            <button
              key={user.id}
              onClick={() => setSelectedId(user.id)}
              className={`w-full text-right px-3 py-2.5 flex items-center gap-2.5 transition cursor-pointer ${
                selectedId === user.id ? 'bg-indigo-600/20 border-r-2 border-indigo-500' : 'hover:bg-slate-800/60'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-indigo-300 flex items-center justify-center text-xs font-black shrink-0 border border-slate-700">
                {user.fullName.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-white truncate">{user.fullName}</span>
                  {unread > 0 && (
                    <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center shrink-0">
                      {unread}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                  {lastMsg?.attachment ? (lastMsg.attachment.isVoice ? '🎤 پیام صوتی' : `📎 ${lastMsg.attachment.name}`) : lastMsg?.content}
                </p>
              </div>
            </button>
          ))}

          <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-500">
            {search.trim() ? 'نتایج جست‌وجو' : 'شروع گفتگوی جدید'}
          </div>
          {otherColleagues.map(({ user }) => (
            <button
              key={user.id}
              onClick={() => setSelectedId(user.id)}
              className={`w-full text-right px-3 py-2.5 flex items-center gap-2.5 transition cursor-pointer ${
                selectedId === user.id ? 'bg-indigo-600/20 border-r-2 border-indigo-500' : 'hover:bg-slate-800/60'
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center text-xs font-black shrink-0 border border-slate-700">
                {user.fullName.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <span className="text-xs font-bold text-slate-300 truncate block">{user.fullName}</span>
                <span className="text-[10px] text-slate-500 truncate block mt-0.5">{user.roleTitle}</span>
              </div>
            </button>
          ))}
          {colleagues.length === 0 && (
            <p className="text-[11px] text-slate-500 text-center p-6">همکار دیگری در سیستم ثبت نشده است.</p>
          )}
        </div>
      </div>

      {/* Conversation Panel */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col overflow-hidden">
        {!selectedUser ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
            <MessageCircleMore className="w-10 h-10" />
            <p className="text-xs">یک همکار را از لیست کنار انتخاب کن تا گفتگوی شخصی شروع بشه.</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-slate-800 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-300 flex items-center justify-center text-xs font-black border border-indigo-500/30">
                {selectedUser.fullName.slice(0, 1)}
              </div>
              <div>
                <h3 className="text-xs font-black text-white">{selectedUser.fullName}</h3>
                <p className="text-[10px] text-slate-500">{selectedUser.roleTitle}</p>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
              {activeMessages.length === 0 && (
                <p className="text-[11px] text-slate-500 text-center mt-10">هنوز پیامی رد و بدل نشده — اولین پیام رو بفرست.</p>
              )}
              {activeMessages.map((m) => {
                const isMe = m.senderId === currentUser?.id;
                return (
                  <div key={m.id} className={`flex flex-col max-w-md ${isMe ? 'mr-auto items-end' : 'ml-auto items-start'}`}>
                    <div className={`p-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                      isMe ? 'bg-indigo-600 text-white rounded-tl-none' : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tr-none'
                    }`}>
                      {m.attachment ? (
                        m.attachment.isVoice ? (
                          <div className="flex flex-col gap-1.5 min-w-[200px]">
                            <div className="flex items-center gap-2">
                              <Mic className="w-3.5 h-3.5 shrink-0" />
                              <span className="text-[10px]">پیام صوتی ({m.attachment.durationSeconds}s)</span>
                            </div>
                            <audio controls src={m.attachment.dataUrl} className="h-8 w-full" />
                          </div>
                        ) : m.attachment.mimeType.startsWith('image/') ? (
                          <div className="space-y-1.5">
                            <img src={m.attachment.dataUrl} alt={m.attachment.name} className="rounded-lg max-h-48 object-cover" />
                            <a href={m.attachment.dataUrl} download={m.attachment.name} className="flex items-center gap-1 text-[10px] underline opacity-80">
                              <Download className="w-3 h-3" /> {m.attachment.name}
                            </a>
                          </div>
                        ) : (
                          <a href={m.attachment.dataUrl} download={m.attachment.name} className="flex items-center gap-2">
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="flex-1 truncate">{m.attachment.name}</span>
                            <span className="text-[9px] opacity-70 shrink-0">{formatFileSize(m.attachment.size)}</span>
                          </a>
                        )
                      ) : (
                        m.content
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 flex items-center gap-1">
                      {m.timestamp}
                      {isMe && <CheckCheck className={`w-3 h-3 ${m.readAt ? 'text-emerald-400' : 'text-slate-500'}`} />}
                    </span>
                  </div>
                );
              })}
            </div>

            {micError && (
              <div className="mx-4 mb-2 px-3 py-2 bg-rose-950/40 border border-rose-500/30 rounded-xl text-[10px] text-rose-300">
                {micError}
              </div>
            )}

            <form onSubmit={handleSendText} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
              <input ref={fileInputRef} type="file" onChange={handleFilePick} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="پیوست فایل (حداکثر ۳ مگابایت)"
                className="w-9 h-9 shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center justify-center cursor-pointer"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              {isRecording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="w-9 h-9 shrink-0 bg-rose-600 hover:bg-rose-500 text-white rounded-xl flex items-center justify-center cursor-pointer animate-pulse"
                  title="پایان ضبط و ارسال"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-9 h-9 shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl flex items-center justify-center cursor-pointer"
                  title="ضبط پیام صوتی"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}

              {isRecording ? (
                <div className="flex-1 flex items-center gap-2 bg-slate-800 rounded-2xl px-4 py-2.5 text-rose-300 text-xs font-bold">
                  <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                  <span>در حال ضبط... {recordSeconds}s</span>
                </div>
              ) : (
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="پیام خود را بنویسید..."
                  className="flex-1 bg-slate-800 text-white text-xs rounded-2xl px-4 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
                />
              )}

              <button
                type="submit"
                disabled={isRecording || !inputText.trim()}
                className="w-9 h-9 shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl flex items-center justify-center cursor-pointer transition"
              >
                <Send className="w-4 h-4 rotate-180" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
