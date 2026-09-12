import React, { useState } from 'react';
import { ASSETS } from '../data/constants';
import { ShoppingBag, Volume2, Package, Menu, X, LayoutDashboard } from 'lucide-react';

interface NavbarProps {
  onOpenSoundPreview: () => void;
  onOpenOrdersHistory: () => void;
  onOpenAdminDashboard: () => void;
  soundPlaying: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSoundPreview,
  onOpenOrdersHistory,
  onOpenAdminDashboard,
  soundPlaying,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header id="main-header" className="bg-[#0f1524]/85 backdrop-blur-2xl border-b border-[#7dd3fc]/15 shadow-[0_4px_20px_rgba(0,0,0,0.25)] sticky top-0 z-40">
      <div className="h-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex items-center justify-between gap-4">
        {/* Brand Logo & Name */}
        <a href="#" className="flex items-center gap-3 group">
          <img
            src={ASSETS.logo}
            alt="Theoria Logo"
            className="h-8 sm:h-9 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
          />
          <div className="flex flex-col">
            <span className="text-lg sm:text-xl font-headline font-black tracking-tight text-[#7dd3fc] flex items-center gap-1.5">
              Theoria Luxury
              <span className="text-xs font-normal text-[#c8a0f0] px-1.5 py-0.5 rounded bg-[#3d2060]/50 border border-[#c8a0f0]/30 hidden sm:inline">
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
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Ambient Sound Preview Button */}
          <button
            id="sound-preview-button"
            onClick={onOpenSoundPreview}
            title="تجربة الأصوات المهدئة المدمجة"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border transition-all ${
              soundPlaying
                ? 'bg-[#3d2060] border-[#c8a0f0] text-[#e8d0ff] animate-pulse'
                : 'bg-[#141c2e] border-[#7dd3fc]/25 text-[#a0b4c4] hover:text-[#7dd3fc] hover:border-[#7dd3fc]/50'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5 text-[#7dd3fc]" />
            <span className="hidden sm:inline">أصوات الاسترخاء</span>
          </button>

          {/* Orders Tracking Button */}
          <button
            id="orders-history-button"
            onClick={onOpenOrdersHistory}
            title="متابعة طلباتي"
            className="p-2.5 rounded-full bg-[#141c2e] border border-[#7dd3fc]/20 text-[#a0b4c4] hover:text-[#7dd3fc] hover:border-[#7dd3fc]/50 transition-all"
          >
            <Package className="w-4 h-4" />
          </button>

          {/* Admin Dashboard Live Button */}
          <button
            id="admin-dashboard-button"
            onClick={onOpenAdminDashboard}
            title="لوحة تحكم الطلبات والزبائن المباشرة"
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold bg-[#141c2e] border border-blue-500/40 text-blue-300 hover:text-white hover:bg-blue-600/30 transition-all shadow-[0_0_15px_rgba(59,130,246,0.15)]"
          >
            <LayoutDashboard className="w-3.5 h-3.5 text-[#7dd3fc]" />
            <span className="hidden md:inline">لوحة الإدارة</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>

          {/* Main Order CTA */}
          <a
            id="header-order-cta"
            href="#order-form"
            className="bg-[#7dd3fc] text-[#001f2e] hover:bg-[#c8eaff] px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold shadow-[0_0_20px_rgba(125,211,252,0.3)] hover:shadow-[0_0_25px_rgba(125,211,252,0.5)] transition-all flex items-center gap-1.5"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>اطلب الآن</span>
          </a>

          {/* Mobile menu toggle */}
          <button
            id="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg bg-[#141c2e] border border-[#7dd3fc]/20 text-[#e0e8f0]"
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
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAdminDashboard();
              }}
              className="py-2.5 px-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs text-blue-300 font-bold flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-[#7dd3fc]" />
                <span>لوحة تحكم الطلبات والزبائن المباشرة</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>
            <div className="flex items-center justify-between pt-1">
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
        </div>
      )}
    </header>
  );
};
