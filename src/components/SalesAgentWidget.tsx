import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  Truck,
  CheckCircle2,
  ArrowDownCircle,
  RotateCcw,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import {
  ChatMessage,
  loadStoredChat,
  saveStoredChat,
  sendSalesChatMessage,
  clearStoredChat,
} from '../services/salesAgentService';
import { STORE_PACKAGES } from '../data/packages';
import { ALGERIA_WILAYAS } from '../data/wilayas';
import { submitOrder } from '../services/orderService';
import { PlacedOrder } from '../types';

interface SalesAgentWidgetProps {
  onOrderSuccess?: (order: PlacedOrder) => void;
}

const INITIAL_WELCOME: ChatMessage = {
  id: 'welcome-1',
  role: 'assistant',
  content: `مرحباً بك في متجر **Theoria** الرسمي! 💆‍♂️✨

أنا مستشارك الذكي لجهاز مساج واسترخاء العينين. 
سواء كنت تعاني من **إجهاد الشاشات، الصداع النصفي، أو صعوبة النوم**، يسعدني الإجابة عن أي استفسار أو مساعدتك في اختيار الباقة المناسبة مع **توصيل مجاني لـ 58 ولاية** ودفع عند الاستلام. 

كيف أستطيع مساعدتك اليوم؟`,
  timestamp: Date.now(),
};

const QUICK_PROMPTS = [
  { label: '💰 كم سعر الجهاز؟', query: 'كم سعر الجهاز وما هي الباقات المتوفرة؟' },
  { label: '🚚 كيف يتم التوصيل والدفع؟', query: 'كيف يتم التوصيل والدفع لولايتي وهل التوصيل مجاني؟' },
  { label: '🛡️ هل الجهاز آمن على العينين؟', query: 'هل الجهاز آمن على العينين ولا يضغط على القرنية؟' },
  { label: '💆‍♂️ كيف يعمل وما مميزاته؟', query: 'كيف يعمل الجهاز وما هي التقنيات الأربع المدمجة فيه؟' },
  { label: '📦 أريد طلب الجهاز الآن', query: 'أريد طلب جهاز ثيوريا الآن، كيف أسجل طلبي؟' },
];

export const SalesAgentWidget: React.FC<SalesAgentWidgetProps> = ({ onOrderSuccess }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = loadStoredChat();
    return saved.length > 0 ? saved : [INITIAL_WELCOME];
  });
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showProactiveBubble, setShowProactiveBubble] = useState(false);
  const [proactiveDismissed, setProactiveDismissed] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderConfirmedCode, setOrderConfirmedCode] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Proactive trigger after 18 seconds of browsing
  useEffect(() => {
    if (proactiveDismissed) return;
    const timer = setTimeout(() => {
      if (!isOpen) {
        setShowProactiveBubble(true);
      }
    }, 18000);
    return () => clearTimeout(timer);
  }, [isOpen, proactiveDismissed]);

  // Persist messages whenever updated
  useEffect(() => {
    saveStoredChat(messages);
  }, [messages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setShowProactiveBubble(false);
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await sendSalesChatMessage(
        newMessages.map((m) => ({ role: m.role, content: m.content }))
      );

      const assistantMsg: ChatMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now(),
        orderData: response.orderData,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `عذراً، حدث انقطاع بسيط في الاتصال. يمكنك إعادة السؤال أو ملء نموذج الطلب في أسفل الصفحة وسيتصل بك فريقنا فوراً! 🌿`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFillStoreForm = (orderData: ChatMessage['orderData']) => {
    if (!orderData) return;
    try {
      if (orderData.customerName) {
        const nameEl = document.getElementById('fullname') as HTMLInputElement | null;
        if (nameEl) {
          nameEl.value = orderData.customerName;
          nameEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      if (orderData.phone) {
        const phoneEl = document.getElementById('phone') as HTMLInputElement | null;
        if (phoneEl) {
          phoneEl.value = orderData.phone;
          phoneEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      if (orderData.wilaya) {
        const wilayaSelect = document.getElementById('wilaya') as HTMLSelectElement | null;
        if (wilayaSelect) {
          // Find matching option
          const targetW = orderData.wilaya.trim().toLowerCase();
          for (let i = 0; i < wilayaSelect.options.length; i++) {
            const opt = wilayaSelect.options[i];
            if (opt.text.toLowerCase().includes(targetW) || targetW.includes(opt.value)) {
              wilayaSelect.selectedIndex = i;
              wilayaSelect.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }

      if (orderData.commune) {
        const addressEl = document.getElementById('address') as HTMLInputElement | null;
        if (addressEl) {
          addressEl.value = orderData.commune;
          addressEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }

      setIsOpen(false);
      const formSection = document.getElementById('order-form');
      if (formSection) {
        formSection.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) {
      console.warn('[SalesAgent] Failed to autofill form:', err);
    }
  };

  const handleInstantConfirmOrder = async (orderData: ChatMessage['orderData']) => {
    if (!orderData || submittingOrder) return;

    const pkg =
      STORE_PACKAGES.find((p) => p.id === orderData.packageId) ||
      STORE_PACKAGES[0];

    // Find wilaya details
    const matchedWilaya = ALGERIA_WILAYAS.find(
      (w) =>
        (orderData.wilaya && w.nameAr.includes(orderData.wilaya)) ||
        (orderData.wilaya && orderData.wilaya.includes(w.code))
    );

    const cleanPhone = (orderData.phone || '').replace(/[\s\-\.\(\)]/g, '');

    if (!orderData.customerName || cleanPhone.length < 9) {
      // Prompt user to give missing info
      setMessages((prev) => [
        ...prev,
        {
          id: `missing_${Date.now()}`,
          role: 'assistant',
          content: `لتأكيد طلبك بنجاح، يُرجى تزويدي بالاسم الكامل ورقم الهاتف الصحيح (9 أو 10 أرقام) حتى نتمكن من الاتصال بك وتأكيد التوصيل! 🤝`,
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    setSubmittingOrder(true);
    try {
      const orderPayload: Partial<PlacedOrder> = {
        customerName: orderData.customerName,
        phone: cleanPhone,
        wilaya: matchedWilaya ? matchedWilaya.nameAr : orderData.wilaya || '16 - الجزائر العاصمة',
        commune: orderData.commune || 'وسط المدينة',
        packageTitle: pkg.name,
        totalPrice: pkg.price,
        contentId: pkg.contentId,
        notes: 'تم الطلب عبر مستشار ثيوريا الذكي (AI Sales Agent)',
      };

      const completed = await submitOrder(orderPayload);
      setOrderConfirmedCode(completed.orderCode);

      // Add success confirmation in chat
      setMessages((prev) => [
        ...prev,
        {
          id: `confirmed_${Date.now()}`,
          role: 'assistant',
          content: `🎉 **ألف مبروك! تم تسجيل طلبك بنجاح!**
📦 **رقم الطلب:** \`${completed.orderCode}\`
💰 **المبلغ المطلوب عند الاستلام:** ${completed.totalPrice.toLocaleString('ar-DZ')} دج (التوصيل مجاني 0 دج)

سيتصل بك مندوب خدمة العملاء قريباً لتأكيد موعد التوصيل حتى باب بيتك. شكراً لثقتك في متجر ثيوريا! ✨`,
          timestamp: Date.now(),
        },
      ]);

      if (onOrderSuccess) {
        onOrderSuccess(completed);
      }
    } catch (err: any) {
      console.error('[SalesAgent] Order submit error:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `submit_err_${Date.now()}`,
          role: 'assistant',
          content: `تعذر إتمام الإرسال المباشر. تم حفظ معلوماتك، يمكنك الضغط على زر "تعبئة في النموذج" بالأسفل وتأكيد الطلب بضغطة زر واحدة!`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleResetChat = () => {
    clearStoredChat();
    setMessages([INITIAL_WELCOME]);
  };

  // Helper to format text with bold and list items
  const renderFormattedText = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Bold rendering
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedParts = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} className="font-bold text-white">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      return (
        <p key={idx} className={line.trim() === '' ? 'h-2' : 'min-h-[1.2rem] leading-relaxed my-0.5'}>
          {formattedParts}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating Action Trigger Button (Left side, elevated above bottom dock) */}
      <div className="fixed bottom-24 sm:bottom-28 left-4 sm:left-6 z-40 flex flex-col items-start gap-2">
        {/* Proactive Tooltip Bubble */}
        {showProactiveBubble && !isOpen && (
          <div className="relative max-w-xs sm:max-w-sm bg-[#131e36]/95 backdrop-blur-xl border border-[#7dd3fc]/40 text-[#e0e8f0] p-3.5 rounded-2xl rounded-bl-sm shadow-[0_10px_35px_rgba(0,0,0,0.6)] animate-fade-in-up transition-all mb-1">
            <button
              onClick={() => {
                setShowProactiveBubble(false);
                setProactiveDismissed(true);
              }}
              aria-label="إغلاق التنبيه"
              className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-[#1e2d4d] border border-white/20 text-[#a0b4c4] hover:text-white flex items-center justify-center text-xs shadow-md transition-colors"
            >
              <X size={13} />
            </button>
            <div
              className="cursor-pointer"
              onClick={() => {
                setIsOpen(true);
                setShowProactiveBubble(false);
              }}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#7dd3fc] mb-1">
                <Sparkles size={14} className="text-[#38bdf8] animate-spin-slow" />
                <span>مستشار ثيوريا للاسترخاء</span>
              </div>
              <p className="text-xs text-[#cbd5e1] leading-relaxed">
                هل تعاني من إجهاد الشاشات أو الصداع؟ 💆‍♂️ يسعدني إجابة أسئلتك واختيار الباقة الأنسب لك!
              </p>
              <div className="mt-2 text-[11px] font-bold text-[#38bdf8] flex items-center gap-1">
                <span>اضغط للتحدث معي الآن</span>
                <span className="text-base leading-none">←</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Floating Bubble */}
        <button
          id="theoria-sales-ai-bubble"
          onClick={() => setIsOpen((prev) => !prev)}
          type="button"
          aria-label="تحدث مع مستشار ثيوريا الذكي"
          className="relative group p-3.5 sm:p-4 rounded-full bg-gradient-to-tr from-[#0284c7] via-[#0ea5e9] to-[#38bdf8] text-white shadow-[0_8px_30px_rgba(14,165,233,0.5)] hover:shadow-[0_12px_40px_rgba(14,165,233,0.7)] transition-all duration-300 hover:scale-105 active:scale-95 border-2 border-white/30 flex items-center justify-center"
        >
          {/* Pulsing Aura */}
          <span className="absolute inset-0 rounded-full bg-[#38bdf8] opacity-40 animate-ping pointer-events-none" />

          {/* Online green indicator dot */}
          <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-[#0a0e1a] shadow-[0_0_8px_#34d399]" />

          {isOpen ? (
            <ChevronDown size={24} className="transition-transform" />
          ) : (
            <div className="relative flex items-center justify-center">
              <Bot size={24} className="group-hover:rotate-12 transition-transform duration-300" />
              <Sparkles size={12} className="absolute -top-1 -right-1 text-amber-300 animate-pulse" />
            </div>
          )}
        </button>
      </div>

      {/* Slide-in Luxury Chat Modal / Drawer */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sales-chat-title"
          className="fixed bottom-24 sm:bottom-28 left-3 sm:left-6 z-50 w-[calc(100vw-24px)] sm:w-[420px] max-w-[430px] h-[580px] max-h-[calc(100vh-140px)] bg-[#0c1222]/98 backdrop-blur-2xl border border-[#7dd3fc]/30 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden animate-fade-in transition-all"
        >
          {/* Header */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-[#111c33] via-[#162544] to-[#111c33] border-b border-[#7dd3fc]/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative w-9 h-9 rounded-full bg-gradient-to-tr from-[#0369a1] to-[#38bdf8] p-0.5 flex items-center justify-center shadow-inner">
                <Bot size={20} className="text-white" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#111c33]" />
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <h3 id="sales-chat-title" className="font-headline font-bold text-sm text-white">
                    مستشار ثيوريا الذكي
                  </h3>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-bold">
                    متصل
                  </span>
                </div>
                <p className="text-[11px] text-[#94a3b8]">خبير الاسترخاء والمبيعات • رد فوري</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleResetChat}
                title="إعادة بدء المحادثة"
                className="p-1.5 rounded-lg text-[#94a3b8] hover:text-white hover:bg-white/10 transition-colors"
              >
                <RotateCcw size={16} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="تصغير المحادثة"
                className="p-1.5 rounded-lg text-[#94a3b8] hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-2 bg-[#090d19]/80 border-b border-white/5 overflow-x-auto no-scrollbar flex items-center gap-1.5 text-xs whitespace-nowrap">
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(qp.query)}
                disabled={isLoading}
                className="px-2.5 py-1 rounded-full bg-[#16223b] hover:bg-[#1e2f52] border border-[#7dd3fc]/20 hover:border-[#7dd3fc]/50 text-[#cbd5e1] hover:text-white text-[11px] transition-all flex-shrink-0 active:scale-95"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 text-xs sm:text-sm">
            {messages.map((msg) => {
              const isAsst = msg.role === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isAsst ? 'items-start' : 'items-end'} transition-all`}
                >
                  <div
                    className={`max-w-[88%] p-3 rounded-2xl text-right leading-relaxed ${
                      isAsst
                        ? 'bg-[#152038] border border-[#7dd3fc]/20 text-[#e2e8f0] rounded-br-sm shadow-md'
                        : 'bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] text-white rounded-bl-sm shadow-[0_4px_15px_rgba(2,132,199,0.3)]'
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1 opacity-70 text-[10px]">
                      {isAsst ? <Bot size={12} /> : <User size={12} />}
                      <span>{isAsst ? 'مستشار ثيوريا' : 'أنت'}</span>
                    </div>

                    <div className="space-y-1">{renderFormattedText(msg.content)}</div>
                  </div>

                  {/* Interactive Order Card if assistant generated order details */}
                  {isAsst && msg.orderData && (
                    <div className="mt-2 w-[92%] p-3 rounded-xl bg-gradient-to-b from-[#162a4a] to-[#0f1d33] border border-[#38bdf8]/40 shadow-lg text-right animate-fade-in">
                      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
                        <div className="flex items-center gap-1.5 text-[#38bdf8] font-bold text-xs">
                          <CheckCircle2 size={16} />
                          <span>بيانات طلبك الجاهزة:</span>
                        </div>
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                          توصيل مجاني لـ 58 ولاية
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-[#cbd5e1]">
                        {msg.orderData.customerName && (
                          <div className="flex justify-between">
                            <span className="text-[#94a3b8]">الاسم:</span>
                            <span className="font-bold text-white">{msg.orderData.customerName}</span>
                          </div>
                        )}
                        {msg.orderData.phone && (
                          <div className="flex justify-between">
                            <span className="text-[#94a3b8]">الهاتف:</span>
                            <span className="font-bold text-white font-mono">{msg.orderData.phone}</span>
                          </div>
                        )}
                        {msg.orderData.wilaya && (
                          <div className="flex justify-between">
                            <span className="text-[#94a3b8]">الولاية:</span>
                            <span className="font-bold text-white">{msg.orderData.wilaya}</span>
                          </div>
                        )}
                        {msg.orderData.commune && (
                          <div className="flex justify-between">
                            <span className="text-[#94a3b8]">العنوان/البلدية:</span>
                            <span className="font-bold text-white">{msg.orderData.commune}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-white/10 pt-1.5 mt-1 text-sm font-bold text-[#7dd3fc]">
                          <span>المبلغ الإجمالي:</span>
                          <span>
                            {(msg.orderData.packageId === 'double'
                              ? 17500
                              : msg.orderData.packageId === 'triple'
                              ? 24900
                              : 9500
                            ).toLocaleString('ar-DZ')}{' '}
                            دج
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2">
                        <button
                          onClick={() => handleInstantConfirmOrder(msg.orderData)}
                          disabled={submittingOrder || orderConfirmedCode !== null}
                          type="button"
                          className="w-full py-2.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-50"
                        >
                          {submittingOrder ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>جاري إرسال الطلب...</span>
                            </>
                          ) : orderConfirmedCode ? (
                            <>
                              <CheckCircle2 size={14} />
                              <span>تم تأكيد الطلب بنجاح ({orderConfirmedCode})</span>
                            </>
                          ) : (
                            <>
                              <span>🚀 تأكيد وإرسال الطلب الآن</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleFillStoreForm(msg.orderData)}
                          type="button"
                          className="w-full py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-[#cbd5e1] hover:text-white font-medium text-xs transition-colors flex items-center justify-center gap-1"
                        >
                          <ArrowDownCircle size={14} />
                          <span>تعبئة في نموذج المتجر للتدقيق</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start">
                <div className="bg-[#152038] border border-[#7dd3fc]/20 text-[#94a3b8] p-3 rounded-2xl rounded-br-sm flex items-center gap-2">
                  <Bot size={15} className="animate-bounce text-[#38bdf8]" />
                  <span className="text-xs">المستشار يكتب الرد...</span>
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] animate-ping" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Trust Guarantees Micro-Strip */}
          <div className="px-3 py-1 bg-[#0a0f1d] border-t border-white/5 flex items-center justify-around text-[10px] text-[#88b4cc]">
            <div className="flex items-center gap-1">
              <Truck size={12} className="text-emerald-400" />
              <span>توصيل مجاني 58 ولاية</span>
            </div>
            <div className="flex items-center gap-1">
              <ShieldCheck size={12} className="text-emerald-400" />
              <span>دفع عند الاستلام + ضمان سنة</span>
            </div>
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-[#0d1527] border-t border-[#7dd3fc]/20">
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="اكتب استفسارك هنا (مثلاً: كم السعر أو التوصيل)..."
                disabled={isLoading}
                className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-[#16223b] border border-white/10 focus:border-[#38bdf8] focus:ring-1 focus:ring-[#38bdf8] text-white text-xs placeholder:text-[#64748b] outline-none transition-all"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isLoading}
                type="button"
                aria-label="إرسال"
                className="absolute left-1.5 p-2 rounded-lg bg-gradient-to-r from-[#0284c7] to-[#0ea5e9] text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} className="rotate-180" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
