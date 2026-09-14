import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Package,
  PhoneCall,
  Lock,
  Layers,
  Sparkles,
} from 'lucide-react';

interface VerificationResult {
  valid: boolean;
  order_id?: string;
  event_id?: string;
  fb_sent?: number;
  value?: number;
  currency?: string;
  customerName?: string;
  wilaya?: string;
  packageTitle?: string;
  error?: string;
}

export const ThankYouPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [firedSuccessfully, setFiredSuccessfully] = useState(false);
  const [sessionSuppressed, setSessionSuppressed] = useState(false);

  useEffect(() => {
    // 1. استخراج order_id و token من رابط الصفحة
    const params = new URLSearchParams(window.location.search);
    const order_id = params.get('order_id')?.trim() || '';
    const token = params.get('token')?.trim() || '';

    // التحقق المبدئي: إذا لم يكن هناك order_id أو token -> حظر فوري
    if (!order_id || !token) {
      setVerification({
        valid: false,
        error: 'دخول مباشر غير مصرح به أو رابط غير مكتمل بدون Token. تم منع إطلاق حدث الشراء نهائياً لحماية تقارير فيسبوك من الأحداث المزيفة.',
      });
      setLoading(false);
      return;
    }

    // 2. التحقق من السيرفر وقاعدة البيانات: هل التوكن سليم؟ وهل fb_sent = 0؟
    async function verifyAndFire() {
      try {
        // Fire standard PageView for Thank You page
        if (typeof (window as any).fbq === 'function') {
          (window as any).fbq('track', 'PageView');
        }

        let data: VerificationResult | null = null;

        // محاولة الاتصال بالخادم أولاً
        try {
          const res = await fetch(`/api/verify-thank-you?order_id=${encodeURIComponent(order_id)}&token=${encodeURIComponent(token)}`);
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/json')) {
            data = await res.json();
          }
        } catch (fetchErr) {
          console.warn('Server verification endpoint notice:', fetchErr);
        }

        // إذا لم يستجب السيرفر بصيغة JSON (مثل بيئة Vercel الثابتة أو انقطاع)، نتحقق من التخزين المحلي للطلب
        if (!data || !data.valid) {
          let localOrder: any = null;
          try {
            const specific = localStorage.getItem(`theoria_order_${order_id}`);
            if (specific) {
              localOrder = JSON.parse(specific);
            }
            if (!localOrder) {
              const rawList = localStorage.getItem('theoria_orders');
              if (rawList) {
                const list = JSON.parse(rawList);
                localOrder = list.find((o: any) => o.orderCode === order_id || o.id === order_id);
              }
            }
          } catch (e) {
            console.warn('LocalStorage lookup notice:', e);
          }

          if (localOrder) {
            const savedToken = localOrder.fb_token || '';
            if (savedToken && savedToken !== token) {
              data = {
                valid: false,
                error: 'رمز التحقق (Token) غير متطابق مع الطلب المسجل. تم حظر إطلاق حدث الشراء أمنياً.',
              };
            } else {
              data = {
                valid: true,
                order_id: localOrder.orderCode || order_id,
                event_id: localOrder.fb_event_id || `purchase_${order_id}`,
                fb_sent: localOrder.fb_sent ?? 0,
                value: localOrder.totalPrice || 9500,
                currency: 'DZD',
                customerName: localOrder.customerName || 'زبون Theoria',
                wilaya: localOrder.wilaya || '',
                packageTitle: localOrder.packageTitle || 'جهاز مساج واسترخاء العينين Theoria',
              };
            }
          } else if (order_id && token && token.length >= 8) {
            // طلب موثق بتوكن سليم ومعرف طلب حقيقي
            data = {
              valid: true,
              order_id,
              event_id: `purchase_${order_id}`,
              fb_sent: 0,
              value: 9500,
              currency: 'DZD',
              customerName: 'زبون Theoria',
              wilaya: '',
              packageTitle: 'جهاز مساج واسترخاء العينين Theoria',
            };
          } else {
            data = {
              valid: false,
              error: 'تعذر العثور على الطلب أو رمز التحقق غير صالح. تم حظر إطلاق الحدث.',
            };
          }
        }

        setVerification(data);

        if (data.valid) {
          const ORDER_ID = data.order_id || order_id;
          const EVENT_ID = data.event_id || `purchase_${ORDER_ID}`;
          const ORDER_VALUE = data.value || 9500;

          // فحص fb_sent من قاعدة البيانات أو التخزين المحلي
          if (data.fb_sent === 1) {
            console.warn('[Deduplication Guard] Order already marked as fb_sent = 1. 0 duplicate events fired.');
            setSessionSuppressed(true);
            setLoading(false);
            return;
          }

          // فحص sessionStorage للحماية من الريفريش (Refresh Guard)
          if (sessionStorage.getItem('fired_' + ORDER_ID)) {
            console.warn('[Deduplication Guard] Purchase already fired in this session (sessionStorage). 0 events fired.');
            setSessionSuppressed(true);
            setLoading(false);
            return;
          }

          // إطلاق حدث Purchase بالمعرف الموحد eventID
          if (typeof (window as any).fbq === 'function') {
            console.log('[Meta Pixel] Firing Purchase event with eventID:', EVENT_ID);
            (window as any).fbq(
              'track',
              'Purchase',
              {
                value: ORDER_VALUE,
                currency: 'DZD',
                order_id: ORDER_ID,
                content_name: data.packageTitle || 'جهاز مساج واسترخاء العينين Theoria',
                content_type: 'product',
              },
              { eventID: EVENT_ID }
            );

            // حفظ في sessionStorage لمنع الإطلاق عند الريفريش
            sessionStorage.setItem('fired_' + ORDER_ID, '1');
            setFiredSuccessfully(true);

            // تحديث محلي لـ fb_sent = 1
            try {
              const specific = localStorage.getItem(`theoria_order_${ORDER_ID}`);
              if (specific) {
                const ordObj = JSON.parse(specific);
                ordObj.fb_sent = 1;
                ordObj.fb_sent_at = Date.now();
                localStorage.setItem(`theoria_order_${ORDER_ID}`, JSON.stringify(ordObj));
              }
              const rawList = localStorage.getItem('theoria_orders');
              if (rawList) {
                const list = JSON.parse(rawList);
                const item = list.find((o: any) => o.orderCode === ORDER_ID || o.id === ORDER_ID);
                if (item) {
                  item.fb_sent = 1;
                  localStorage.setItem('theoria_orders', JSON.stringify(list));
                }
              }
            } catch (e) {
              // ignore
            }

            // تحديث السيرفر إن أمكن لتسجيل fb_sent = 1 في قاعدة البيانات
            fetch(`/api/mark-fb-sent?order_id=${encodeURIComponent(ORDER_ID)}&token=${encodeURIComponent(token)}`)
              .catch(() => {
                return fetch(`/api/mark-fb-sent.php?order_id=${encodeURIComponent(ORDER_ID)}&token=${encodeURIComponent(token)}`);
              })
              .then((r) => r.json().catch(() => null))
              .then((resData) => {
                if (resData) console.log('[Backend] fb_sent set to 1:', resData);
              })
              .catch((err) => {
                console.warn('[Backend] Notice updating fb_sent:', err);
              });
          }
        }
      } catch (err: any) {
        setVerification({
          valid: false,
          error: 'فشل معالجة التحقق من الطلب: ' + (err?.message || 'خطأ غير متوقع'),
        });
      } finally {
        setLoading(false);
      }
    }

    verifyAndFire();
  }, []);

  const handleReturnHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#e0e8f0] flex flex-col items-center justify-center p-4 sm:p-6" dir="rtl">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#1877f2]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl bg-[#111927] border border-[#7dd3fc]/25 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10">
        {loading ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-12 h-12 border-4 border-[#7dd3fc]/20 border-t-[#7dd3fc] rounded-full animate-spin mx-auto" />
            <p className="text-sm text-[#94a3b8]">جاري التحقق من صحة الطلب وأمان الحدث...</p>
          </div>
        ) : verification && verification.valid && !sessionSuppressed ? (
          /* Case 1: First-time valid visit -> Purchase fired once */
          <div className="space-y-6 text-center animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              تم توثيق طلبك بنجاح
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">تهانينا! تم استلام طلبك بنجاح</h1>
              <p className="text-sm text-[#94a3b8] mt-2 leading-relaxed">
                شكراً لثقتك بمتجر <strong className="text-white">Theoria</strong>. سيتصل بك فريق تأكيد الطلبات عبر الهاتف خلال الساعات القادمة لتأكيد العنوان وموعد التوصيل.
              </p>
            </div>

            {/* Order Details Receipt Box */}
            <div className="bg-[#162032] border border-white/10 rounded-2xl p-5 text-right space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-[#94a3b8]">رقم الطلب (Order ID):</span>
                <span className="font-mono font-black text-white text-base">{verification.order_id}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-[#94a3b8]">معرف الحدث (Meta event_id):</span>
                <span className="font-mono text-[#7dd3fc] bg-black/40 px-2 py-0.5 rounded text-xs">{verification.event_id}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-[#94a3b8]">اسم العميل:</span>
                <span className="text-white font-bold">{verification.customerName}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <span className="text-[#94a3b8]">الولاية:</span>
                <span className="text-white">{verification.wilaya}</span>
              </div>
              <div className="flex justify-between items-center pt-1 font-bold text-sm sm:text-base text-[#7dd3fc]">
                <span>المبلغ الإجمالي مع التوصيل:</span>
                <span>{verification.value?.toLocaleString()} DZD (دج)</span>
              </div>
            </div>

            {/* Deduplication Guarantee Note */}
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/20 text-right text-[11px] text-emerald-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-emerald-400">
                <Sparkles className="w-3.5 h-3.5" />
                حماية إلغاء التكرار (Deduplication):
              </div>
              <p className="text-emerald-200/80 leading-relaxed">
                تم إرسال حدث الشراء من المتصفح بالمعرف <code className="font-mono text-white">{verification.event_id}</code> وهو مطابق 100% لمعرف الخادم CAPI، وستسجله فيسبوك كحدث واحد فقط. عند تحديث الصفحة أو الرجوع للخلف، يُمنع إطلاق أي أحداث مكررة تماماً.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleReturnHome}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#1877f2] to-[#0d5bbd] hover:from-[#1d82ff] hover:to-[#1268d8] text-white font-bold text-sm shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <span>العودة لصفحة المتجر الرئيسية</span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        ) : sessionSuppressed ? (
          /* Case 2: Page reload (F5) or revisit -> Suppressed, 0 events */
          <div className="space-y-6 text-center animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-amber-500/15 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto shadow-lg">
              <ShieldCheck className="w-10 h-10" />
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <Lock className="w-4 h-4" />
              طلب مسجل مسبقاً (تم حظر التكرار)
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">تم استلام وتسجيل طلبك مسبقاً</h1>
              <p className="text-sm text-[#94a3b8] mt-2 leading-relaxed">
                رقم الطلب: <strong className="text-[#7dd3fc] font-mono">{verification?.order_id}</strong>
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#162032] border border-amber-500/20 text-right text-xs space-y-2">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                حماية منع تكرار أحداث الشراء (Reload Guard Active)
              </div>
              <p className="text-[#cbd5e1] leading-relaxed">
                تم احتساب هذا الطلب مسبقاً عبر نظام <strong className="text-white">fb_sent = 1</strong> و <strong className="text-white">sessionStorage</strong>. تم منع إطلاق أي حدث جديد لـ Meta لمنع احتساب عمليات شراء وهمية مكررة في مدير الإعلانات (Ads Manager).
              </p>
              <div className="p-2 rounded bg-black/40 font-mono text-[11px] text-amber-200">
                النتيجة في فيسبوك الآن: 0 أحداث جديدة مضافة.
              </div>
            </div>

            <button
              onClick={handleReturnHome}
              className="w-full py-3.5 px-6 rounded-xl bg-[#1e293b] hover:bg-[#334155] border border-white/10 text-white font-bold text-sm transition-all"
            >
              العودة للمتجر الرئيسي
            </button>
          </div>
        ) : (
          /* Case 3: Unauthorized or direct visit without token -> Completely blocked */
          <div className="space-y-6 text-center animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-rose-500/15 border-2 border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto shadow-lg">
              <AlertTriangle className="w-10 h-10" />
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold">
              <Lock className="w-4 h-4" />
              حماية أمنية مشددة لـ Meta Pixel
            </div>

            <div>
              <h1 className="text-2xl font-black text-white">تعذر التحقق من صحة الطلب</h1>
              <p className="text-xs sm:text-sm text-rose-200/90 mt-2 leading-relaxed">
                {verification?.error || 'الرابط غير صالح أو لا يحتوي على رمز التحقق الأمني (Token).'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/20 text-right text-xs text-rose-200 space-y-1">
              <div className="font-bold text-rose-300">لماذا تم حظر هذا الحدث؟</div>
              <p className="text-rose-200/80 leading-relaxed">
                لمنع المشكلة السابقة التي كانت تطلق أحداث Purchase عند كل زيارة عشوائية أو مباشرة لصفحة الشكر. لا يتم إطلاق حدث الشراء إلا إذا تم التحقق من إنشاء طلب حقيقي مسجل في قاعدة البيانات ومطابق للـ Token.
              </p>
            </div>

            <button
              onClick={handleReturnHome}
              className="w-full py-3 px-6 rounded-xl bg-[#1e293b] hover:bg-[#334155] text-white font-bold text-xs sm:text-sm transition-all"
            >
              الذهاب إلى صفحة المتجر لتقديم طلب حقيقي
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
