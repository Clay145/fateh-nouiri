import React, { useState, useEffect } from 'react';

export const TopBanner: React.FC = () => {
  const [timeLeft, setTimeLeft] = useState({ hours: 4, minutes: 27, seconds: 43 });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: 59, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return { hours: 3, minutes: 59, seconds: 59 };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const format = (n: number) => n.toString().padStart(2, '0');

  return (
    <div id="top-announcement" className="w-full bg-[#0f1524]/85 backdrop-blur-xl border-b border-[#7dd3fc]/20 overflow-hidden">
      <div className="bg-[#0e4d6e]/80 text-[#c8eaff] py-1.5 px-4 text-center text-xs font-semibold tracking-wide flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#7dd3fc] animate-ping shrink-0"></span>
        <span className="leading-tight">🚀 عرض حصري لفترة محدودة: التوصيل مجاني 100% لباب منزلك لكافة الـ 58 ولاية + افحص جهازك وجربه قبل أن تدفع ديناراً واحداً! 🇩🇿</span>
        <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] bg-[#0a1e2f]/80 px-2.5 py-0.5 rounded-full border border-[#7dd3fc]/30 shrink-0 font-mono font-bold text-[#7dd3fc] dir-ltr">
          {format(timeLeft.hours)}:{format(timeLeft.minutes)}:{format(timeLeft.seconds)}
        </span>
      </div>
    </div>
  );
};
