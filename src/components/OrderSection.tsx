import React, { useState, useRef, useEffect } from 'react';
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
  savePartialIdentity,
} from '../services/analyticsService';

interface OrderSectionProps {
  onOrderSuccess: (order: PlacedOrder) => void;
}

export const OrderSection: React.FC<OrderSectionProps> = ({ onOrderSuccess }) => {
  const [selectedPackage, setSelectedPackage] = useState<PackageOption>(STORE_PACKAGES[0]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [wilayaCode, setWilayaCode] = useState('');
  const [address, setAddress] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullname?: string; phone?: string; wilaya?: string; address?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  // Idempotency key for this form attempt: reused across retries/double-clicks
  // so a retry never mints a second orderCode (server dedups by orderCode).
  const attemptKeysRef = useRef<{ orderCode: string; id: string } | null>(null);
  // Early-matching debounce: re-attaching fbq init on every keystroke is
  // wasteful; attach at most once per value change (blur-driven).
  const earlyMatchSigRef = useRef<string>('');

  /**
   * Early Advanced Matching (P1): attach phone/name to the browser pixel as
   * soon as the shopper finishes each field (blur), so AddToCart /
   * InitiateCheckout / Lead events that fire after that point match instead
   * of arriving anonymous. Only valid values are sent; submit re-attaches
   * with the final cleaned values. Also caches partial identity for the
   * server CAPI Lead/IC leg (hashed server-side).
   */
  const attachEarlyMatching = (overrides?: { name?: string; phone?: string; wilayaName?: string; commune?: string }) => {
    try {
      const name = (overrides?.name ?? fullName).trim();
      const phoneVal = (overrides?.phone ?? phone).replace(/[\s\-\.\(\)]/g, '').trim();
      const validPhone = /^(05|06|07|02)[0-9]{8}$/.test(phoneVal) ? phoneVal : '';
      const validName = name.length >= 3 ? name : '';
      if (!validPhone && !validName) return;
      const sig = `${validName}|${validPhone}`;
      if (earlyMatchSigRef.current === sig) return;
      earlyMatchSigRef.current = sig;
      const parts = validName ? validName.split(/\s+/) : [];
      setAdvancedMatching({
        phone: validPhone || undefined,
        firstName: parts[0] || undefined,
        lastName: parts.slice(1).join(' ') || undefined,
      });
      savePartialIdentity({
        customerName: validName || undefined,
        phone: validPhone || undefined,
        wilaya: overrides?.wilayaName,
        commune: overrides?.commune,
      });
    } catch {
      // tracking must never break the form
    }
  };

  // Broadcast selected package so the sticky dock can sync its total
  // without lifting state (presentation-only bridge, no backend change).
  useEffect(() => {
    try {
      (window as unknown as { __theoriaPackage?: { price: number; name: string } }).__theoriaPackage = {
        price: selectedPackage.price,
        name: selectedPackage.name,
      };
      window.dispatchEvent(
        new CustomEvent('theoria:package-change', {
          detail: { price: selectedPackage.price, name: selectedPackage.name },
        })
      );
    } catch {
      // ignore
    }
  }, [selectedPackage]);

  const focusField = (id: string) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLElement).focus({ preventScroll: true });
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent any duplicate submission immediately and synchronously
    if (isSubmittingRef.current || isSubmitting) {
      console.warn('[OrderForm] Form submission already in progress, ignoring duplicate click.');
      return;
    }

    // Clean input — per-field errors so each message appears under its own field
    const cleanName = fullName.trim();
    if (cleanName.length < 3) {
      const err = 'يرجى كتابة الاسم واللقب بشكل كامل';
      setFieldErrors({ fullname: err });
      trackValidationFailed('الاسم ناقص أو فارغ');
      focusField('fullname');
      return;
    }

    // Validate Algerian phone number (remove spaces, dashes, dots)
    const cleanPhone = phone.replace(/[\s\-\.\(\)]/g, '').trim();
    const algerianPhoneRegex = /^(05|06|07|02)[0-9]{8}$/;
    if (!algerianPhoneRegex.test(cleanPhone)) {
      const err = 'يرجى إدخال رقم هاتف جزائري صحيح مكون من 10 أرقام (مثال: 0550123456 أو 0661123456)';
      setFieldErrors({ phone: err });
      trackValidationFailed('رقم هاتف جزائري غير صالح');
      focusField('phone');
      return;
    }

    if (!wilayaCode) {
      const err = 'يرجى اختيار الولاية من القائمة';
      setFieldErrors({ wilaya: err });
      trackValidationFailed('لم يتم اختيار الولاية');
      focusField('wilaya');
      return;
    }

    const cleanAddress = address.trim();
    if (cleanAddress.length < 2) {
      const err = 'يرجى تحديد البلدية أو الحي لضمان دقة التوصيل';
      setFieldErrors({ address: err });
      trackValidationFailed('البلدية أو العنوان فارغ');
      focusField('address');
      return;
    }

    setFieldErrors({});
    setSubmitError(null);

    const selectedWilayaObj = ALGERIA_WILAYAS.find((w) => w.code === wilayaCode);
    const wilayaName = selectedWilayaObj ? selectedWilayaObj.nameAr : wilayaCode;

    // Lock submission synchronously
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    // Reuse idempotency keys across retries of the same form attempt.
    if (!attemptKeysRef.current) {
      attemptKeysRef.current = {
        orderCode: `TH-${Math.floor(10000 + Math.random() * 90000)}`,
        id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      };
    }
    const generatedOrderCode = attemptKeysRef.current.orderCode;
    const generatedId = attemptKeysRef.current.id;
    const eventId = generatePurchaseEventId(generatedOrderCode);
    const fbp = getFbpCookie();
    const fbc = getFbcCookie();

    // Advanced Matching: attach customer keys so the thank-you Purchase
    // (browser + CAPI) matches at the highest quality. external_id mirrors
    // the server CAPI external_id (the order code).
    const nameParts = cleanName.split(/\s+/);
    setAdvancedMatching({
      phone: cleanPhone,
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' ') || undefined,
      externalId: generatedOrderCode,
    });

    const placedData: Partial<PlacedOrder> = {
      id: generatedId,
      orderCode: generatedOrderCode,
      customerName: cleanName,
      phone: cleanPhone,
      wilaya: wilayaName,
      commune: cleanAddress,
      packageTitle: selectedPackage.name,
      totalPrice: selectedPackage.price,
      contentId: selectedPackage.contentId,
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
        // Zero-loss gate: navigate ONLY when the cloud confirmed the order.
        // Otherwise stay on the form with an error — the order sits in the
        // local outbox and auto-retries (no silent thank-you on failure).
        if (!savedOrder.serverConfirmed) {
          setSubmitError(
            savedOrder.syncError
              ? `تعذر إرسال الطلب إلى السحابة (${savedOrder.syncError}). تم حفظه محلياً وستتم إعادة المحاولة تلقائياً — لا تغلق الصفحة، أو أعد المحاولة.`
              : 'تعذر إرسال الطلب إلى السحابة. تم حفظه محلياً وستتم إعادة المحاولة تلقائياً — لا تغلق الصفحة، أو أعد المحاولة.'
          );
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          return;
        }
        // Fresh keys for the next distinct order.
        attemptKeysRef.current = null;
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
      .catch((err) => {
        // Unexpected failure — stay on the form, keep keys for retry.
        setSubmitError(
          err instanceof Error && err.message
            ? `تعذر إرسال الطلب (${err.message}). تم حفظه محلياً — أعد المحاولة دون تغيير البيانات.`
            : 'تعذر إرسال الطلب. تم حفظه محلياً — أعد المحاولة دون تغيير البيانات.'
        );
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      });
  };

  return (
    <section
      id="order-form"
      className="py-12 px-4 sm:px-8 max-w-4xl mx-auto w-full overflow-hidden relative"
    >
      <div id="order_form" className="absolute -top-24 pointer-events-none" />
      <div className="bg-[#141c2e]/70 backdrop-blur-2xl border-2 border-[#7dd3fc]/30 rounded-3xl p-5 sm:p-10 shadow-[0_0_50px_rgba(125,211,252,0.15)] relative overflow-hidden">
        {/* Section Header */}
        <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3d1414]/60 border border-[#ff6b6b]/30 text-[#ff6b6b] text-xs font-bold">
            <span className="material-symbols-outlined text-sm">alarm</span>
            <span>الدفعة الحالية: بقي 11 قطعة فقط بهذا السعر المخفض</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-headline font-black text-white">
            استفد من التوصيل المجاني واطلب جهازك الآن
          </h2>
          <p className="text-xs sm:text-sm text-[#a0b4c4]">
            املأ بياناتك أدناه وسيتصل بك فريقنا لتأكيد العنوان وشحن الطرد فوراً
          </p>
        </div>

        <form id="checkout-form" onSubmit={handleSubmit} className="space-y-6 text-right">
          {/* Gift banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-l from-[#7dd3fc]/20 via-[#1a2438] to-[#7dd3fc]/10 border-2 border-[#7dd3fc]/40 shadow-[0_0_25px_rgba(125,211,252,0.2)] flex items-center gap-3 text-right">
            <div className="w-10 h-10 rounded-xl bg-[#7dd3fc] text-[#001f2e] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">redeem</span>
            </div>
            <div>
              <p className="text-xs sm:text-sm font-black text-[#7dd3fc]">🎁 هدية خاصة لطلبك اليوم: التوصيل مجاني 100% (0 دج) على حسابنا لباب بيتك</p>
              <p className="text-[11px] text-[#a0b4c4] mt-0.5">شامل كافة الـ 58 ولاية جزائرية مع حق فتح الكرتونة وتشغيل الجهاز قبل دفع دينار واحد للموزع!</p>
            </div>
          </div>

          {/* Package Selector — data-driven from STORE_PACKAGES, new card skin */}
          <div className="space-y-2 text-right">
            <label className="block text-xs font-bold text-white">اختر العرض المناسب لك:</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {STORE_PACKAGES.map((pkg) => {
                const isSelected = selectedPackage.id === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    id={`package-option-${pkg.id}`}
                    onClick={() => {
                      setSelectedPackage(pkg);
                      // Intent signal: selecting a package inside the form = real checkout intent
                      // Pass real package economics so pixel/CAPI carry true quantity/value.
                      const discount = Math.max(0, (pkg.originalPrice || 0) - (pkg.price || 0));
                      trackInitiateCheckoutView(pkg.price, [pkg.contentId], {
                        packageId: pkg.id,
                        packageName: pkg.name,
                        units: pkg.units,
                        discountValue: discount,
                      });
                      trackAddToCartClick(`اختيار باقة: ${pkg.name}`, pkg.price, [pkg.contentId], {
                        packageId: pkg.id,
                        units: pkg.units,
                        discountValue: discount,
                        ctaLabel: `package_select:${pkg.id}`,
                      });
                    }}
                    className={`relative flex items-center justify-between p-3.5 rounded-xl bg-[#1a2438]/80 border-2 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#7dd3fc] bg-[#0e4d6e]/25 shadow-[0_0_25px_rgba(125,211,252,0.2)]'
                        : 'border-[#4a6070]/30 hover:border-[#7dd3fc]/60'
                    }`}
                  >
                    {pkg.discountBadge && (
                      <div className="absolute -top-2.5 left-4 bg-[#c8a0f0] text-[#1a002e] text-[9px] font-black px-2 py-0.5 rounded-full shadow">
                        {pkg.discountBadge}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'border-[#7dd3fc] bg-[#7dd3fc]' : 'border-white/30'
                        }`}
                      >
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#001f2e]"></span>}
                      </div>
                      <div>
                        <span className="block text-xs sm:text-sm font-bold text-white">{pkg.name}</span>
                        <span className="block text-[11px] text-[#a0b4c4] mt-0.5">{pkg.subtitle}</span>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <span className="block text-base font-black text-[#7dd3fc]">{pkg.price.toLocaleString('ar-DZ')} دج</span>
                      <span className="block text-[10px] text-[#a0b4c4] line-through">{pkg.originalPrice.toLocaleString('ar-DZ')} دج</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Input Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1 text-right">
              <label className="text-xs font-semibold text-white" htmlFor="fullname">الاسم واللقب بالكامل *</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-[#a0b4c4] text-base">person</span>
                <input
                  id="fullname"
                  type="text"
                  required
                  value={fullName}
                  aria-invalid={!!fieldErrors.fullname}
                  aria-describedby={fieldErrors.fullname ? 'fullname-error' : undefined}
                  onFocus={() => trackFormFieldEngagement('fullname')}
                  onBlur={() => attachEarlyMatching({ name: fullName })}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullname) setFieldErrors((prev) => ({ ...prev, fullname: undefined }));
                  }}
                  placeholder="مثال: يوسف معمري"
                  className={`w-full pr-10 pl-3 py-2.5 rounded-xl bg-[#0a0e1a] border ${fieldErrors.fullname ? 'border-[#ff6b6b]' : 'border-[#2a3a48]/40'} focus:border-[#7dd3fc] text-white text-xs outline-none transition-colors box-border`}
                />
              </div>
              {fieldErrors.fullname && (
                <p id="fullname-error" role="alert" className="text-xs text-[#ff6b6b] mt-1">{fieldErrors.fullname}</p>
              )}
            </div>

            <div className="space-y-1 text-right">
              <label className="text-xs font-semibold text-white" htmlFor="phone">رقم الهاتف (لتأكيد شحن الطرد) *</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-[#a0b4c4] text-base">call</span>
                <input
                  id="phone"
                  type="tel"
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  aria-invalid={!!fieldErrors.phone}
                  aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                  onFocus={() => trackFormFieldEngagement('phone')}
                  onBlur={() => attachEarlyMatching({ phone })}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  placeholder="05 / 06 / 07 XX XX XX XX"
                  className={`w-full pr-10 pl-3 py-2.5 rounded-xl bg-[#0a0e1a] border ${fieldErrors.phone ? 'border-[#ff6b6b]' : 'border-[#2a3a48]/40'} focus:border-[#7dd3fc] text-white text-xs outline-none text-right transition-colors box-border`}
                />
              </div>
              {fieldErrors.phone && (
                <p id="phone-error" role="alert" className="text-xs text-[#ff6b6b] mt-1">{fieldErrors.phone}</p>
              )}
            </div>

            <div className="space-y-1 text-right">
              <label className="text-xs font-semibold text-white" htmlFor="wilaya">الولاية (58 ولاية) *</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-[#a0b4c4] text-base">location_on</span>
                <select
                  id="wilaya"
                  required
                  value={wilayaCode}
                  aria-invalid={!!fieldErrors.wilaya}
                  aria-describedby={fieldErrors.wilaya ? 'wilaya-error' : undefined}
                  onFocus={() => trackFormFieldEngagement('wilaya')}
                  onChange={(e) => {
                    setWilayaCode(e.target.value);
                    if (fieldErrors.wilaya) setFieldErrors((prev) => ({ ...prev, wilaya: undefined }));
                    try {
                      const obj = ALGERIA_WILAYAS.find((w) => w.code === e.target.value);
                      savePartialIdentity({ wilaya: obj ? obj.nameAr : undefined });
                    } catch {
                      // ignore
                    }
                  }}
                  className={`w-full pr-10 pl-3 py-2.5 rounded-xl bg-[#0a0e1a] border ${fieldErrors.wilaya ? 'border-[#ff6b6b]' : 'border-[#2a3a48]/40'} focus:border-[#7dd3fc] text-white text-xs outline-none appearance-none cursor-pointer transition-colors box-border`}
                >
                  <option value="" disabled className="bg-[#0f1524]">
                    اختر ولايتك...
                  </option>
                  {ALGERIA_WILAYAS.map((w) => (
                    <option key={w.code} value={w.code} className="bg-[#0f1524]">
                      {w.code}. {w.nameAr} ({w.nameFr})
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#a0b4c4] pointer-events-none text-base">arrow_drop_down</span>
              </div>
              {fieldErrors.wilaya && (
                <p id="wilaya-error" role="alert" className="text-xs text-[#ff6b6b] mt-1">{fieldErrors.wilaya}</p>
              )}
            </div>

            <div className="space-y-1 text-right">
              <label className="text-xs font-semibold text-white" htmlFor="address">البلدية أو الحي *</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute right-3 top-3 text-[#a0b4c4] text-base">home_pin</span>
                <input
                  id="address"
                  type="text"
                  required
                  value={address}
                  aria-invalid={!!fieldErrors.address}
                  aria-describedby={fieldErrors.address ? 'address-error' : undefined}
                  onFocus={() => trackFormFieldEngagement('address')}
                  onBlur={() => {
                    try {
                      savePartialIdentity({ commune: address.trim() || undefined });
                    } catch {
                      // ignore
                    }
                  }}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (fieldErrors.address) setFieldErrors((prev) => ({ ...prev, address: undefined }));
                  }}
                  placeholder="مثال: القبة، قرب المركز الثقافي"
                  className={`w-full pr-10 pl-3 py-2.5 rounded-xl bg-[#0a0e1a] border ${fieldErrors.address ? 'border-[#ff6b6b]' : 'border-[#2a3a48]/40'} focus:border-[#7dd3fc] text-white text-xs outline-none transition-colors box-border`}
                />
              </div>
              {fieldErrors.address && (
                <p id="address-error" role="alert" className="text-xs text-[#ff6b6b] mt-1">{fieldErrors.address}</p>
              )}
            </div>
          </div>

          {/* Checkout Calculation Box */}
          <div className="p-3.5 rounded-xl bg-[#0a0e1a] border border-[#7dd3fc]/20 space-y-1.5 text-xs">
            <div className="flex justify-between items-center text-[#a0b4c4]">
              <span>العرض المختار:</span>
              <span className="font-bold text-white" id="summary-name">{selectedPackage.name}</span>
            </div>
            <div className="flex justify-between items-center text-[#a0b4c4]">
              <span>رسوم التوصيل لكافة الـ 58 ولاية:</span>
              <span className="font-black text-[#7dd3fc] flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span> 0 دج مجاناً تماماً
              </span>
            </div>
            <div className="pt-1.5 border-t border-[#2a3a48]/20 flex justify-between items-center font-black text-sm text-white">
              <span>المبلغ الصافي عند الاستلام والمعاينة:</span>
              <span className="text-[#7dd3fc] text-base sm:text-lg" id="summary-price">{selectedPackage.price.toLocaleString('ar-DZ')} دج</span>
            </div>
          </div>

          {/* Submit */}
          {submitError && (
            <div role="alert" className="p-3.5 rounded-xl bg-[#3d1414]/70 border-2 border-[#ff6b6b]/50 text-[#ffb4b4] text-xs leading-relaxed text-right">
              {submitError}
            </div>
          )}
          <button
            id="submit-order-button"
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 rounded-full bg-[#7dd3fc] hover:bg-[#c8eaff] text-[#001f2e] font-headline font-black text-base tracking-wide shadow-[0_0_35px_rgba(125,211,252,0.4)] hover:shadow-[0_0_50px_rgba(125,211,252,0.6)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-75 cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">shopping_bag</span>
            <span id="form-submit-text">{isSubmitting ? 'جاري إرسال طلبكم وتثبيته...' : 'تأكيد الطلب الآن - الدفع نقداً بعد المعاينة عند الباب'}</span>
          </button>

          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-[#a0b4c4] pt-1">
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[#7dd3fc] text-sm">verified</span> ضمان 14 يوماً للاستبدال</span>
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[#7dd3fc] text-sm">lock</span> بيانات مشفرة وسرية</span>
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[#7dd3fc] text-sm">support_agent</span> خدمة ما بعد البيع 7/7</span>
          </div>
        </form>
      </div>
    </section>
  );
};
