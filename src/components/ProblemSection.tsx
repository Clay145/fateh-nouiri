import React from 'react';
import { X, CircleCheck, Stethoscope, CircleX, Sparkles, ArrowLeft } from 'lucide-react';
import { ASSETS } from '../data/constants';
import { trackAddToCartClick } from '../services/analyticsService';

export const ProblemSection: React.FC = () => {
  return (
    <section className="py-12 px-4 sm:px-8 max-w-7xl mx-auto" id="problem-vs-solution">
      <div className="text-center max-w-3xl mx-auto mb-8">
        <span className="text-xs font-bold text-[#ff6b6b] uppercase tracking-wider bg-[#3d1414]/40 px-3 py-1 rounded-full border border-[#ff6b6b]/20">من واقع شكاوى المستخدمين اليومية</span>
        <h2 className="text-2xl sm:text-3xl font-headline font-bold text-[#e0e8f0] mt-3">
          دوامة المسكنات وقطرات الترطيب المؤقتة.. أم علاج السبب الجذري؟
        </h2>
        <p className="text-xs sm:text-sm text-[#a0b4c4] mt-1">
          إذا كنت تقضي +8 ساعات يومياً أمام الشاشات (مبرمج، محاسب، أستاذ، طالب، مصمم)، فأنت تعيش هذه المعاناة:
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Visual */}
        <div className="lg:col-span-5 rounded-2xl overflow-hidden border border-[#2a3a48]/40 shadow-2xl relative">
          <img
            alt="مقارنة حقيقية: إجهاد العمل والشاشات والصداع مع المسكنات مقابل الراحة التامة والاسترخاء مع قناع Theoria"
            className="w-full h-64 sm:h-80 lg:h-full object-cover"
            src={ASSETS.comparison}
            width={512}
            height={286}
            loading="lazy"
            decoding="async"
          />
          <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-bold text-[#ff6b6b] flex items-center gap-1 border border-[#ff6b6b]/30">
            <X size={14} />
            <span>الحل المؤقت: صداع وقطرات</span>
          </div>
          <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-md text-[11px] font-bold text-[#7dd3fc] flex items-center gap-1 border border-[#7dd3fc]/30">
            <CircleCheck size={14} />
            <span>الحل الجذري: راحة تامة</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="lg:col-span-7 bg-[#141c2e]/60 border border-[#2a3a48]/30 rounded-2xl p-4 sm:p-6 backdrop-blur-xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-right">
            <div className="p-4 rounded-xl bg-[#3d1414]/10 border border-[#ff6b6b]/25 space-y-2.5">
              <div className="flex items-center gap-2 text-[#ff6b6b] font-bold text-sm">
                <Stethoscope size={18} />
                <span>الحلول الاستهلاكية المرهقة</span>
              </div>
              <ul className="text-xs text-[#a0b4c4] space-y-2">
                <li className="flex items-start gap-1.5">
                  <CircleX size={14} className="text-[#ff6b6b] shrink-0 mt-0.5" />
                  <span><strong>قطرات العين الكيميائية:</strong> ترطيب لحظي ينتهي بعد 20 دقيقة، مع مصاريف شهرية لا تنتهي.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CircleX size={14} className="text-[#ff6b6b] shrink-0 mt-0.5" />
                  <span><strong>مسكنات الباراسيتامول والبروفين:</strong> إخفاء مؤقت للألم مع إرهاق المعدة دون فك التشنج العضلي.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CircleX size={14} className="text-[#ff6b6b] shrink-0 mt-0.5" />
                  <span><strong>الكمادات المبللة السريعة:</strong> تبرد في 90 ثانية وتترك فوضى وتبلل الفراش.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CircleX size={14} className="text-[#ff6b6b] shrink-0 mt-0.5" />
                  <span><strong>أرق التصفح الليلي:</strong> الضوء الأزرق يعطل إفراز الميلاتونين وتستيقظ مرهقاً.</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-[#0e4d6e]/20 border border-[#7dd3fc]/30 space-y-2.5">
              <div className="flex items-center gap-2 text-[#7dd3fc] font-bold text-sm">
                <Sparkles size={18} />
                <span>جهاز Theoria الذكي</span>
              </div>
              <ul className="text-xs text-[#a0b4c4] space-y-2">
                <li className="flex items-start gap-1.5">
                  <CircleCheck size={14} className="text-[#7dd3fc] shrink-0 mt-0.5" />
                  <span><strong>إذابة انسداد الغدد الدمعية:</strong> حرارة 42° تعيد إنتاج طبقة الزيت الطبيعية الحامية لقرنيتك.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CircleCheck size={14} className="text-[#7dd3fc] shrink-0 mt-0.5" />
                  <span><strong>ضغط الصدغين المهدئ:</strong> تفريغ شحنات تشنج عضلات الحاجب وفروة الرأس طبيعياً.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CircleCheck size={14} className="text-[#7dd3fc] shrink-0 mt-0.5" />
                  <span><strong>استثمار يدوم لسنوات:</strong> اشتره مرة واحدة ووفر ملايين السنتيمات على الصيدليات وجلسات السبا.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CircleCheck size={14} className="text-[#7dd3fc] shrink-0 mt-0.5" />
                  <span><strong>عزل ضوئي 100% وبلوتوث:</strong> اسمع رقية شرعية، قرآناً، أو أصوات مطر ونَم في دقائق معدودة.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-2 border-t border-[#2a3a48]/20 flex items-center justify-between flex-wrap gap-2 text-xs">
            <span className="text-white font-semibold">هل يستحق استثمار 9,500 دج لراحتك اليومية؟</span>
            <a
              className="text-[#7dd3fc] font-bold hover:underline flex items-center gap-1 cursor-pointer"
              href="#order-form"
              onClick={(e) => {
                e.preventDefault();
                trackAddToCartClick('قسم المقارنة - احجز نسختك');
                document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <span>احجز نسختك الآن قبل نفاد الكمية</span>
              <ArrowLeft size={14} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
