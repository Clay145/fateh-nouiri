import React from 'react';
import {
  BadgeCheck,
  Truck,
  ArrowLeft,
  ArrowLeftRight,
  ShieldCheck,
  BatteryCharging,
  Thermometer,
} from 'lucide-react';
import { ASSETS } from '../data/constants';
import { trackAddToCartClick } from '../services/analyticsService';

interface HeroSectionProps {
  onOpenSoundPreview: () => void;
  soundPlaying: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onOpenSoundPreview,
  soundPlaying,
}) => {
  const goOrder = (e: React.MouseEvent, label: string) => {
    e.preventDefault();
    trackAddToCartClick(label);
    document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="hero-section" className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 pb-12 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-16 right-10 w-96 h-96 bg-[#7dd3fc]/10 rounded-full blur-3xl pointer-events-none -z-10"></div>
      <div className="absolute top-96 left-5 w-80 h-80 bg-[#c8a0f0]/10 rounded-full blur-3xl pointer-events-none -z-10"></div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
        {/* Copy (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-start text-right space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141c2e]/80 border border-[#7dd3fc]/30 text-[#7dd3fc] text-xs font-semibold">
            <BadgeCheck size={14} />
            <span>الحل الطبيعي المعتمد لجفاف العين والشقيقة وإجهاد الشاشات الطويل</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-headline font-black text-[#e0e8f0] leading-tight tracking-tight">
            تخلّص من شعور <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#ff6b6b] via-orange-400 to-amber-300">"رمل العيون"</span> والصداع الخانق <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-[#7dd3fc] via-[#c8eaff] to-[#c8a0f0]">في 15 دقيقة فقط بدون مسكنات أو قطرات</span>
          </h1>

          <p className="text-sm sm:text-base text-[#a0b4c4] leading-relaxed max-w-2xl">
            جلسة علاجية متكاملة تجمع <strong className="text-white">التدفئة المستمرة 42°C</strong> لإذابة انسداد غدد الميبوميان الدمعية، و<strong className="text-white">ضغط هوائي إيقاعي</strong> للصدغين يخمد نوبات الشقيقة فوراً، مع عزل تام 100% للضوء لتدخل في نوم عميق كالحجر.
          </p>

          {/* Price badge box */}
          <div className="w-full p-4 rounded-2xl bg-[#141c2e]/70 border border-[#7dd3fc]/20 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center flex-wrap gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-[#7dd3fc]">9,500 دج</span>
                <span className="text-sm text-[#a0b4c4] line-through opacity-70">14,900 دج</span>
              </div>
              <span className="px-2 py-0.5 text-xs font-bold rounded bg-[#3d2060] text-[#e8d0ff]">وفر 36%</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#7dd3fc]/20 text-[#7dd3fc] text-xs font-bold border border-[#7dd3fc]/30 shadow-[0_0_15px_rgba(125,211,252,0.3)]">
                <Truck size={14} />
                <span>+ توصيل مجاني 0 دج (وفرت 800 دج)</span>
              </span>
            </div>
            <div className="text-xs text-[#88b4cc] flex items-center gap-1.5 font-medium">
              <BadgeCheck size={16} />
              <span>معاينة وفحص الطرد بيدك قبل دفع أي فلس للموزع</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-3 pt-1">
            <a
              id="hero-order-cta"
              href="#order-form"
              onClick={(e) => goOrder(e, 'زر الهيرو الرئيسي - اطلب الآن')}
              className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-[#7dd3fc] text-[#001f2e] font-headline font-bold text-sm sm:text-base shadow-[0_0_30px_rgba(125,211,252,0.35)] hover:bg-[#c8eaff] transition-all cursor-pointer"
            >
              <span>اطلب الآن - عاين جهازك قبل الدفع</span>
              <ArrowLeft size={18} />
            </a>
            <a
              id="hero-proof-cta"
              href="#problem-vs-solution"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('problem-vs-solution')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-full bg-[#141c2e] border border-[#4a6070]/30 text-[#e0e8f0] hover:bg-[#1a2438] transition-all text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <ArrowLeftRight size={16} className="text-[#7dd3fc]" />
              <span>المقارنة الصادقة (الحياة قبل وبعد)</span>
            </a>
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-3 gap-2 w-full pt-1 text-[11px] text-[#a0b4c4]">
            <div className="flex items-center gap-1.5 bg-[#0a0e1a]/80 p-2 rounded-lg border border-[#7dd3fc]/30 text-[#7dd3fc] font-bold">
              <Truck size={14} />
              <span>توصيل مجاني وسريع لـ 58 ولاية</span>
            </div>
            <div className="flex items-center gap-1.5 bg-[#0a0e1a]/50 p-2 rounded-lg border border-[#2a3a48]/20">
              <ShieldCheck size={14} className="text-[#7dd3fc]" />
              <span>ضمان استبدال 14 يوم</span>
            </div>
            <button
              id="hero-sound-toggle-pill"
              onClick={onOpenSoundPreview}
              className="flex items-center gap-1.5 bg-[#0a0e1a]/50 p-2 rounded-lg border border-[#2a3a48]/20 hover:border-[#c8a0f0]/50 transition-all text-right cursor-pointer"
              title="اضغط للاستماع لأصوات الاسترخاء المدمجة"
            >
              <BatteryCharging size={14} className="text-[#c8a0f0]" />
              <span>{soundPlaying ? 'جاري التشغيل 🎵 - شحن USB يدوم أسبوعاً' : 'شحن USB يدوم أسبوعاً'}</span>
            </button>
          </div>
        </div>

        {/* Visual (5 cols) */}
        <div className="lg:col-span-5 relative flex flex-col items-center">
          <div className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-[#7dd3fc]/30 shadow-2xl bg-[#141c2e] group">
            <img
              alt="صورة واقعية لتجربة جهاز مساج العين الحراري الذكي Theoria أثناء الاسترخاء"
              className="w-full h-72 sm:h-96 object-cover object-center group-hover:scale-105 transition-transform duration-700"
              src={ASSETS.lifestyle}
              width={512}
              height={343}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
            <div className="absolute bottom-3 right-3 left-3 p-2.5 sm:p-3 rounded-xl bg-[#0f1524]/90 backdrop-blur-md border border-[#7dd3fc]/25 flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#7dd3fc]/20 text-[#7dd3fc] flex items-center justify-center font-bold shrink-0">
                  <Thermometer size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">حرارة علاجية دقيقة 42°C</p>
                  <p className="text-[10px] text-[#a0b4c4]">تذيب انسداد غدد الجفون وتفرغ الصداع</p>
                </div>
              </div>
              <span className="text-[10px] sm:text-[11px] px-2 py-1 rounded bg-[#7dd3fc]/15 text-[#7dd3fc] font-mono font-bold shrink-0">15 دقيقة</span>
            </div>
          </div>

          <div className="-mt-4 relative z-10 w-11/12 bg-[#1a2438]/95 backdrop-blur-xl border border-[#7dd3fc]/20 rounded-xl p-2.5 flex items-center gap-3 shadow-xl">
            <img
              src={ASSETS.deviceFolded}
              alt="جهاز Theoria القابل للطي"
              width={128}
              height={128}
              loading="lazy"
              decoding="async"
              className="w-10 h-10 rounded-lg bg-[#0a0e1a]/80 object-contain p-1 border border-[#7dd3fc]/20 shrink-0"
            />
            <div className="flex-1 text-right">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-white">تصميم ذكي قابل للطي 180°</p>
                <span className="text-[9px] text-[#7dd3fc] bg-[#7dd3fc]/10 px-1.5 py-0.5 rounded font-bold">Bluetooth مدمج</span>
              </div>
              <button onClick={onOpenSoundPreview} className="text-[10px] text-[#c8a0f0] hover:text-white transition-colors cursor-pointer">
                {soundPlaying ? 'جاري تشغيل الصوت المحيطي 🎵' : 'اضغط لتجربة الصوت المحيطي'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
