import React, { useState, useEffect, useCallback } from 'react';
import { Truck, ShieldCheck, CircleCheck, ArrowDown } from 'lucide-react';
import { trackAddToCartClick } from '../services/analyticsService';

function formatDz(n: number): string {
  try {
    return `${n.toLocaleString('ar-DZ')} دج`;
  } catch {
    return `${n} دج`;
  }
}

function readPackagePrice(): { price: number; name: string } {
  try {
    const w = window as unknown as { __theoriaPackage?: { price: number; name: string } };
    if (w.__theoriaPackage && typeof w.__theoriaPackage.price === 'number') {
      return w.__theoriaPackage;
    }
  } catch {
    // ignore
  }
  return { price: 9500, name: 'جهاز واحد' };
}

function readFormValidity(): boolean {
  try {
    const name = (document.getElementById('fullname') as HTMLInputElement | null)?.value.trim() || '';
    const phone = (document.getElementById('phone') as HTMLInputElement | null)?.value.trim() || '';
    const wilaya = (document.getElementById('wilaya') as HTMLSelectElement | null)?.value || '';
    const address = (document.getElementById('address') as HTMLInputElement | null)?.value.trim() || '';
    return (
      name.length >= 3 &&
      phone.replace(/[\s\-\.\(\)]/g, '').length >= 9 &&
      wilaya !== '' &&
      address.length >= 2
    );
  } catch {
    return false;
  }
}

export const FloatingMobileBar: React.FC = () => {
  const [pkg, setPkg] = useState(readPackagePrice);
  const [isValid, setIsValid] = useState(false);
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    const onPkg = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.price === 'number') {
        setPkg({ price: detail.price, name: detail.name || 'جهاز واحد' });
      } else {
        setPkg(readPackagePrice());
      }
    };
    window.addEventListener('theoria:package-change', onPkg as EventListener);

    // Poll form validity + package (inputs are uncontrolled from this component's view)
    const timer = window.setInterval(() => {
      setIsValid(readFormValidity());
      setPkg((prev) => {
        const cur = readPackagePrice();
        return cur.price === prev.price && cur.name === prev.name ? prev : cur;
      });
    }, 500);

    // Hide the dock while the order form itself is on screen so the dock
    // never covers the form's own submit button (presentation only).
    let observer: IntersectionObserver | null = null;
    try {
      const formSection = document.getElementById('order-form');
      if (formSection && typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(
          (entries) => setFormVisible(entries.some((en) => en.isIntersecting)),
          { threshold: 0.08 }
        );
        observer.observe(formSection);
      }
    } catch {
      // observer unavailable: dock stays visible
    }

    return () => {
      window.removeEventListener('theoria:package-change', onPkg as EventListener);
      window.clearInterval(timer);
      try {
        observer?.disconnect();
      } catch {
        // ignore
      }
    };
  }, []);

  const scrollToFirstIncomplete = useCallback(() => {
    try {
      const name = (document.getElementById('fullname') as HTMLInputElement | null);
      const phone = (document.getElementById('phone') as HTMLInputElement | null);
      const wilaya = (document.getElementById('wilaya') as HTMLSelectElement | null);
      const address = (document.getElementById('address') as HTMLInputElement | null);
      let target: HTMLElement | null = null;
      if (!name || name.value.trim().length < 3) target = name;
      else if (!phone || phone.value.trim().length < 9) target = phone;
      else if (!wilaya || wilaya.value === '') target = wilaya;
      else if (!address || address.value.trim().length < 2) target = address;
      else target = document.getElementById('order-form');

      if (target && target.id !== 'order-form') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => target!.focus(), 400);
      } else {
        document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch {
      document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleDockAction = () => {
    if (readFormValidity()) {
      // Real submit through the React order form (full validation +
      // submitOrder + Meta wiring inside OrderSection.handleSubmit).
      const form = document.getElementById('checkout-form') as HTMLFormElement | null;
      if (form) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
        return;
      }
      document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      trackAddToCartClick('الشريط السفلي الذكي - أدخل معلومات التوصيل');
      scrollToFirstIncomplete();
    }
  };

  return (
    <div
      id="sticky-checkout-dock"
      aria-hidden={formVisible}
      className={`fixed bottom-0 left-0 right-0 z-50 p-2 sm:p-3 bg-[#1a2438]/95 backdrop-blur-2xl border-t-2 border-[#7dd3fc]/40 shadow-[0_-10px_35px_rgba(0,0,0,0.6)] transition-transform duration-300 ${formVisible ? 'translate-y-full pointer-events-none' : 'translate-y-0'}`}
    >
      <div className="max-w-4xl mx-auto flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs px-1">
          <div className="flex items-center gap-2">
            <span className="text-[#a0b4c4] font-medium">المبلغ الإجمالي:</span>
            <span className="font-black text-[#7dd3fc] text-sm sm:text-base" id="dock-total-price">
              {formatDz(pkg.price)}
            </span>
            <span className="text-[11px] text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Truck size={13} /> توصيل مجاني (0 دج)
            </span>
          </div>
          <div className="text-[11px] text-[#88b4cc] hidden sm:flex items-center gap-1 font-semibold">
            <ShieldCheck size={14} />
            <span>الدفع عند الاستلام بعد الفحص</span>
          </div>
        </div>
        <div className="w-full">
          <button
            id="dock-action-btn"
            onClick={handleDockAction}
            type="button"
            className={
              isValid
                ? 'w-full py-3.5 px-4 rounded-xl sm:rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-headline font-black text-xs sm:text-sm tracking-wide animate-pulse-glow transition-all flex items-center justify-center gap-2 active:scale-[0.98]'
                : 'w-full py-3.5 px-4 rounded-xl sm:rounded-full bg-[#7dd3fc] hover:bg-[#c8eaff] text-[#001f2e] font-headline font-black text-xs sm:text-sm tracking-wide shadow-[0_0_25px_rgba(125,211,252,0.35)] transition-all flex items-center justify-center gap-2 active:scale-[0.98]'
            }
          >
            {isValid ? (
              <CircleCheck size={18} id="dock-action-icon" />
            ) : (
              <ArrowDown size={18} id="dock-action-icon" />
            )}
            <span id="dock-action-text">
              {isValid ? '🚀 إتمام وتأكيد الطلب الآن بنقرة واحدة (جاهز للإرسال)' : 'أدخل معلومات التوصيل لطلب جهازك ⬇️'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
