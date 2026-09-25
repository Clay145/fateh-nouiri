import React from 'react';
import { Bath, Wind, Headphones, Timer, Brain, type LucideIcon } from 'lucide-react';
import { ASSETS } from '../data/constants';

const MECHANISMS: { icon: LucideIcon; title: string; desc: string; accent: 'primary' | 'tertiary' }[] = [
  {
    icon: Bath,
    title: '1. علاج غدد الميبوميان 42°C',
    desc: 'حرارة ثابتة ومهدئة تذيب الدهون العالقة في حواف الجفون وتفرز الترطيب الطبيعي لمكافحة جفاف الشاشات نهائياً.',
    accent: 'primary' as const,
  },
  {
    icon: Wind,
    title: '2. ضغط الصدغين والحاجبين',
    desc: 'وسائد ذكية ثنائية الطبقات تفرغ تشنج الشقيقة فور استشعار بدايتها لترخي عضلات الرأس المشدودة فوراً.',
    accent: 'primary' as const,
  },
  {
    icon: Headphones,
    title: '3. بلوتوث وعزل ضوء 100%',
    desc: 'سواد تام بدون أي تسريب للضوء الخارجي مع صوت محيطي هادئ (قرآن، رقية، أو صوت أمواج) لتهدئة الدماغ المشحون.',
    accent: 'tertiary' as const,
  },
  {
    icon: Timer,
    title: '4. إغلاق تلقائي بعد 15 دقيقة',
    desc: 'لا حاجة للاستيقاظ لإيقافه؛ يتوقف الجهاز ذكياً بعد اكتمال الدورة لتستمر في نومك العميق حتى الصباح براحة وأمان.',
    accent: 'primary' as const,
  },
];

export const ClinicalProofSection: React.FC = () => {
  return (
    <section className="py-12 px-4 sm:px-8 max-w-7xl mx-auto" id="clinical-mechanism">
      <div className="bg-[#141c2e]/50 border border-[#7dd3fc]/20 rounded-3xl p-5 sm:p-8 backdrop-blur-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Graph */}
          <div className="lg:col-span-6 flex flex-col items-center">
            <div className="w-full bg-[#0a0e1a]/80 border border-[#7dd3fc]/20 rounded-2xl p-2 sm:p-3 shadow-xl overflow-hidden">
              <img
                alt="مخطط بياني سريري: هبوط التوتر العصبي خلال 15 دقيقة مع مساج العين الحراري مقابل التصفح بالهاتف"
                className="w-full h-auto object-contain rounded-xl bg-[#0a0e1a]"
                src={ASSETS.clinicalChart}
                width={512}
                height={341}
                loading="lazy"
                decoding="async"
              />
            </div>
            <p className="text-[11px] text-[#a0b4c4]/80 mt-2 text-center">
              * دراسة قياس الإشارات العصبية العضلية ومعدل الاستغراق في النوم: التوتر يهبط من 50% إلى 10% فقط!
            </p>
          </div>

          {/* Mechanisms */}
          <div className="lg:col-span-6 space-y-4 text-right">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#0e4d6e]/40 text-[#7dd3fc] text-xs font-bold">
              <Brain size={14} />
              <span>4 تقنيات مدمجة تحاكي جلسات الطب الصيني والسبا</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-headline font-bold text-white leading-tight">كيف يجعلك Theoria "تنام كالحجر" ويزيل إجهاد اليوم؟</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {MECHANISMS.map((m) => (
                <div key={m.title} className="bg-[#1a2438]/60 p-3.5 rounded-xl border border-[#2a3a48]/30">
                  <div className={`flex items-center gap-2 font-bold text-xs mb-1 ${m.accent === 'tertiary' ? 'text-[#c8a0f0]' : 'text-[#7dd3fc]'}`}>
                    <m.icon size={16} />
                    <span>{m.title}</span>
                  </div>
                  <p className="text-[11px] text-[#a0b4c4] leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
