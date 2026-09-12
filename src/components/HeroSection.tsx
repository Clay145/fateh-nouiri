import React from 'react';
import { ASSETS } from '../data/constants';
import {
  ArrowLeft,
  BarChart3,
  ShieldCheck,
  CreditCard,
  BatteryCharging,
  HeartPulse,
  Thermometer,
  Headphones,
  Truck,
  Sparkles,
} from 'lucide-react';

interface HeroSectionProps {
  onOpenSoundPreview: () => void;
  soundPlaying: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenSoundPreview,
  soundPlaying,
}) => {
  return (
    <section id="hero-section" className="relative px-4 sm:px-6 lg:px-12 pt-5 sm:pt-10 pb-12 sm:pb-24 max-w-7xl mx-auto w-full overflow-hidden">
      {/* Dynamic Ambient Background Highlights */}
      <div className="absolute top-0 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-[#7dd3fc]/10 rounded-full blur-3xl pointer-events-none -z-10 max-w-full"></div>
      <div className="absolute top-1/3 left-4 sm:left-10 w-64 sm:w-80 h-64 sm:h-80 bg-[#c8a0f0]/10 rounded-full blur-3xl pointer-events-none -z-10 max-w-full"></div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Text & Action Column (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-start text-right space-y-5 sm:space-y-6 w-full">
          {/* Version badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#141c2e]/80 backdrop-blur-xl border border-[#7dd3fc]/25 text-[#7dd3fc] text-xs sm:text-sm font-medium shadow-[0_0_20px_rgba(125,211,252,0.12)]">
            <span className="w-2 h-2 rounded-full bg-[#7dd3fc] animate-pulse"></span>
            <span>الجيل الأحدث 2024 لتقنية التدليك الأيوني الذكي</span>
          </div>

          {/* Headline */}
          <h1 className="text-2xl sm:text-5xl lg:text-6xl font-headline font-black text-[#e0e8f0] leading-[1.25] tracking-tight">
            ودّع إجهاد العينين والصداع المزمن <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#7dd3fc] via-[#c8eaff] to-[#c8a0f0]">
              في 15 دقيقة فقط!
            </span>
          </h1>

          {/* Subtext */}
          <p className="text-sm sm:text-lg text-[#a0b4c4] leading-relaxed max-w-2xl font-body">
            تمتّع بجلسة استرخاء ملوكية في منزلك مع جهاز <strong className="text-white font-bold">Theoria</strong>. دمج متطور بين ضغط الهواء الذكي المتوازن، الحرارة المهدئة المستمرة (42°C)، ومكبرات صوت بلوتوث مدمجة لإزالة الإرهاق العصبي وتسريع الدخول في نوم عميق وصحي.
          </p>

          {/* Price & Limited Offer Box */}
          <div className="w-full p-4 sm:p-5 rounded-2xl bg-[#141c2e]/70 backdrop-blur-2xl border border-[#7dd3fc]/20 flex flex-wrap items-center justify-between gap-3 sm:gap-4 shadow-xl">
            <div className="flex items-baseline gap-2.5 sm:gap-3">
              <span className="text-2xl sm:text-4xl font-black text-[#7dd3fc] tracking-tight">
                9,500 دج
              </span>
              <span className="text-base sm:text-lg text-[#a0b4c4] line-through opacity-70">
                14,900 دج
              </span>
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-bold rounded-md bg-[#3d2060] text-[#e8d0ff] border border-[#c8a0f0]/30">
                وفر 36%
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-[#c0d8e8]">
              <Truck className="text-[#7dd3fc] w-4 h-4 shrink-0" />
              <span>توصيل مجاني 100% لـ 58 ولاية</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-3 sm:gap-4 pt-1 sm:pt-2">
            <a
              id="hero-order-cta"
              href="#order-form"
              className="inline-flex items-center justify-center gap-2.5 sm:gap-3 px-6 sm:px-8 py-3.5 sm:py-4 rounded-full bg-[#7dd3fc] text-[#001f2e] font-headline font-black text-sm sm:text-base shadow-[0_0_35px_rgba(125,211,252,0.35)] hover:shadow-[0_0_45px_rgba(125,211,252,0.6)] hover:bg-[#c8eaff] transition-all duration-300 transform active:scale-95 text-center"
            >
              <span>اطلب الآن والدفع عند الاستلام</span>
              <ArrowLeft className="w-4 sm:w-5 h-4 sm:h-5 text-[#001f2e]" />
            </a>

            <a
              id="hero-proof-cta"
              href="#clinical-proof"
              className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 sm:py-4 rounded-full bg-[#1a2438]/80 text-[#e0e8f0] hover:bg-[#202c42] transition-all duration-200 text-xs sm:text-sm font-semibold border border-[#4a6070]/30 text-center"
            >
              <BarChart3 className="text-[#7dd3fc] w-4 h-4" />
              <span>شاهد الإثبات العلمي</span>
            </a>
          </div>

          {/* Trust Badges Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 w-full pt-2 sm:pt-4 text-[11px] sm:text-xs text-[#a0b4c4]">
            <div className="flex items-center gap-2 bg-[#0a0e1a]/60 p-2.5 rounded-xl border border-[#2a3a48]/50 h-full">
              <ShieldCheck className="text-[#7dd3fc] w-4 h-4 shrink-0" />
              <span className="leading-tight">ضمان استبدال 14 يوم</span>
            </div>
            <div className="flex items-center gap-2 bg-[#0a0e1a]/60 p-2.5 rounded-xl border border-[#2a3a48]/50 h-full">
              <CreditCard className="text-[#7dd3fc] w-4 h-4 shrink-0" />
              <span className="leading-tight">الدفع بعد الفحص</span>
            </div>
            <div className="flex items-center gap-2 bg-[#0a0e1a]/60 p-2.5 rounded-xl border border-[#2a3a48]/50 h-full">
              <BatteryCharging className="text-[#7dd3fc] w-4 h-4 shrink-0" />
              <span className="leading-tight">شحن سريع Type-C</span>
            </div>
            <div className="flex items-center gap-2 bg-[#0a0e1a]/60 p-2.5 rounded-xl border border-[#2a3a48]/50 h-full">
              <HeartPulse className="text-[#7dd3fc] w-4 h-4 shrink-0" />
              <span className="leading-tight">آمن وطبي 100%</span>
            </div>
          </div>
        </div>

        {/* Product Visual Showcase (5 cols) */}
        <div className="lg:col-span-5 relative flex justify-center w-full mt-2 lg:mt-0">
          <div className="relative w-full max-w-md mx-auto">
            {/* Ambient Glow */}
            <div className="absolute inset-0 bg-gradient-to-tr from-[#7dd3fc]/20 to-[#c8a0f0]/20 rounded-3xl filter blur-2xl transform scale-95 -z-10"></div>

            {/* Main Lifestyle Showcase Frame */}
            <div className="rounded-3xl overflow-hidden bg-[#141c2e]/70 border border-[#7dd3fc]/25 backdrop-blur-2xl shadow-2xl p-2.5 sm:p-3 relative">
              <img
                src={ASSETS.lifestyle}
                alt="تجربة استرخاء مريحة مع جهاز مساج العينين الذكي ثيوريا في المنزل"
                className="w-full h-72 sm:h-96 object-cover rounded-2xl"
                loading="eager"
              />

              {/* Floating Pill: Heat Index */}
              <div className="absolute bottom-4 right-4 sm:bottom-7 sm:right-6 bg-[#202c42]/90 backdrop-blur-xl border border-[#7dd3fc]/30 p-2.5 sm:p-3.5 rounded-2xl shadow-xl flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#7dd3fc]/15 flex items-center justify-center text-[#7dd3fc]">
                  <Thermometer className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="text-right">
                  <p className="text-[10px] sm:text-[11px] text-[#a0b4c4] font-medium">حرارة ثابتة مهدئة</p>
                  <p className="text-xs sm:text-sm font-bold text-white">42°C استرخاء فوري</p>
                </div>
              </div>

              {/* Floating Pill: Bluetooth Audio (Interactive!) */}
              <button
                id="hero-sound-toggle-pill"
                onClick={onOpenSoundPreview}
                className={`absolute top-4 left-4 sm:top-7 sm:left-6 backdrop-blur-xl border p-2 sm:p-3 rounded-2xl shadow-xl flex items-center gap-2 cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                  soundPlaying
                    ? 'bg-[#3d2060]/95 border-[#c8a0f0] text-white ring-2 ring-[#c8a0f0]/50'
                    : 'bg-[#202c42]/90 border-[#c8a0f0]/40 text-[#e0e8f0]'
                }`}
                title="اضغط للاستماع لأصوات الاسترخاء المدمجة"
              >
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#c8a0f0]/20 flex items-center justify-center text-[#c8a0f0]">
                  <Headphones className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </div>
                <span className="text-[11px] sm:text-xs font-semibold">
                  {soundPlaying ? 'جاري التشغيل 🎵' : 'صوت محيطي'}
                </span>
                <Sparkles className="w-3 h-3 text-[#c8a0f0] animate-spin" />
              </button>
            </div>

            {/* Product Float Card Below */}
            <div className="-mt-8 sm:-mt-12 mx-2 sm:mx-4 relative z-10 bg-[#1a2438]/95 backdrop-blur-2xl border border-[#7dd3fc]/30 rounded-2xl p-3 sm:p-3.5 flex items-center gap-3 sm:gap-4 shadow-2xl">
              <img
                src={ASSETS.deviceFolded}
                alt="جهاز Theoria المطوي مع شاشة التحكم الرقمية الذكية"
                className="w-16 sm:w-20 h-14 sm:h-16 object-contain rounded-lg bg-[#0a0e1a]/80 p-1 border border-[#7dd3fc]/20 shrink-0"
              />
              <div className="flex-1 text-right min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-xs sm:text-sm font-bold text-white truncate">تصميم قابل للطي 180°</h4>
                  <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#7dd3fc]/20 text-[#7dd3fc] border border-[#7dd3fc]/30 shrink-0">
                    محمول
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-[#a0b4c4] mt-0.5 leading-snug">
                  شاشة لمس LED + خامات جلدية فاخرة ومضادة للحساسية
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
