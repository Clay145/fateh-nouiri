import React, { useState, useEffect } from 'react';
import {
  FunnelStats,
  getFunnelStats,
  clearAnalytics,
  subscribeToAnalytics,
  fetchServerStats,
  VisitorSession,
} from '../services/analyticsService';
import {
  Users,
  ShoppingBag,
  ArrowDown,
  Smartphone,
  Monitor,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Clock,
  Sparkles,
  MousePointerClick,
  HelpCircle,
  ShieldCheck,
  Filter,
  RefreshCw,
} from 'lucide-react';

export const FunnelAnalyticsView: React.FC = () => {
  const [stats, setStats] = useState<FunnelStats>(getFunnelStats());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'abandoned' | 'purchased' | 'form'>('all');
  const [displayLimit, setDisplayLimit] = useState(25);

  useEffect(() => {
    // Initial fetch from cache
    setStats(getFunnelStats());

    // Listen for realtime updates from server, phone devices & other tabs
    const unsubscribe = subscribeToAnalytics((updated) => {
      setStats(updated);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const updated = await fetchServerStats();
      if (updated) {
        setStats(updated);
      }
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
    }
  };

  const handleReset = async () => {
    await clearAnalytics();
    setStats(getFunnelStats());
    setShowClearConfirm(false);
  };

  const total = Math.max(stats.totalVisitors, 0);
  const clickedCta = Math.max(stats.clickedAddToCart, 0);
  const reachedForm = Math.max(stats.reachedCheckoutForm, 0);
  const startedForm = Math.max(stats.startedFillingForm, 0);
  const purchases = Math.max(stats.completedPurchases, 0);

  // Percentages from total visitors
  const ctaRate = total > 0 ? Math.round((clickedCta / total) * 100) : 0;
  const formReachRate = total > 0 ? Math.round((reachedForm / total) * 100) : 0;
  const formStartRate = total > 0 ? Math.round((startedForm / total) * 100) : 0;
  const purchaseRate = total > 0 ? Math.round((purchases / total) * 100) : 0;

  // Drop-offs
  const bounceBeforeCta = Math.max(0, total - clickedCta);
  const bounceBeforeCtaPct = total > 0 ? Math.round((bounceBeforeCta / total) * 100) : 0;

  const dropOffAtForm = Math.max(0, reachedForm - startedForm);
  const dropOffAtFormPct = reachedForm > 0 ? Math.round((dropOffAtForm / reachedForm) * 100) : 0;

  const dropOffDuringTyping = Math.max(0, startedForm - purchases);
  const dropOffDuringTypingPct = startedForm > 0 ? Math.round((dropOffDuringTyping / startedForm) * 100) : 0;

  // Mobile vs Desktop
  const mobileCount = stats.devices?.mobile || 0;
  const desktopCount = stats.devices?.desktop || 0;
  const deviceTotal = mobileCount + desktopCount;
  const mobilePct = deviceTotal > 0 ? Math.round((mobileCount / deviceTotal) * 100) : 100;

  const formatTime = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'منذ لحظات';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    return new Date(timestamp).toLocaleDateString('ar-DZ');
  };

  const getStageBadge = (session: VisitorSession) => {
    switch (session.furthestStep) {
      case 'purchase':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            أتم الطلب بنجاح (Purchase)
          </span>
        );
      case 'form_started':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            توقف عند ملء الاستمارة ({session.lastActiveField || 'حقول البيانات'})
          </span>
        );
      case 'initiate_checkout':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30">
            <ShoppingBag className="w-3 h-3" />
            فتح الاستمارة ثم تردد (InitiateCheckout)
          </span>
        );
      case 'add_to_cart':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <MousePointerClick className="w-3 h-3" />
            ضغط "اطلب الآن" (AddToCart)
          </span>
        );
      case 'content_engaged':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            قرأ تفاصيل المنتج فقط
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
            زيارة سريعة (ارتداد)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-right">
      {/* Top Banner with Clear Controls & Sync */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0f172a]/90 backdrop-blur p-4 sm:p-5 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#7dd3fc]" />
              تتبع مسار الشراء ونقاط توقف الزوار (Drop-Off Funnel)
            </h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              مباشر
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            متابعة تحركات الزوار وإشارات فيسبوك بيكسل (AddToCart / InitiateCheckout / Purchase) بدقة وحفظ دائم لا يضيع.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>حفظ دائم ومحمي (Durable)</span>
          </div>

          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 text-xs font-bold border border-slate-700"
            title="مزامنة فورية وتحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#7dd3fc]' : ''}`} />
            <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة وتحديث'}</span>
          </button>

          {!showClearConfirm ? (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              تصفير بيانات التتبع
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-red-950/80 p-1.5 rounded-xl border border-red-500/50">
              <span className="text-xs text-red-200 font-semibold px-2">تأكيد التصفير لبدء حملة جديدة؟</span>
              <button
                onClick={handleReset}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition"
              >
                نعم، تصفير
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Visitors */}
        <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">إجمالي الزوار الفريدين</span>
            <Users className="w-5 h-5 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {total} <span className="text-xs font-normal text-slate-400">زائر</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-2.5 pt-2.5 border-t border-slate-800/80">
            <span className="flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-[#7dd3fc]" />
              هاتف: {mobilePct}%
            </span>
            <span className="flex items-center gap-1">
              <Monitor className="w-3 h-3 text-slate-400" />
              كمبيوتر: {100 - mobilePct}%
            </span>
          </div>
        </div>

        {/* AddToCart Clickers */}
        <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">نقروا على "اطلب الآن"</span>
            <MousePointerClick className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-purple-300">
            {clickedCta} <span className="text-xs font-normal text-slate-400">({ctaRate}%)</span>
          </div>
          <div className="text-[11px] text-purple-300/80 mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
            <span>إشارات fbq('AddToCart')</span>
            <span className="font-mono font-bold">{clickedCta}</span>
          </div>
        </div>

        {/* Form Reached / InitiateCheckout */}
        <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">وصلوا لاستمارة الشراء</span>
            <ShoppingBag className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-300">
            {reachedForm} <span className="text-xs font-normal text-slate-400">({formReachRate}%)</span>
          </div>
          <div className="text-[11px] text-amber-300/80 mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
            <span>إشارات InitiateCheckout</span>
            <span className="font-mono font-bold">{reachedForm}</span>
          </div>
        </div>

        {/* Overall Conversion Rate */}
        <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">معدل التحويل الكلي (Conversion)</span>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400">
            {purchases} <span className="text-xs font-normal text-slate-400">({purchaseRate}%)</span>
          </div>
          <div className="text-[11px] text-emerald-400/80 mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
            <span>طلبات مكتملة ومؤكدة</span>
            <span className="font-bold">{purchases} طلب</span>
          </div>
        </div>
      </div>

      {/* Main Visual Funnel Breakdown */}
      <div className="bg-[#0f172a]/90 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h4 className="font-bold text-white text-base sm:text-lg">
              المخطط البياني لمسار التحويل (Conversion Funnel)
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              نسبة بقاء الزبائن في كل مرحلة ونقاط التسرب (Drop-off) التي تفقدك مبيعات
            </p>
          </div>
          <div className="text-xs text-slate-400">
            المجموع: <span className="font-bold text-white">{total} زائر</span>
          </div>
        </div>

        {/* Funnel Steps */}
        <div className="space-y-4">
          {/* Step 1: Page Views */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs sm:text-sm">
              <span className="font-bold text-slate-200 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-300">
                  1
                </span>
                دخول الموقع وتصفح الصفحة الرئيسية
              </span>
              <span className="font-bold text-white font-mono">{total} زائر (100%)</span>
            </div>
            <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div className="h-full bg-slate-500 rounded-full transition-all duration-700" style={{ width: '100%' }}></div>
            </div>
          </div>

          {/* Drop-off Indicator between 1 & 2 */}
          {total > 0 && bounceBeforeCta > 0 && (
            <div className="flex items-center justify-center gap-2 text-[11px] text-rose-400 py-0.5 bg-rose-500/5 rounded-lg border border-rose-500/10 mx-6">
              <ArrowDown className="w-3 h-3" />
              <span>
                تسرب <strong>{bounceBeforeCta} زائر ({bounceBeforeCtaPct}%)</strong> غادروا دون الضغط على "اطلب الآن"
              </span>
            </div>
          )}

          {/* Step 2: Clicked AddToCart */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs sm:text-sm">
              <span className="font-bold text-purple-300 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-950/80 border border-purple-600 flex items-center justify-center text-[10px] text-purple-300">
                  2
                </span>
                الضغط على زر "اطلب الآن" (إشارة AddToCart)
              </span>
              <span className="font-bold text-purple-300 font-mono">
                {clickedCta} زائر ({ctaRate}%)
              </span>
            </div>
            <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, ctaRate)}%` }}
              ></div>
            </div>
          </div>

          {/* Step 3: Reached Order Form / InitiateCheckout */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs sm:text-sm">
              <span className="font-bold text-sky-300 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-950/80 border border-sky-600 flex items-center justify-center text-[10px] text-sky-300">
                  3
                </span>
                الوصول لاستمارة الطلب (إشارة InitiateCheckout)
              </span>
              <span className="font-bold text-sky-300 font-mono">
                {reachedForm} زائر ({formReachRate}%)
              </span>
            </div>
            <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, formReachRate)}%` }}
              ></div>
            </div>
          </div>

          {/* Drop-off Indicator between 3 & 4 */}
          {reachedForm > 0 && dropOffAtForm > 0 && (
            <div className="flex items-center justify-center gap-2 text-[11px] text-amber-400 py-0.5 bg-amber-500/5 rounded-lg border border-amber-500/10 mx-6">
              <ArrowDown className="w-3 h-3" />
              <span>
                تسرب <strong>{dropOffAtForm} زائر ({dropOffAtFormPct}%)</strong> رأوا الاستمارة ولم يبدأوا الكتابة (تردد بسبب السعر أو الباقات)
              </span>
            </div>
          )}

          {/* Step 4: Started Typing Form */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs sm:text-sm">
              <span className="font-bold text-amber-300 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-950/80 border border-amber-600 flex items-center justify-center text-[10px] text-amber-300">
                  4
                </span>
                بدء إدخال البيانات (الاسم / الهاتف / الولاية)
              </span>
              <span className="font-bold text-amber-300 font-mono">
                {startedForm} زائر ({formStartRate}%)
              </span>
            </div>
            <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, formStartRate)}%` }}
              ></div>
            </div>
          </div>

          {/* Drop-off Indicator between 4 & 5 */}
          {startedForm > 0 && dropOffDuringTyping > 0 && (
            <div className="flex items-center justify-center gap-2 text-[11px] text-orange-400 py-0.5 bg-orange-500/5 rounded-lg border border-orange-500/10 mx-6">
              <ArrowDown className="w-3 h-3" />
              <span>
                تسرب <strong>{dropOffDuringTyping} زائر ({dropOffDuringTypingPct}%)</strong> بدأوا ملء البيانات لكن أغلقوا الصفحة قبل إرسال الطلب
              </span>
            </div>
          )}

          {/* Step 5: Completed Purchases */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs sm:text-sm">
              <span className="font-bold text-emerald-400 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-950/80 border border-emerald-500 flex items-center justify-center text-[10px] text-emerald-400">
                  ✓
                </span>
                إتمام الطلب بنجاح (Purchase Converted)
              </span>
              <span className="font-bold text-emerald-400 font-mono">
                {purchases} طلب مؤكد ({purchaseRate}%)
              </span>
            </div>
            <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                style={{ width: `${Math.min(100, purchaseRate)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostic & Drop-off Analysis: أين تتوقف عمليات الشراء؟ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Point 1: Bounce at Page */}
        <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
            <AlertTriangle className="w-4 h-4" />
            <span>نقطة توقف 1: ارتداد مبكر دون نقر</span>
          </div>
          <div className="text-xl font-bold text-white">
            {bounceBeforeCta} <span className="text-xs text-slate-400 font-normal">زائر غادروا فوراً</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            زوار وصلوا من الإعلان لكن لم يضغطوا على "اطلب الآن". تأكد من أن الفيديو الإعلاني يتطابق محتواه مع بداية الصفحة حتى لا يشعر الزبون بالتشتت.
          </p>
        </div>

        {/* Point 2: Drop off at form */}
        <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
            <TrendingDown className="w-4 h-4" />
            <span>نقطة توقف 2: التردد عند الاستمارة</span>
          </div>
          <div className="text-xl font-bold text-white">
            {dropOffAtForm} <span className="text-xs text-slate-400 font-normal">شاهدوا النموذج ولم يكتبوا</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            الزبون وصل إلى النموذج وتردد عند رؤية السعر أو تفاصيل الباقة. تأكد من أن سعر 9,500 دج والتوصيل المجاني واضحان في الإعلان.
          </p>
        </div>

        {/* Point 3: Form Field drop off */}
        <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 text-sky-400 text-xs font-bold">
            <HelpCircle className="w-4 h-4" />
            <span>نقطة توقف 3: التراجع أثناء الكتابة</span>
          </div>
          <div className="text-xl font-bold text-white">
            {dropOffDuringTyping} <span className="text-xs text-slate-400 font-normal">بدأوا ولم يكملوا</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            توقف الزبائن أثناء إدخال رقم الهاتف أو العنوان. رسائل التطمين بالدفع عند الاستلام والمعاينة قبل الدفع تزيد إكمال هذه المرحلة.
          </p>
        </div>
      </div>

      {/* Live Recent Visitor Sessions */}
      <div className="bg-[#0f172a]/90 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h4 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#7dd3fc]" />
              سجل حركة الزوار ونقاط توقفهم (Live Session Log)
            </h4>
            <span className="text-xs text-slate-400">
              إجمالي الجلسات المحفوظة: {stats.recentSessions?.length || 0} زيارة
            </span>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => { setFilterMode('all'); setDisplayLimit(25); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filterMode === 'all'
                  ? 'bg-[#7dd3fc]/20 text-[#7dd3fc] border border-[#7dd3fc]/40'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              الكل ({stats.recentSessions?.length || 0})
            </button>
            <button
              onClick={() => { setFilterMode('abandoned'); setDisplayLimit(25); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filterMode === 'abandoned'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              ضغطوا "اطلب الآن" وتوقفوا ({stats.recentSessions?.filter((s) => s.furthestStep === 'add_to_cart' || s.furthestStep === 'initiate_checkout').length || 0})
            </button>
            <button
              onClick={() => { setFilterMode('form'); setDisplayLimit(25); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filterMode === 'form'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              توقفوا أثناء الكتابة ({stats.recentSessions?.filter((s) => s.furthestStep === 'form_started').length || 0})
            </button>
            <button
              onClick={() => { setFilterMode('purchased'); setDisplayLimit(25); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                filterMode === 'purchased'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              أتموا الشراء ({stats.recentSessions?.filter((s) => s.furthestStep === 'purchase').length || 0})
            </button>
          </div>
        </div>

        {(!stats.recentSessions || stats.recentSessions.length === 0) ? (
          <div className="text-center py-8 text-slate-500 text-xs sm:text-sm">
            لا توجد جلسات مسجلة بعد. بمجرد دخول أي زائر عبر الإعلان أو تصفح المتجر من هاتفه، ستظهر تفاصيل حركته هنا مباشرة وستبقى محفوظة بشكل دائم.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {(() => {
              const filtered = (stats.recentSessions || []).filter((sess) => {
                if (filterMode === 'abandoned') {
                  return sess.furthestStep === 'add_to_cart' || sess.furthestStep === 'initiate_checkout';
                }
                if (filterMode === 'purchased') {
                  return sess.furthestStep === 'purchase';
                }
                if (filterMode === 'form') {
                  return sess.furthestStep === 'form_started';
                }
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    لا توجد زيارات تطابق هذا الفلتر حالياً.
                  </div>
                );
              }

              const visible = filtered.slice(0, displayLimit);

              return (
                <div className="space-y-3">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                        <th className="py-2.5 px-3">الوقت</th>
                        <th className="py-2.5 px-3">الجهاز</th>
                        <th className="py-2.5 px-3">المصدر</th>
                        <th className="py-2.5 px-3">أبعد نقطة وصل إليها الزائر</th>
                        <th className="py-2.5 px-3">النتيجة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {visible.map((sess) => (
                        <tr key={sess.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-3 text-slate-400 whitespace-nowrap">
                            {formatTime(sess.lastActiveTime || sess.startTime)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="flex items-center gap-1.5 text-slate-300">
                              {sess.device === 'هاتف محمول' ? (
                                <Smartphone className="w-3.5 h-3.5 text-[#7dd3fc]" />
                              ) : (
                                <Monitor className="w-3.5 h-3.5 text-slate-400" />
                              )}
                              {sess.device}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                            {sess.source}
                          </td>
                          <td className="py-3 px-3">
                            {getStageBadge(sess)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {sess.furthestStep === 'purchase' ? (
                              <span className="text-emerald-400 font-bold">تم الشراء 💰</span>
                            ) : sess.furthestStep === 'form_started' ? (
                              <span className="text-amber-400">توقف أثناء الكتابة ⏳</span>
                            ) : sess.furthestStep === 'initiate_checkout' ? (
                              <span className="text-sky-400">توقف عند الفورم 👁️</span>
                            ) : sess.furthestStep === 'add_to_cart' ? (
                              <span className="text-purple-400">نقر اطلب الآن 🛒</span>
                            ) : (
                              <span className="text-slate-500">مغادرة مبكرة 🚪</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {filtered.length > displayLimit && (
                    <div className="text-center pt-3 border-t border-slate-800/60">
                      <button
                        onClick={() => setDisplayLimit((prev) => prev + 25)}
                        className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[#7dd3fc] text-xs font-semibold transition"
                      >
                        عرض 25 زيارة إضافية (متبقي {filtered.length - displayLimit})
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
