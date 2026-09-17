import React, { useState, useEffect, useRef } from 'react';
import { STORE_PACKAGES } from '../data/packages';
import { ALGERIA_WILAYAS } from '../data/wilayas';
import { PackageOption, PlacedOrder } from '../types';
import { submitOrder } from '../services/orderService';
import { generatePurchaseEventId, getFbpCookie, getFbcCookie, setAdvancedMatching } from '../utils/pixel';
import {
  trackAddToCartClick,
  trackInitiateCheckoutView,
  trackFormFieldEngagement,
  trackValidationFailed,
} from '../services/analyticsService';
import {
  AlarmClock,
  ShoppingBag,
  User,
  Phone,
  Mail,
  MapPin,
  Home,
  ShieldCheck,
  Lock,
  Headset,
  Sparkles,
  Check,
} from 'lucide-react';

interface OrderSectionProps {
  onOrderSuccess: (order: PlacedOrder) => void;
}

export const OrderSection: React.FC<OrderSectionProps> = ({ onOrderSuccess }) => {
  const [selectedPackage, setSelectedPackage] = useState<PackageOption>(STORE_PACKAGES[0]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [wilayaCode, setWilayaCode] = useState('');
  const [address, setAddress] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry && entry.isIntersecting) {
          trackInitiateCheckoutView();
        }
      },
      { threshold: 0.25 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent any duplicate submission immediately and synchronously
    if (isSubmittingRef.current || isSubmitting) {
      console.warn('[OrderForm] Form submission already in progress, ignoring duplicate click.');
      return;
    }

    // Clean input
    const cleanName = fullName.trim();
    if (cleanName.length < 3) {
      const err = 'يرجى كتابة الاسم واللقب بشكل كامل';
      setPhoneError(err);
      trackValidationFailed('الاسم ناقص أو فارغ');
      return;
    }

    // Validate Algerian phone number (remove spaces, dashes, dots)
    const cleanPhone = phone.replace(/[\s\-\.\(\)]/g, '').trim();
    const algerianPhoneRegex = /^(05|06|07|02)[0-9]{8}$/;
    if (!algerianPhoneRegex.test(cleanPhone)) {
      const err = 'يرجى إدخال رقم هاتف جزائري صحيح مكون من 10 أرقام (مثال: 0550123456 أو 0661123456)';
      setPhoneError(err);
      trackValidationFailed('رقم هاتف جزائري غير صالح');
      return;
    }

    if (!wilayaCode) {
      const err = 'يرجى اختيار الولاية من القائمة';
      setPhoneError(err);
      trackValidationFailed('لم يتم اختيار الولاية');
      return;
    }

    const cleanEmail = email.trim();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      const err = 'يرجى إدخال بريد إلكتروني صحيح أو ترك الحقل فارغاً';
      setPhoneError(err);
      trackValidationFailed('بريد إلكتروني غير صالح');
      return;
    }

    const cleanAddress = address.trim();
    if (cleanAddress.length < 2) {
      const err = 'يرجى تحديد البلدية أو الحي لضمان دقة التوصيل';
      setPhoneError(err);
      trackValidationFailed('البلدية أو العنوان فارغ');
      return;
    }

    setPhoneError('');

    const selectedWilayaObj = ALGERIA_WILAYAS.find((w) => w.code === wilayaCode);
    const wilayaName = selectedWilayaObj ? selectedWilayaObj.nameAr : wilayaCode;

    // Lock submission synchronously
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    // Advanced Matching: attach customer keys so the thank-you Purchase
    // (browser + CAPI) matches at the highest quality
    const nameParts = cleanName.split(/\s+/);
    setAdvancedMatching({
      email: cleanEmail || undefined,
      phone: cleanPhone,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ') || undefined,
    });

    const generatedOrderCode = `TH-${Math.floor(10000 + Math.random() * 90000)}`;
    const eventId = generatePurchaseEventId(generatedOrderCode);
    const fbp = getFbpCookie();
    const fbc = getFbcCookie();

    const placedData: Partial<PlacedOrder> = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderCode: generatedOrderCode,
      customerName: cleanName,
      phone: cleanPhone,
      email: cleanEmail || undefined,
      wilaya: wilayaName,
      commune: cleanAddress,
      packageTitle: selectedPackage.name,
      totalPrice: selectedPackage.price,
      date: new Date().toLocaleDateString('ar-DZ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      status: 'جديد',
      eventId,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
    };

    submitOrder(placedData)
      .then((savedOrder) => {
        // Keep isSubmitting true during navigation to avoid any post-click double submission
        onOrderSuccess(savedOrder);
        // Navigate to secure Thank You page with order_id and token
        const token = savedOrder.fb_token || '';
        const testCode = savedOrder.test_event_code ||
          sessionStorage.getItem('meta_test_event_code') ||
          new URLSearchParams(window.location.search).get('test_event_code') ||
          '';
        const testParam = testCode ? `&test_event_code=${encodeURIComponent(testCode)}` : '';
        const thankYouUrl = `/thank-you?order_id=${encodeURIComponent(savedOrder.orderCode)}&token=${encodeURIComponent(token)}${testParam}`;
        window.location.href = thankYouUrl;
      })
      .catch(() => {
        // Fallback in case of unexpected promise error
        const fallbackOrder = placedData as PlacedOrder;
        onOrderSuccess(fallbackOrder);
        const fallbackToken = fallbackOrder.fb_token || 'th_token';
        const testCode = fallbackOrder.test_event_code ||
          sessionStorage.getItem('meta_test_event_code') ||
          new URLSearchParams(window.location.search).get('test_event_code') ||
          '';
        const testParam = testCode ? `&test_event_code=${encodeURIComponent(testCode)}` : '';
        window.location.href = `/thank-you?order_id=${encodeURIComponent(fallbackOrder.orderCode)}&token=${encodeURIComponent(fallbackToken)}${testParam}`;
      });
  };

  return (
    <section
      id="order-form"
      ref={sectionRef}
      className="py-12 sm:py-24 px-4 sm:px-6 lg:px-12 max-w-5xl mx-auto w-full overflow-hidden relative"
    >
      <div id="order_form" className="absolute -top-24 pointer-events-none" />
      <div className="bg-[#141c2e]/80 backdrop-blur-2xl border-2 border-[#7dd3fc]/30 rounded-3xl p-4 sm:p-10 lg:p-12 shadow-[0_0_60px_rgba(125,211,252,0.15)] relative overflow-hidden">
        {/* Accent Glow Corner */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-[#7dd3fc]/20 rounded-full blur-3xl pointer-events-none max-w-full"></div>
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-[#c8a0f0]/15 rounded-full blur-3xl pointer-events-none max-w-full"></div>

        {/* Section Header */}
        <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#3d1414]/70 border border-[#ff6b6b]/40 text-[#ff6b6b] text-xs font-black animate-pulse">
            <AlarmClock className="w-4 h-4" />
            <span>باقي 14 قطعة فقط بهذا السعر الترويجي</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-headline font-black text-white">
            استفد من العرض الحصري الآن
          </h2>
          <p className="text-sm sm:text-base text-[#a0b4c4]">
            املأ الاستمارة أدناه وسنتصل بك هاتفياً لتأكيد العنوان وشحن طلبك فوراً
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8 text-right">
          {/* Package Selector */}
          <div className="space-y-3">
            <label className="block text-xs sm:text-sm font-bold text-white">
              اختر باقتك المفضلة:
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {STORE_PACKAGES.map((pkg) => {
                const isSelected = selectedPackage.id === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    id={`package-option-${pkg.id}`}
                    onClick={() => {
                      setSelectedPackage(pkg);
                      trackAddToCartClick(`اختيار باقة: ${pkg.name}`);
                    }}
                    className={`relative p-3.5 sm:p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#7dd3fc] bg-[#0e4d6e]/25 shadow-[0_0_25px_rgba(125,211,252,0.2)]'
                        : 'border-[#2a3a48]/50 bg-[#1a2438]/60 hover:border-[#7dd3fc]/40'
                    }`}
                  >
                    {pkg.discountBadge && (
                      <div className="absolute -top-3 left-4 bg-[#c8a0f0] text-[#1a002e] text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-md">
                        {pkg.discountBadge}
                      </div>
                    )}

                    <div className="flex items-start gap-2.5 sm:gap-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          isSelected
                            ? 'border-[#7dd3fc] bg-[#7dd3fc] text-[#001f2e]'
                            : 'border-white/30'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <div>
                        <span className="block text-sm sm:text-base font-bold text-white">
                          {pkg.name}
                        </span>
                        <span className="block text-xs text-[#a0b4c4] mt-0.5">
                          {pkg.subtitle}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-white/5 flex items-baseline justify-between">
                      <div className="text-right">
                        <span className="block text-lg sm:text-xl font-black text-[#7dd3fc]">
                          {pkg.price.toLocaleString('ar-DZ')} دج
                        </span>
                        <span className="block text-[10px] sm:text-[11px] text-[#a0b4c4] line-through">
                          {pkg.originalPrice.toLocaleString('ar-DZ')} دج
                        </span>
                      </div>
                      <span className="text-[10px] text-[#7dd3fc] bg-[#7dd3fc]/10 px-2 py-0.5 rounded">
                        توصيل مجاني
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Customer Data Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label htmlFor="fullname" className="text-xs sm:text-sm font-bold text-white">
                الاسم واللقب بالكامل *
              </label>
              <div className="relative">
                <User className="absolute right-3.5 top-3.5 text-[#a0b4c4] w-5 h-5 pointer-events-none" />
                <input
                  id="fullname"
                  type="text"
                  required
                  value={fullName}
                  onFocus={() => trackFormFieldEngagement('fullname')}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    trackFormFieldEngagement('fullname');
                  }}
                  placeholder="مثال: كريم بن عيسى"
                  className="w-full pr-11 pl-4 py-3 sm:py-3.5 rounded-xl bg-[#0a0e1a]/85 border border-[#2a3a48] focus:border-[#7dd3fc] focus:ring-1 focus:ring-[#7dd3fc] text-white placeholder-[#a0b4c4]/50 text-sm outline-none transition-all box-border"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-xs sm:text-sm font-bold text-white">
                رقم الهاتف (ضروري لتأكيد الشحن) *
              </label>
              <div className="relative">
                <Phone className="absolute right-3.5 top-3.5 text-[#a0b4c4] w-5 h-5 pointer-events-none" />
                <input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onFocus={() => trackFormFieldEngagement('phone')}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    trackFormFieldEngagement('phone');
                    if (phoneError) setPhoneError('');
                  }}
                  placeholder="06 / 07 / 05 XX XX XX XX"
                  className="w-full pr-11 pl-4 py-3 sm:py-3.5 rounded-xl bg-[#0a0e1a]/85 border border-[#2a3a48] focus:border-[#7dd3fc] focus:ring-1 focus:ring-[#7dd3fc] text-white placeholder-[#a0b4c4]/50 text-sm outline-none transition-all dir-ltr text-right box-border"
                />
              </div>
              {phoneError && (
                <p className="text-xs text-[#ff6b6b] mt-1">{phoneError}</p>
              )}
            </div>

            {/* Email (optional - improves ad matching) */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs sm:text-sm font-bold text-white">
                البريد الإلكتروني (اختياري)
              </label>
              <div className="relative">
                <Mail className="absolute right-3.5 top-3.5 text-[#a0b4c4] w-5 h-5 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onFocus={() => trackFormFieldEngagement('phone')}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (phoneError) setPhoneError('');
                  }}
                  placeholder="example@mail.com"
                  className="w-full pr-11 pl-4 py-3 sm:py-3.5 rounded-xl bg-[#0a0e1a]/85 border border-[#2a3a48] focus:border-[#7dd3fc] focus:ring-1 focus:ring-[#7dd3fc] text-white placeholder-[#a0b4c4]/50 text-sm outline-none transition-all dir-ltr text-right box-border"
                />
              </div>
            </div>

            {/* Wilaya Selection */}
            <div className="space-y-1.5">
              <label htmlFor="wilaya" className="text-xs sm:text-sm font-bold text-white">
                الولاية (58 ولاية) *
              </label>
              <div className="relative">
                <MapPin className="absolute right-3.5 top-3.5 text-[#a0b4c4] w-5 h-5 pointer-events-none" />
                <select
                  id="wilaya"
                  required
                  value={wilayaCode}
                  onFocus={() => trackFormFieldEngagement('wilaya')}
                  onChange={(e) => {
                    setWilayaCode(e.target.value);
                    trackFormFieldEngagement('wilaya');
                  }}
                  className="w-full pr-11 pl-4 py-3 sm:py-3.5 rounded-xl bg-[#0a0e1a]/85 border border-[#2a3a48] focus:border-[#7dd3fc] focus:ring-1 focus:ring-[#7dd3fc] text-white text-sm outline-none transition-all cursor-pointer appearance-none box-border"
                >
                  <option value="" disabled className="bg-[#0f1524]">
                    اختر ولايتك من القائمة...
                  </option>
                  {ALGERIA_WILAYAS.map((w) => (
                    <option key={w.code} value={w.code} className="bg-[#0f1524]">
                      {w.code}. {w.nameAr} ({w.nameFr})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Commune / Address */}
            <div className="space-y-1.5">
              <label htmlFor="address" className="text-xs sm:text-sm font-bold text-white">
                البلدية أو العنوان التقريبي *
              </label>
              <div className="relative">
                <Home className="absolute right-3.5 top-3.5 text-[#a0b4c4] w-5 h-5 pointer-events-none" />
                <input
                  id="address"
                  type="text"
                  required
                  value={address}
                  onFocus={() => trackFormFieldEngagement('address')}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    trackFormFieldEngagement('address');
                  }}
                  placeholder="مثال: بلدية درارية، قرب المسجد أو المدرسة"
                  className="w-full pr-11 pl-4 py-3 sm:py-3.5 rounded-xl bg-[#0a0e1a]/85 border border-[#2a3a48] focus:border-[#7dd3fc] focus:ring-1 focus:ring-[#7dd3fc] text-white placeholder-[#a0b4c4]/50 text-sm outline-none transition-all box-border"
                />
              </div>
            </div>
          </div>

          {/* Live Price Summary Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0a0e1a]/70 border border-[#7dd3fc]/20 space-y-2.5 text-xs sm:text-sm shadow-inner">
            <div className="flex justify-between items-center text-[#a0b4c4]">
              <span>الباقة المختارة:</span>
              <span className="font-bold text-white">{selectedPackage.name}</span>
            </div>
            <div className="flex justify-between items-center text-[#a0b4c4]">
              <span>تكلفة التوصيل (جميع الولايات الـ 58):</span>
              <span className="font-bold text-[#7dd3fc]">0 دج (مجاني تماماً 🚚)</span>
            </div>
            <div className="flex justify-between items-center text-[#a0b4c4]">
              <span>طريقة الدفع:</span>
              <span className="font-bold text-white">الدفع نقداً بعد المعاينة عند الاستلام</span>
            </div>
            <div className="pt-3 border-t border-[#2a3a48] flex justify-between items-center text-sm sm:text-lg font-black text-white">
              <span>المجموع الواجب دفعه عند الاستلام:</span>
              <span className="text-[#7dd3fc] text-xl sm:text-2xl">
                {selectedPackage.price.toLocaleString('ar-DZ')} دج
              </span>
            </div>
          </div>

          {/* Radiant Submit Button */}
          <button
            id="submit-order-button"
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 sm:py-5 px-4 rounded-2xl sm:rounded-full bg-[#7dd3fc] hover:bg-[#c8eaff] text-[#001f2e] font-headline font-black text-sm sm:text-xl tracking-wide shadow-[0_0_40px_rgba(125,211,252,0.4)] hover:shadow-[0_0_60px_rgba(125,211,252,0.6)] active:scale-[0.99] transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 disabled:opacity-75 cursor-pointer text-center"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Sparkles className="w-5 h-5 animate-spin text-[#001f2e]" />
                جاري إرسال طلبكم وتثبيته...
              </span>
            ) : (
              <>
                <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                <span className="text-xs sm:text-lg lg:text-xl leading-snug">تأكيد الطلب الآن - الدفع بعد المعاينة عند الاستلام</span>
              </>
            )}
          </button>

          {/* Security and Guarantee Footnotes */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-[11px] sm:text-xs text-[#a0b4c4] pt-1 sm:pt-2">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <ShieldCheck className="text-[#7dd3fc] w-4 h-4 shrink-0" />
              <span>ضمان أصالة 100%</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Lock className="text-[#7dd3fc] w-4 h-4 shrink-0" />
              <span>بياناتكم سرية ومحمية</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Headset className="text-[#7dd3fc] w-4 h-4 shrink-0" />
              <span>متابعة وخدمة عملاء 7/7</span>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
};
