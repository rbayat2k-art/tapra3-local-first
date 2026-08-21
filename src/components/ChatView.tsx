import React, { useState } from 'react';
import { ChatMessage, User } from '../types';
import { getJalaliNow } from '../utils/persianDate';
import { 
  MessageSquare, Send, User as UserIcon, 
  ShieldCheck, Lock, CheckCheck 
} from 'lucide-react';

interface ChatViewProps {
  messages: ChatMessage[];
  currentUser: User | null;
  onSendMessage: (msg: ChatMessage) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  currentUser,
  onSendMessage
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      senderId: currentUser?.id || 'admin',
      senderName: currentUser?.fullName || 'رضا بیات',
      senderRole: currentUser?.roleTitle || 'مدیر خزانه‌داری',
      content: inputText.trim(),
      timestamp: getJalaliNow()
    };

    onSendMessage(newMsg);
    setInputText('');
  };

  return (
    <div className="space-y-6 dir-rtl">
      
      {/* Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30 flex items-center justify-center font-bold">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white">
              گفتگوی داخلی بین کاربران و پرسنل خزانه‌داری
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              پیام‌رسان درون‌برنامه‌ای جهت هماهنگی فاکتورها، استعلام صورت‌حساب‌ها و هماهنگی پرداخت‌ها
            </p>
          </div>
        </div>

        <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-3 py-1.5 rounded-xl border border-emerald-500/30">
          کانال عمومی آنلاین
        </span>
      </div>

      {/* Chat Messages Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col h-[520px] shadow-sm">
        
        {/* Messages List */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => {
            const isMe = msg.senderId === currentUser?.id || msg.senderName === currentUser?.fullName;

            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-lg ${isMe ? 'mr-auto text-left items-end' : 'ml-auto text-right items-start'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-slate-200">{msg.senderName}</span>
                  <span className="text-[10px] text-indigo-400 font-medium">({msg.senderRole})</span>
                </div>

                <div className={`p-4 rounded-2xl text-xs leading-relaxed shadow-sm ${
                  isMe
                    ? 'bg-indigo-600 text-white rounded-tl-none'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tr-none'
                }`}>
                  {msg.content}
                </div>

                <span className="text-[9px] text-slate-500 mt-1 flex items-center gap-1">
                  {msg.timestamp}
                  {isMe && <CheckCheck className="w-3 h-3 text-indigo-400" />}
                </span>
              </div>
            );
          })}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSend} className="p-4 bg-slate-950 border-t border-slate-800 flex items-center gap-3">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="پیام خود را جهت گفتگو با همکاران و خزانه‌داری بنویسید..."
            className="flex-1 bg-slate-800 text-white text-xs rounded-2xl px-4 py-3 border border-slate-700 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-2xl shadow transition flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span>ارسال پیام</span>
            <Send className="w-4 h-4 rotate-180" />
          </button>
        </form>

      </div>

    </div>
  );
};
