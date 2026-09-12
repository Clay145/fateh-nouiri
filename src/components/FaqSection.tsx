import React, { useState } from 'react';
import { FAQ_DATA } from '../data/faqs';
import { HelpCircle, ChevronDown } from 'lucide-react';

export const FaqSection: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-12 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-12 space-y-3">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7dd3fc] uppercase tracking-wider bg-[#0e4d6e]/40 px-4 py-1 rounded-full border border-[#7dd3fc]/30">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>إجابات واضحة وشفافة</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-headline font-black text-white">
          الأسئلة الشائعة حول الجهاز
        </h2>
        <p className="text-sm sm:text-base text-[#a0b4c4]">
          كل ما تحتاج معرفته قبل إتمام طلبك
        </p>
      </div>

      {/* Accordions */}
      <div className="space-y-4">
        {FAQ_DATA.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              id={`faq-item-${idx}`}
              className={`bg-[#141c2e]/60 backdrop-blur-xl border rounded-2xl p-5 sm:p-6 transition-all duration-300 text-right cursor-pointer ${
                isOpen
                  ? 'border-[#7dd3fc]/50 bg-[#141c2e]/85 shadow-[0_0_20px_rgba(125,211,252,0.1)]'
                  : 'border-[#2a3a48]/40 hover:border-[#7dd3fc]/30'
              }`}
              onClick={() => toggle(idx)}
            >
              <div className="flex items-center justify-between font-bold text-base sm:text-lg text-white">
                <span className="flex-1 pl-4 leading-snug">{faq.question}</span>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border transition-transform duration-300 ${
                    isOpen
                      ? 'rotate-180 bg-[#7dd3fc]/20 border-[#7dd3fc] text-[#7dd3fc]'
                      : 'bg-[#1a2438] border-white/10 text-[#a0b4c4]'
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {isOpen && (
                <div className="pt-3.5 mt-3 border-t border-white/5 text-sm sm:text-base text-[#a0b4c4] leading-relaxed animate-fadeIn">
                  {faq.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
