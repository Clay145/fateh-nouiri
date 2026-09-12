import React, { useState } from 'react';
import { THERAPEUTIC_FEATURES } from '../data/features';
import {
  Sparkles,
  Flame,
  Wind,
  Activity,
  Headphones,
  FoldHorizontal,
  Play,
  CheckCircle2,
} from 'lucide-react';

interface FeaturesSectionProps {
  onOpenSoundPreview: () => void;
}

export const FeaturesSection: React.FC<FeaturesSectionProps> = ({ onOpenSoundPreview }) => {
  const [activeFeatureIdx, setActiveFeatureIdx] = useState<number>(0);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'hot_tub':
        return <Flame className="w-7 h-7 text-[#7dd3fc]" />;
      case 'air':
        return <Wind className="w-7 h-7 text-[#7dd3fc]" />;
      case 'vibration':
        return <Activity className="w-7 h-7 text-[#7dd3fc]" />;
      case 'headphones':
        return <Headphones className="w-7 h-7 text-[#c8a0f0]" />;
      case 'folder_zip':
        return <FoldHorizontal className="w-7 h-7 text-[#7dd3fc]" />;
      default:
        return <Sparkles className="w-7 h-7 text-[#7dd3fc]" />;
    }
  };

  return (
    <section id="features" className="py-12 sm:py-24 px-4 sm:px-6 lg:px-12 max-w-7xl mx-auto w-full overflow-hidden">
      {/* Heading */}
      <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14 space-y-3">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7dd3fc] uppercase tracking-wider bg-[#0e4d6e]/40 px-4 py-1 rounded-full border border-[#7dd3fc]/30">
          <Sparkles className="w-3.5 h-3.5" />
          <span>هندسة الرفاهية والراحة</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-headline font-black text-white">
          5 تقنيات علاجية مدمجة في جهاز واحد
        </h2>
        <p className="text-sm sm:text-base text-[#a0b4c4]">
          تمت محاكاة حركات أيادي أمهر اختصاصيي المساج بالاعتماد على ذكاء إلكتروني متطور
        </p>
      </div>

      {/* Grid of 5 Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
        {THERAPEUTIC_FEATURES.map((feature, idx) => {
          const isSelected = activeFeatureIdx === idx;
          const isTertiary = feature.tagColor === 'tertiary';

          return (
            <div
              key={feature.number}
              id={`feature-card-${feature.number}`}
              onClick={() => {
                setActiveFeatureIdx(idx);
                if (feature.icon === 'headphones') {
                  onOpenSoundPreview();
                }
              }}
              className={`bg-[#141c2e]/60 backdrop-blur-xl border rounded-2xl p-5 sm:p-7 relative group cursor-pointer transition-all duration-300 text-right flex flex-col justify-between ${
                feature.colSpan ? feature.colSpan : ''
              } ${
                isSelected
                  ? isTertiary
                    ? 'border-[#c8a0f0] bg-[#1a2438]/90 shadow-[0_0_25px_rgba(200,160,240,0.2)]'
                    : 'border-[#7dd3fc] bg-[#1a2438]/90 shadow-[0_0_25px_rgba(125,211,252,0.2)]'
                  : 'border-[#7dd3fc]/20 hover:border-[#7dd3fc]/50 hover:bg-[#141c2e]/80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div
                    className={`w-14 h-14 rounded-2xl border flex items-center justify-center transition-transform group-hover:scale-105 ${
                      isTertiary
                        ? 'bg-[#3d2060]/40 border-[#c8a0f0]/30'
                        : 'bg-[#7dd3fc]/10 border-[#7dd3fc]/20'
                    }`}
                  >
                    {getIcon(feature.icon)}
                  </div>
                  <span
                    className={`text-xs font-black tracking-wider px-2.5 py-1 rounded-full border ${
                      isTertiary
                        ? 'text-[#c8a0f0] bg-[#3d2060]/50 border-[#c8a0f0]/30'
                        : 'text-[#7dd3fc] bg-[#0e4d6e]/40 border-[#7dd3fc]/30'
                    }`}
                  >
                    {feature.number}. {feature.title}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-2.5">
                  {feature.headline}
                </h3>

                <p className="text-sm text-[#a0b4c4] leading-relaxed">
                  {feature.description}
                </p>
              </div>

              {/* Bottom interactive action button */}
              <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                <span
                  className={`font-semibold flex items-center gap-1.5 ${
                    isTertiary ? 'text-[#c8a0f0]' : 'text-[#7dd3fc]'
                  }`}
                >
                  {feature.icon === 'headphones' ? (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      تجربة الصوت الآن
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {feature.modeName || 'مفعّل تلقائياً'}
                    </>
                  )}
                </span>
                <span className="text-[11px] text-[#a0b4c4]">اضغط للتفاصيل</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
