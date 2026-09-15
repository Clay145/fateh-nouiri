import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { trackAddToCartClick } from '../services/analyticsService';

export const FloatingMobileBar: React.FC = () => {
  return (
    <div
      id="floating-mobile-cta"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden p-3 bg-[#0f1524]/95 backdrop-blur-xl border-t border-[#7dd3fc]/20 shadow-2xl"
    >
      <div className="max-w-md mx-auto px-1 flex items-center justify-between gap-2.5 sm:gap-3 text-right">
        <div className="shrink-0 text-right">
          <span className="block text-[10px] text-[#a0b4c4]">السعر الترويجي</span>
          <span className="block text-sm sm:text-base font-black text-[#7dd3fc] leading-tight">
            9,500 دج
          </span>
          <span className="block text-[10px] text-emerald-400">توصيل مجاني</span>
        </div>
        <a
          id="mobile-bottom-order-btn"
          href="#order-form"
          onClick={(e) => {
            e.preventDefault();
            trackAddToCartClick('الشريط السفلي العائم للهاتف - اطلب الآن');
            document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="flex-1 py-2.5 sm:py-3 px-3 sm:px-4 rounded-full bg-[#7dd3fc] text-[#001f2e] text-center font-headline font-black text-xs sm:text-sm shadow-[0_0_20px_rgba(125,211,252,0.3)] hover:bg-[#c8eaff] transition-all flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4 shrink-0" />
          <span>اطلب الآن (الدفع عند الاستلام)</span>
        </a>
      </div>
    </div>
  );
};
