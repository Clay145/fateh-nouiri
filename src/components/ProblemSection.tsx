import React from 'react';
import { AlertTriangle, EyeOff, Brain, Moon, Sparkles } from 'lucide-react';

export const ProblemSection: React.FC = () => {
  const problems = [
    {
      id: 'dry-eyes',
      title: 'إجهاد وجفاف حاد بالعينين',
      desc: 'حرقة مستمرة وشعور بوجود رمل داخل العين نتيجة التحديق الطويل في الشاشات الزرقاء دون وميض كافٍ.',
      icon: EyeOff,
    },
    {
      id: 'migraine',
      title: 'صداع نصفي متكرر',
      desc: 'ضغط خانق عند الصدغين وقاع الجمجمة يُعكر مزاجك ويسلبك طاقتك وقدرتك على التركيز وإنجاز مهامك.',
      icon: Brain,
    },
    {
      id: 'insomnia',
      title: 'أرق وصعوبة الاستغراق في النوم',
      desc: 'التقلب في السرير لساعات طويلة مع استمرار تشتت الدماغ والتوتر العصبي الناتج عن التصفح الليلي.',
      icon: Moon,
    },
    {
      id: 'dark-circles',
      title: 'هالات سوداء وانتفاخ صباحي',
      desc: 'ضعف الدورة الدموية الدقيقة حول مدار العين يُسرّع ظهور ملامح التعب والشيخوخة المبكرة للبشرة.',
      icon: Sparkles,
    },
  ];

  return (
    <section id="problems-section" className="py-16 sm:py-20 px-4 sm:px-6 lg:px-12 max-w-7xl mx-auto w-full">
      <div className="text-center max-w-2xl mx-auto mb-12 space-y-3">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#ff6b6b] uppercase tracking-wider bg-[#3d1414]/60 px-3.5 py-1 rounded-full border border-[#ff6b6b]/30">
          <AlertTriangle className="w-3.5 h-3.5 text-[#ff6b6b]" />
          <span>الواقع اليومي المؤلم</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-headline font-extrabold text-[#e0e8f0]">
          هل تعاني يومياً من هذه الأعراض المزعجة؟
        </h2>
        <p className="text-sm sm:text-base text-[#a0b4c4]">
          شاشات الهواتف، الحواسيب، والضغوطات اليومية تضع عضلات العين في تشنج دائم ومستمر
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {problems.map((problem) => {
          const Icon = problem.icon;
          return (
            <div
              key={problem.id}
              id={`problem-card-${problem.id}`}
              className="bg-[#141c2e]/55 backdrop-blur-xl border border-[#2a3a48]/50 rounded-2xl p-6 relative overflow-hidden group hover:border-[#ff6b6b]/40 hover:bg-[#141c2e]/80 transition-all duration-300 text-right shadow-lg flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-[#3d1414]/50 border border-[#ff6b6b]/30 text-[#ff6b6b] flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6 text-[#ff6b6b]" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2.5">
                  {problem.title}
                </h3>
                <p className="text-sm text-[#a0b4c4] leading-relaxed">
                  {problem.desc}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-[#ff6b6b]/80">
                <span>تأثير سلبي تراكمي</span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff6b6b]"></span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
