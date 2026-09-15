import React, { useState } from 'react';
import { ASSETS } from '../data/constants';
import { ShoppingBag, Volume2, Package, Menu, X } from 'lucide-react';
import { trackAddToCartClick } from '../services/analyticsService';

interface NavbarProps {
  onOpenSoundPreview: () => void;
  onOpenOrdersHistory: () => void;
  soundPlaying: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSoundPreview,
  onOpenOrdersHistory,
  soundPlaying,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header id="main-header" className="w-full bg-[#0f1524]/85 backdrop-blur-2xl border-b border-[#7dd3fc]/15 shadow-[0_4px_20px_rgba(0,0,0,0.25)] sticky top-0 z-40 overflow-hidden">
      <div className="h-16 sm:h-20 max-w-7xl mx-auto px-3 sm:px-6 lg:px-12 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo & Name */}
        <a href="#" className="flex items-center gap-2 sm:gap-3 group shrink-0">
          <img
            src={ASSETS.logo}
            alt="Theoria Logo"
            className="h-7 sm:h-9 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <div className="flex flex-col">
            <span className="text-base sm:text-xl font-headline font-black tracking-tight text-[#7dd3fc] flex items-center gap-1.5">
              Theoria Luxury
              <span className="text-[10px] sm:text-xs font-normal text-[#c8a0f0] px-1.5 py-0.5 rounded bg-[#3d2060]/50 border border-[#c8a0f0]/30 hidden xs:inline">
                ثيوريا
              </span>
            </span>
          </div>
        </a>

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          <a
            href="#features"
            className="px-3 py-1.5 text-sm font-medium text-[#e0e8f0] hover:text-[#7dd3fc] hover:bg-[#141c2e] rounded-lg transition-colors"
          >
            المميزات
          </a>
          <a
            href="#clinical-proof"
            className="px-3 py-1.5 text-sm font-medium text-[#e0e8f0] hover:text-[#7dd3fc] hover:bg-[#141c2e] rounded-lg transition-colors"
          >
            كيف يعمل
          </a>
          <a
            href="#clinical-proof"
            className="px-3 py-1.5 text-sm font-medium text-[#e0e8f0] hover:text-[#7dd3fc] hover:bg-[#141c2e] rounded-lg transition-colors"
          >
            الإثبات العلمي
          </a>
          <a
            href="#reviews"
            className="px-3 py-1.5 text-sm font-medium text-[#e0e8f0] hover:text-[#7dd3fc] hover:bg-[#141c2e] rounded-lg transition-colors"
          >
            آراء العملاء
          </a>
          <a
            href="#faq"
            className="px-3 py-1.5 text-sm font-medium text-[#e0e8f0] hover:text-[#7dd3fc] hover:bg-[#141c2e] rounded-lg transition-colors"
          >
            الأسئلة الشائعة
          </a>
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Ambient Sound Preview Button (Tablet & Desktop) */}
          <button
            id="sound-preview-button"
            onClick={onOpenSoundPreview}
            title="تجربة الأصوات المهدئة المدمجة"
            className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all ${
              soundPlaying
                ? 'bg-[#3d2060] border-[#c8a0f0] text-[#e8d0ff] animate-pulse'
                : 'bg-[#141c2e] border-[#7dd3fc]/25 text-[#a0b4c4] hover:text-[#7dd3fc] hover:border-[#7dd3fc]/50'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5 text-[#7dd3fc]" />
            <span className="hidden md:inline">أصوات الاسترخاء</span>
          </button>

          {/* Orders Tracking Button (Tablet & Desktop) */}
          <button
            id="orders-history-button"
            onClick={onOpenOrdersHistory}
            title="متابعة طلباتي"
            className="hidden sm:flex p-2.5 rounded-full bg-[#141c2e] border border-[#7dd3fc]/20 text-[#a0b4c4] hover:text-[#7dd3fc] hover:border-[#7dd3fc]/50 transition-all"
          >
            <Package className="w-4 h-4" />
          </button>

          {/* Main Order CTA */}
          <a
            id="header-order-cta"
            href="#order-form"
            onClick={() => {
              trackAddToCartClick('شريط التنقل العلوي - اطلب الآن');
            }}
            className="bg-[#7dd3fc] text-[#001f2e] hover:bg-[#c8eaff] px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(125,211,252,0.3)] hover:shadow-[0_0_25px_rgba(125,211,252,0.5)] transition-all flex items-center gap-1.5 shrink-0"
          >
            <ShoppingBag className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
            <span>اطلب الآن</span>
          </a>

          {/* Mobile menu toggle */}
          <button
            id="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg bg-[#141c2e] border border-[#7dd3fc]/20 text-[#e0e8f0] shrink-0"
            aria-label="القائمة"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0a0e1a]/95 border-b border-[#7dd3fc]/20 px-6 py-4 flex flex-col gap-3">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="py-2 text-sm font-medium text-[#e0e8f0] border-b border-white/5"
          >
            المميزات العلاجية
          </a>
          <a
            href="#clinical-proof"
            onClick={() => setMobileMenuOpen(false)}
            className="py-2 text-sm font-medium text-[#e0e8f0] border-b border-white/5"
          >
            الدراسة المخبرية والإثبات العلمي
          </a>
          <a
            href="#reviews"
            onClick={() => setMobileMenuOpen(false)}
            className="py-2 text-sm font-medium text-[#e0e8f0] border-b border-white/5"
          >
            آراء العملاء في الجزائر
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="py-2 text-sm font-medium text-[#e0e8f0] border-b border-white/5"
          >
            الأسئلة الشائعة
          </a>
          <div className="pt-2 flex items-center justify-between">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenSoundPreview();
              }}
              className="text-xs text-[#7dd3fc] flex items-center gap-1.5"
            >
              <Volume2 className="w-4 h-4" />
              <span>أصوات الاسترخاء</span>
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenOrdersHistory();
              }}
              className="text-xs text-[#c8a0f0] flex items-center gap-1.5"
            >
              <Package className="w-4 h-4" />
              <span>متابعة طلبيتي</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
