import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQ_DATA } from '../data/faqs';

export const FaqSection: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section className="py-10 px-4 sm:px-8 max-w-4xl mx-auto" id="faq">
      <div className="text-center mb-6">
        <h2 className="text-xl sm:text-2xl font-headline font-bold text-white">إجابات سريعة وشفافة</h2>
      </div>
      <div className="space-y-3 text-right">
        {FAQ_DATA.map((faq, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              id={`faq-item-${idx}`}
              onClick={() => toggle(idx)}
              className={`bg-[#141c2e]/60 border rounded-xl p-4 cursor-pointer transition-all ${
                isOpen ? 'border-[#7dd3fc]/40' : 'border-[#2a3a48]/30'
              }`}
            >
              <div className="font-bold text-xs sm:text-sm text-white flex items-center justify-between gap-3">
                <span>{faq.question}</span>
                <ChevronDown
                  size={16}
                  className={`text-[#7dd3fc] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
              {isOpen && (
                <p className="text-xs text-[#a0b4c4] mt-2 leading-relaxed">{faq.answer}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
