import React, { useState } from 'react';
import { ASSETS } from '../data/constants';
import { Volume2, Package, Menu, X } from 'lucide-react';
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

  const scrollToSection = (e: React.MouseEvent, sectionId: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const goOrder = (e: React.MouseEvent, label: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    trackAddToCartClick(label);
    document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header id="main-header" className="w-full bg-[#0f1524]/85 backdrop-blur-xl border-b border-[#7dd3fc]/20 sticky top-0 z-40 overflow-hidden">
      <div className="h-16 max-w-7xl mx-auto px-4 sm:px-8 flex items-center justify-between gap-2">
        {/* Brand */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center gap-2.5 shrink-0 cursor-pointer"
        >
          <img
            src={ASSETS.logo}
            alt="Theoria Logo"
            width={512}
            height={279}
            decoding="async"
            className="h-7 sm:h-8 w-auto object-contain rounded-md"
          />
          <span className="text-sm sm:text-lg font-headline font-extrabold tracking-tight text-[#e0e8f0]">Theoria</span>
        </a>

        {/* Desktop nav — new design anchors */}
        <nav className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium text-[#a0b4c4]">
          <a href="#problem-vs-solution" onClick={(e) => scrollToSection(e, 'problem-vs-solution')} className="hover:text-[#7dd3fc] transition-colors cursor-pointer">
            مقارنة واقعية
          </a>
          <a href="#clinical-mechanism" onClick={(e) => scrollToSection(e, 'clinical-mechanism')} className="hover:text-[#7dd3fc] transition-colors cursor-pointer">
            العلاج الطبيعي 42°C
          </a>
          <a href="#faq" onClick={(e) => scrollToSection(e, 'faq')} className="hover:text-[#7dd3fc] transition-colors cursor-pointer">
            الأسئلة الشائعة
          </a>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
            <span className="hidden lg:inline">أصوات الاسترخاء</span>
          </button>

          <button
            id="orders-history-button"
            onClick={onOpenOrdersHistory}
            title="متابعة طلباتي"
            className="hidden sm:flex p-2.5 rounded-full bg-[#141c2e] border border-[#7dd3fc]/20 text-[#a0b4c4] hover:text-[#7dd3fc] hover:border-[#7dd3fc]/50 transition-all"
          >
            <Package className="w-4 h-4" />
          </button>

          {/* Price CTA — new design */}
          <a
            id="header-order-cta"
            href="#order-form"
            onClick={(e) => goOrder(e, 'شريط التنقل العلوي - اطلب الآن')}
            className="bg-[#7dd3fc] hover:bg-[#c8eaff] text-[#001f2e] px-3.5 py-2 sm:px-5 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(125,211,252,0.3)] transition-all transform active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <span>9,500 دج</span>
            <span className="material-symbols-outlined text-sm rotate-180">arrow_forward</span>
          </a>

          <button
            id="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg bg-[#141c2e] border border-[#7dd3fc]/20 text-[#e0e8f0] shrink-0"
            aria-label="القائمة"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0a0e1a]/95 border-t border-[#7dd3fc]/20 px-6 py-4 flex flex-col gap-3">
          <a href="#problem-vs-solution" onClick={(e) => scrollToSection(e, 'problem-vs-solution')} className="py-2 text-sm font-medium text-[#e0e8f0] border-b border-white/5 cursor-pointer">
            مقارنة واقعية
          </a>
          <a href="#clinical-mechanism" onClick={(e) => scrollToSection(e, 'clinical-mechanism')} className="py-2 text-sm font-medium text-[#e0e8f0] border-b border-white/5 cursor-pointer">
            العلاج الطبيعي 42°C
          </a>
          <a href="#faq" onClick={(e) => scrollToSection(e, 'faq')} className="py-2 text-sm font-medium text-[#e0e8f0] border-b border-white/5 cursor-pointer">
            الأسئلة الشائعة
          </a>
          <a href="#order-form" onClick={(e) => goOrder(e, 'قائمة الهاتف - اطلب الآن')} className="py-2 text-sm font-bold text-[#7dd3fc] cursor-pointer">
            اطلب الآن - 9,500 دج
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
