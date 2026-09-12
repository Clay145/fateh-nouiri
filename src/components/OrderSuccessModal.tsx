import React from 'react';
import { PlacedOrder } from '../types';
import {
  CheckCircle,
  Truck,
  PhoneCall,
  FileText,
  X,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface OrderSuccessModalProps {
  order: PlacedOrder | null;
  onClose: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({ order, onClose }) => {
  if (!order) return null;

  const whatsappMessage = encodeURIComponent(
    `مرحباً Theoria! قمت بتأكيد طلبيتي لرقم: ${order.orderCode} باسم ${order.customerName} لولاية ${order.wilaya}. أرجو تأكيد الشحن السريع.`
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0f1524] border-2 border-[#7dd3fc]/40 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-right shadow-[0_0_60px_rgba(125,211,252,0.3)] relative my-8">
        <button
          onClick={onClose}
          className="absolute top-5 left-5 p-2 text-[#a0b4c4] hover:text-white rounded-full bg-[#1a2438] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Icon */}
        <div className="text-center space-y-3 mb-6">
          <div className="w-16 h-16 rounded-full bg-[#7dd3fc]/20 border border-[#7dd3fc] text-[#7dd3fc] mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(125,211,252,0.4)]">
            <CheckCircle className="w-10 h-10" />
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0e4d6e] text-[#c8eaff] text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-[#7dd3fc]" />
            تم تسجيل طلبكم بنجاح
          </span>
          <h2 className="text-2xl font-headline font-black text-white">
            شكراً لثقتكم بمتجر Theoria!
          </h2>
          <p className="text-xs sm:text-sm text-[#a0b4c4]">
            سيتصل بكم فريق التأكيد هاتفياً على الرقم{' '}
            <span className="text-[#7dd3fc] font-bold dir-ltr inline-block">
              {order.phone}
            </span>{' '}
            لتأكيد العنوان وبدء الشحن الفوري.
          </p>
        </div>

        {/* Order Details Receipt Box */}
        <div className="bg-[#141c2e] border border-[#7dd3fc]/20 rounded-2xl p-5 space-y-3 text-xs sm:text-sm shadow-inner">
          <div className="flex justify-between items-center pb-2 border-b border-white/10">
            <span className="text-[#a0b4c4]">رقم الطلب:</span>
            <span className="font-mono font-bold text-[#7dd3fc] text-base">{order.orderCode}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#a0b4c4]">اسم الزبون:</span>
            <span className="font-bold text-white">{order.customerName}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#a0b4c4]">الولاية والعنوان:</span>
            <span className="font-bold text-white">
              {order.wilaya} - {order.commune}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#a0b4c4]">الباقة:</span>
            <span className="font-bold text-white">{order.packageTitle}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[#a0b4c4]">الشحن والتوصيل:</span>
            <span className="text-[#7dd3fc] font-bold flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" />
              مجاني 0 دج (خلال 24-48 ساعة)
            </span>
          </div>

          <div className="pt-2 border-t border-white/10 flex justify-between items-center text-base font-black">
            <span className="text-white">المبلغ عند الاستلام:</span>
            <span className="text-[#7dd3fc] text-xl">
              {order.totalPrice.toLocaleString('ar-DZ')} دج
            </span>
          </div>
        </div>

        {/* Guarantees note */}
        <div className="my-4 p-3 rounded-xl bg-[#0a0e1a]/80 border border-white/5 flex items-center gap-3 text-xs text-[#a0b4c4]">
          <ShieldCheck className="w-5 h-5 text-[#7dd3fc] shrink-0" />
          <span>لا تدفع أي سنتيم حتى تستلم علبتك وتفحص جهاز Theoria بنفسك!</span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-2">
          <a
            href={`https://wa.me/213550000000?text=${whatsappMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-black font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <PhoneCall className="w-4 h-4" />
            <span>تأكيد أسرع عبر الواتساب (اختياري)</span>
          </a>

          <button
            onClick={() => window.print()}
            className="w-full py-3 rounded-full bg-[#1a2438] hover:bg-[#202c42] border border-[#7dd3fc]/30 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all"
          >
            <FileText className="w-4 h-4 text-[#7dd3fc]" />
            <span>طباعة أو حفظ وصل الطلب</span>
          </button>

          <button
            onClick={onClose}
            className="w-full py-2.5 text-center text-xs text-[#a0b4c4] hover:text-white"
          >
            العودة للمتجر
          </button>
        </div>
      </div>
    </div>
  );
};
