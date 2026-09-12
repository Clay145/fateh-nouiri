import React, { useState, useEffect } from 'react';
import { Truck, Clock, Sparkles } from 'lucide-react';

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
    <div id="top-announcement" className="bg-[#0e4d6e]/90 backdrop-blur-md text-[#c8eaff] py-2 border-b border-[#7dd3fc]/20 text-xs sm:text-sm font-medium shadow-[0_1px_8px_rgba(0,0,0,0.15)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 mx-auto sm:mx-0">
          <Sparkles className="w-4 h-4 text-[#7dd3fc] animate-pulse" />
          <span>✨ عرض خاص لفترة محدودة: توصيل مجاني لـ 58 ولاية + الدفع عند الاستلام</span>
          <Truck className="w-4 h-4 text-[#7dd3fc] hidden sm:inline" />
        </div>

        <div className="hidden md:flex items-center gap-2 text-[11px] bg-[#0a1e2f]/80 px-3 py-0.5 rounded-full border border-[#7dd3fc]/30">
          <Clock className="w-3.5 h-3.5 text-[#7dd3fc]" />
          <span>ينتهي العرض خلال:</span>
          <span className="font-mono font-bold text-[#7dd3fc] dir-ltr">
            {format(timeLeft.hours)}:{format(timeLeft.minutes)}:{format(timeLeft.seconds)}
          </span>
        </div>
      </div>
    </div>
  );
};
