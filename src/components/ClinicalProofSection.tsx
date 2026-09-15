import React, { useState } from 'react';
import { ASSETS } from '../data/constants';
import { FlaskConical, ArrowLeft, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import { trackAddToCartClick } from '../services/analyticsService';

export const ClinicalProofSection: React.FC = () => {
  const [selectedView, setSelectedView] = useState<'chart' | 'comparison'>('chart');

  return (
    <section id="clinical-proof" className="py-12 sm:py-20 px-4 sm:px-6 lg:px-12 max-w-7xl mx-auto w-full overflow-hidden">
      <div className="bg-[#141c2e]/70 backdrop-blur-2xl border border-[#7dd3fc]/20 rounded-3xl p-4 sm:p-10 lg:p-12 shadow-2xl relative overflow-hidden">
        {/* Glow ambient */}
        <div className="absolute top-0 right-0 w-72 sm:w-80 h-72 sm:h-80 bg-[#7dd3fc]/10 rounded-full blur-3xl pointer-events-none max-w-full"></div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Graph Explanation Text (5 cols) */}
          <div className="lg:col-span-5 flex flex-col space-y-4 sm:space-y-5 text-right w-full">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#0e4d6e] text-[#c8eaff] text-xs font-bold w-fit border border-[#7dd3fc]/30">
              <FlaskConical className="w-4 h-4 text-[#7dd3fc]" />
              <span>دراسة مخبرية مثبتة</span>
            </div>

            <h2 className="text-xl sm:text-3xl lg:text-4xl font-headline font-black text-white leading-snug">
              15 دقيقة فقط تمنحك استرخاءً عميقاً يعادل ساعات من الراحة
            </h2>

            <p className="text-sm sm:text-base text-[#a0b4c4] leading-relaxed">
              عندما تحاول الاسترخاء عبر تصفح هاتفك في الفراش، يرتفع التوتر العصبي وتتسارع ضربات القلب إلى 85%. في المقابل، تُثبت الاختبارات أن تدليك <strong className="text-white">Theoria</strong> الحراري يُخفض مستوى التوتر إلى 10% فقط خلال 15 دقيقة، محفزاً إفراز هرمون النوم الطبيعي (الميلاتونين).
            </p>

            {/* Stat comparison cards */}
            <div className="space-y-3 pt-1 sm:pt-2 w-full">
              <div className="flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl bg-[#1a2438]/85 border border-[#7dd3fc]/25 shadow-sm">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#7dd3fc]/20 text-[#7dd3fc] flex items-center justify-center font-bold text-sm shrink-0">
                  <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-[#7dd3fc]" />
                </div>
                <div className="text-xs sm:text-sm">
                  <span className="font-bold text-white">مع مساج Theoria الحراري 42°:</span>
                  <span className="text-[#a0b4c4]"> انخفاض التوتر من 50% إلى 10% فقط (استرخاء ونوم فوري).</span>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl bg-[#1a2438]/85 border border-[#ff6b6b]/20 shadow-sm">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#3d1414]/80 text-[#ff6b6b] flex items-center justify-center font-bold text-sm shrink-0">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-[#ff6b6b]" />
                </div>
                <div className="text-xs sm:text-sm">
                  <span className="font-bold text-white">مع شاشة الهاتف الذكي:</span>
                  <span className="text-[#a0b4c4]"> ارتفاع التوتر إلى 85% وتشتت إفراز الميلاتونين وتشنج العين.</span>
                </div>
              </div>
            </div>

            {/* Link CTA */}
            <div className="pt-2 flex flex-wrap items-center gap-3 sm:gap-4">
              <a
                href="#order-form"
                onClick={() => {
                  trackAddToCartClick('قسم الإثبات العلمي - زر جرّب الفرق');
                }}
                className="text-[#7dd3fc] hover:text-[#c8eaff] font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 sm:gap-2 group"
              >
                <span>جرّب الفرق بنفسك اليوم دون مخاطرة</span>
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
              </a>

              <button
                onClick={() => setSelectedView(selectedView === 'chart' ? 'comparison' : 'chart')}
                className="text-xs text-[#a0b4c4] hover:text-white underline underline-offset-4 cursor-pointer"
              >
                {selectedView === 'chart' ? 'عرض جدول المقارنة' : 'عرض المخطط البياني'}
              </button>
            </div>
          </div>

          {/* Infographic Container (7 cols) */}
          <div className="lg:col-span-7 flex flex-col items-center w-full">
            {selectedView === 'chart' ? (
              <div className="w-full rounded-2xl overflow-hidden bg-[#0a0e1a]/90 border border-[#7dd3fc]/25 p-2 sm:p-4 shadow-2xl transition-all">
                <img
                  src={ASSETS.clinicalChart}
                  alt="مخطط بياني يوضح الفارق بين استخدام الهاتف الذكي ومساج العين الحراري على خفض مستوى التوتر العصبي"
                  className="w-full h-auto object-contain rounded-xl"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="w-full rounded-2xl bg-[#0a0e1a]/90 border border-[#7dd3fc]/25 p-4 sm:p-5 shadow-2xl text-right">
                <h4 className="text-sm sm:text-base font-bold text-white mb-3 sm:mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-[#7dd3fc]" />
                  مقارنة النتائج السريرية بعد 15 دقيقة
                </h4>
                <div className="space-y-2.5 sm:space-y-3 text-xs sm:text-sm">
                  <div className="p-2.5 sm:p-3 rounded-xl bg-[#141c2e] border border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                    <span className="text-[#a0b4c4]">معدل ضربات القلب والهدوء</span>
                    <span className="text-[#7dd3fc] font-bold">انخفاض بنسبة 32% (استرخاء)</span>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-xl bg-[#141c2e] border border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                    <span className="text-[#a0b4c4]">ترطيب القرنية الطبيعي</span>
                    <span className="text-[#7dd3fc] font-bold">تحسن بنسبة 68% بالتدليك الهوائي</span>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-xl bg-[#141c2e] border border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                    <span className="text-[#a0b4c4]">تخفيف آلام الصداع النصفي</span>
                    <span className="text-[#7dd3fc] font-bold">تحسن فوري لدى 92% من المجربين</span>
                  </div>
                  <div className="p-2.5 sm:p-3 rounded-xl bg-[#141c2e] border border-white/10 flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                    <span className="text-[#a0b4c4]">سرعة الاستغراق في النوم</span>
                    <span className="text-[#7dd3fc] font-bold">خلال 10-15 دقيقة فقط</span>
                  </div>
                </div>
              </div>
            )}
            <p className="text-[10px] sm:text-[11px] text-[#a0b4c4]/80 mt-3 text-center">
              * نتائج تجريبية سريرية لقياس النشاط العصبي العضلي ومعدل استجابة النوم بعد 15 دقيقة
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
