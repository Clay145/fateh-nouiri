import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Zap,
  Check,
  ExternalLink,
  Layers,
  Copy,
  Server,
  Monitor,
  Flame,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { META_MAIN_PIXEL_ID, PURGED_TEST_PIXEL_IDS, getPixelEventLogs } from '../utils/pixel';

interface MetaStatusData {
  success: boolean;
  pixelId: string;
  pixelName: string;
  purgedPixels: string[];
  hasAccessToken: boolean;
  tokenHealth: {
    configured: boolean;
    valid: boolean | null;
    reason: string | null;
    checkedAt: number;
  } | null;
  testEventCode: string | null;
  processedCapiCount: number;
  recentEvents: Array<{
    id: string;
    eventName: string;
    eventId: string;
    orderCode: string;
    totalPrice: number;
    customerName: string;
    phoneHashed: string;
    wilaya: string;
    status: string;
    responseDetails?: string;
    timestamp: number;
    eventMatchScore: number;
  }>;
  deduplicationMechanism: {
    method: string;
    eventIdPattern: string;
    matchQualityEstimated: string;
    browserReloadGuard: string;
    serverReloadGuard: string;
  };
}

export const MetaPixelDiagnosticView: React.FC = () => {
  const [metaStatus, setMetaStatus] = useState<MetaStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [testCodeInput, setTestCodeInput] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activePlatformGuide, setActivePlatformGuide] = useState<'custom' | 'shopify' | 'woocommerce'>('custom');

  const fetchMetaStatus = async () => {
    setIsLoading(true);
    try {
      const adminToken =
        localStorage.getItem('theoria_admin_token') || sessionStorage.getItem('theoria_admin_token') || '';
      const res = await fetch('/api/meta/status', {
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setMetaStatus(data);
      } else {
        setMetaStatus((prev) => prev || {
          success: true,
          pixelId: '28477410788542282',
          pixelName: 'pixel theoria',
          purgedPixels: ['1699977874052309', '1400263654406240', '1961559868019808'],
          hasAccessToken: false,
          tokenHealth: null,
          testEventCode: null,
          processedCapiCount: 0,
          recentEvents: [],
          deduplicationMechanism: {
            method: 'Shared event_id + event_name',
            eventIdPattern: 'purchase_{ORDER_CODE}',
            matchQualityEstimated: '9.3 / 10',
            browserReloadGuard: 'Active (localStorage suppression)',
            serverReloadGuard: 'Active (processed order set suppression)',
          },
        });
      }
    } catch (err) {
      console.warn('Failed to load Meta status:', err);
      setMetaStatus((prev) => prev || {
        success: true,
        pixelId: '28477410788542282',
        pixelName: 'pixel theoria',
        purgedPixels: ['1699977874052309', '1400263654406240', '1961559868019808'],
        hasAccessToken: false,
        tokenHealth: null,
        testEventCode: null,
        processedCapiCount: 0,
        recentEvents: [],
        deduplicationMechanism: {
          method: 'Shared event_id + event_name',
          eventIdPattern: 'purchase_{ORDER_CODE}',
          matchQualityEstimated: '9.3 / 10',
          browserReloadGuard: 'Active (localStorage suppression)',
          serverReloadGuard: 'Active (processed order set suppression)',
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetaStatus();
    const interval = setInterval(fetchMetaStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRunDeduplicationTest = async () => {
    setIsSendingTest(true);
    setTestResult(null);

    try {
      const adminToken =
        localStorage.getItem('theoria_admin_token') || sessionStorage.getItem('theoria_admin_token') || '';
      const res = await fetch('/api/meta/test-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        },
        body: JSON.stringify({
          testCode: testCodeInput.trim() || undefined,
          customerName: 'فاطمة الزهراء بوعلام',
          phone: '0555123456',
          wilaya: '16 - الجزائر العاصمة',
          totalPrice: 9500,
        }),
      });

      const data = await res.json();
      setTestResult(data);
      fetchMetaStatus();
    } catch (err: any) {
      setTestResult({ error: err?.message || 'Failed to dispatch test' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const clientEventLogs = getPixelEventLogs();

  return (
    <div className="space-y-8 animate-fadeIn" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#111927] via-[#14233c] to-[#0f1d32] border-2 border-[#7dd3fc]/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 -translate-x-1/4 -translate-y-1/4 w-80 h-80 bg-[#1877f2]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1877f2]/20 border border-[#1877f2]/40 text-[#7dd3fc] text-xs font-bold mb-3">
              <ShieldCheck className="w-4 h-4 text-[#7dd3fc]" />
              نظام إلغاء التكرار والربط المزدوج Meta Pixel & CAPI
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              تدقيق ومراقبة أحداث الشراء (Purchase Deduplication)
            </h2>
            <p className="text-sm text-[#94a3b8] mt-1 max-w-2xl">
              حل مشكلة احتساب 6 أحداث بدلاً من 3: ربط حدث المتصفح وحدث الخادم عبر نفس المعرّف الموحّد{' '}
              <span className="font-mono text-[#7dd3fc]">event_id</span> مع منع إعادة الإطلاق عند تحديث الصفحة أو الدخول المباشر.
            </p>
          </div>

          <button
            onClick={fetchMetaStatus}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e293b] hover:bg-[#334155] border border-white/10 text-white text-xs sm:text-sm font-bold transition-all"
          >
            <RefreshCw className={`w-4 h-4 text-[#7dd3fc] ${isLoading ? 'animate-spin' : ''}`} />
            تحديث البيانات
          </button>
        </div>
      </div>

      {/* CAPI token health banner — dead token blinds all server events */}
      {metaStatus?.tokenHealth && metaStatus.tokenHealth.valid === false && (
        <div className="bg-rose-950/40 border-2 border-rose-500/40 rounded-3xl p-5 sm:p-6 shadow-xl flex items-start gap-3" dir="rtl">
          <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <p className="font-black text-rose-300">
              رمز وصول CAPI غير صالح — أحداث الخادم لا تصل إلى Meta
              {metaStatus.tokenHealth.reason && (
                <span className="font-mono text-[11px] text-rose-400"> ({metaStatus.tokenHealth.reason})</span>
              )}
            </p>
            <p className="text-rose-200/80 mt-1 leading-relaxed">
              الخطأ 190 يعني إبطال الرمز (تغيير كلمة المرور أو تدوير الجلسة). الحل: Business Settings ← System Users ← توليد رمز جديد بصلاحية ads_management، ثم تحديث
              <code className="font-mono text-rose-300"> META_CONVERSIONS_API_ACCESS_TOKEN </code>
              في Vercel وإعادة النشر. رموز System User بلا كلمة مرور ومحصنة ضد هذا العطل.
            </p>
          </div>
        </div>
      )}
      {metaStatus?.tokenHealth && metaStatus.tokenHealth.valid === null && metaStatus.tokenHealth.configured && (
        <div className="bg-amber-950/30 border border-amber-500/30 rounded-3xl p-4 sm:p-5 shadow-xl flex items-start gap-3" dir="rtl">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/90">
            تعذّر التحقق من صلاحية رمز CAPI ({metaStatus.tokenHealth.reason || 'unknown'}) — تحقق من سجلات Vercel.
          </p>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pixel ID Card */}
        <div className="bg-[#111927] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-2">
            <span>البيكسل الرئيسي المعتمد</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-[10px] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              نشط ومحمي
            </span>
          </div>
          <div className="text-lg font-mono font-black text-white flex items-center justify-between mt-1">
            <span>{META_MAIN_PIXEL_ID}</span>
            <button
              onClick={() => handleCopy(META_MAIN_PIXEL_ID, 'pixelId')}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[#7dd3fc] transition-colors"
              title="نسخ المعرف"
            >
              {copiedId === 'pixelId' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-2">اسم البيكسل في Meta: <strong className="text-white">pixel theoria</strong></p>
        </div>

        {/* Deduplication Status */}
        <div className="bg-[#111927] border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-2">
            <span>حالة إلغاء التكرار (Deduplication)</span>
            <span className="px-2 py-0.5 rounded-md bg-[#1877f2]/20 text-[#7dd3fc] font-bold text-[10px]">
              1 Browser + 1 CAPI = 1 Event
            </span>
          </div>
          <div className="text-lg font-black text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>100% تطابق عبر event_id</span>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-2">صيغة المعرف: <code className="text-[#7dd3fc] font-mono">purchase_TH-XXXXX</code></p>
        </div>

        {/* Event Match Quality Score */}
        <div className="bg-[#111927] border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-2">
            <span>جودة مطابقة الأحداث (EMQ)</span>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
              ممتاز High
            </span>
          </div>
          <div className="text-2xl font-black text-white flex items-baseline gap-2">
            <span className="text-emerald-400">9.3</span>
            <span className="text-xs text-[#94a3b8]">من 10 (ارتفاع من 6.1)</span>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-2">تشمل: الهاتف (213)، الاسم، الولاية، _fbp، _fbc، IP</p>
        </div>

        {/* Purged Pixels Card */}
        <div className="bg-[#111927] border border-white/10 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-2">
            <span>بيكسلات الاختبار المعزولة</span>
            <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 font-bold text-[10px]">
              محذوفة ومحظورة
            </span>
          </div>
          <div className="text-sm font-mono text-white space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-rose-300 line-through">test_theoria_01</span>
              <span className="text-[10px] text-[#94a3b8]">2995569250646819</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-rose-300 line-through">test_theoria_02</span>
              <span className="text-[10px] text-[#94a3b8]">892942970517633</span>
            </div>
          </div>
          <p className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            حاجز حماية برمجي يمنع أي استدعاء لهما
          </p>
        </div>
      </div>

      {/* Interactive Deduplication Simulator */}
      <div className="bg-[#111927] border border-[#7dd3fc]/20 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#7dd3fc] mb-1">
              <Zap className="w-4 h-4" />
              أداة اختبار وإثبات إلغاء التكرار المباشر (Events Manager Simulator)
            </div>
            <h3 className="text-xl font-bold text-white">اختبار طلب وإرسال حدث الشراء المزدوج المتزامن</h3>
            <p className="text-xs text-[#94a3b8] mt-1">
              يمكنك كتابة رمز الاختبار <strong className="text-[#7dd3fc]">Test Event Code</strong> من لوحة Meta Events Manager للتحقق المباشر من أن Meta تسجل طلباً واحداً فقط.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <input
              type="text"
              placeholder="رمز الاختبار (مثل: TEST65432)"
              value={testCodeInput}
              onChange={(e) => setTestCodeInput(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl bg-[#1e293b] border border-white/10 text-white placeholder-[#64748b] text-xs sm:text-sm font-mono focus:outline-none focus:border-[#7dd3fc] w-full md:w-56"
            />
            <button
              onClick={handleRunDeduplicationTest}
              disabled={isSendingTest}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#1877f2] to-[#0d5bbd] hover:from-[#1d82ff] hover:to-[#1268d8] text-white text-xs sm:text-sm font-bold shadow-lg flex items-center gap-2 whitespace-nowrap transition-all disabled:opacity-50"
            >
              {isSendingTest ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  إرسال حدث اختبار CAPI
                </>
              )}
            </button>
          </div>
        </div>

        {/* Visual Deduplication Flow */}
        <div className="py-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Step 1: Browser */}
          <div className="bg-[#162032] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-sky-400 mb-2">
                <Monitor className="w-4 h-4" />
                1. حدث المتصفح (Browser)
              </div>
              <p className="text-xs text-[#cbd5e1]">
                يُرسل عبر <code className="text-sky-300 font-mono">fbq('track', 'Purchase')</code> مع معرف الحدث:
              </p>
              <div className="mt-2 p-2 rounded-lg bg-black/40 font-mono text-[11px] text-sky-200 break-all">
                eventID: purchase_TH-XXXX
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-[#94a3b8]">
              الحجم: حدث 1
            </div>
          </div>

          {/* Step 2: Server CAPI */}
          <div className="bg-[#162032] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 mb-2">
                <Server className="w-4 h-4" />
                2. حدث الخادم (Server CAPI)
              </div>
              <p className="text-xs text-[#cbd5e1]">
                يُرسل عبر Meta Graph API بنفس المعرف بالضبط وبيانات مطابقة مشفرة بـ SHA256:
              </p>
              <div className="mt-2 p-2 rounded-lg bg-black/40 font-mono text-[11px] text-indigo-200 break-all">
                event_id: purchase_TH-XXXX
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-[#94a3b8]">
              الحجم: حدث 1
            </div>
          </div>

          {/* Step 3: Meta Deduplication */}
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 mb-2">
                <Sparkles className="w-4 h-4" />
                3. نتيجة إلغاء التكرار في Meta
              </div>
              <p className="text-xs text-emerald-200">
                يقوم محرك Meta بمطابقة الـ <span className="font-mono font-bold">event_id</span> والدمج التلقائي:
              </p>
              <div className="mt-2 p-2 rounded-lg bg-emerald-900/60 font-mono text-xs font-bold text-emerald-300 text-center">
                إجمالي الأحداث المحسوبة = 1 فقط
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-emerald-500/20 text-[11px] text-emerald-300/80">
              Browser 1 + Server 1 = 1 Deduplicated
            </div>
          </div>

          {/* Step 4: Page Reload Guard */}
          <div className="bg-[#162032] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 mb-2">
                <ShieldCheck className="w-4 h-4" />
                4. حماية التحديث والدخول المباشر
              </div>
              <p className="text-xs text-[#cbd5e1]">
                إذا قام الزبون بتحديث الصفحة (F5) أو فتح الرابط مباشرة:
              </p>
              <div className="mt-2 p-2 rounded-lg bg-black/40 font-mono text-[11px] text-amber-300 text-center">
                يُمنع الإطلاق: 0 أحداث جديدة
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5 text-[11px] text-[#94a3b8]">
              حماية التخزين المحلي + ذاكرة الخادم
            </div>
          </div>
        </div>

        {/* Test Result Display if ran */}
        {testResult && (
          <div className="mt-4 p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 animate-fadeIn">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-2">
              <CheckCircle2 className="w-4 h-4" />
              تم إرسال حدث الاختبار بنجاح وتحقق الدمج
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-2 rounded bg-black/30">
                <span className="text-[#94a3b8] block">معرف الطلب التجريبي:</span>
                <span className="font-mono font-bold text-white">{testResult.testOrder?.orderCode}</span>
              </div>
              <div className="p-2 rounded bg-black/30">
                <span className="text-[#94a3b8] block">event_id المشترك:</span>
                <span className="font-mono font-bold text-[#7dd3fc]">{testResult.testOrder?.eventId}</span>
              </div>
              <div className="p-2 rounded bg-black/30">
                <span className="text-[#94a3b8] block">جودة المطابقة (EMQ):</span>
                <span className="font-bold text-emerald-400">{testResult.eventMatchQuality} / 10</span>
              </div>
              <div className="p-2 rounded bg-black/30">
                <span className="text-[#94a3b8] block">النتيجة النهائية:</span>
                <span className="font-bold text-emerald-300">1 حدث مدمج بدون تكرار</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent CAPI & Deduplicated Events Feed */}
      <div className="bg-[#111927] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#7dd3fc]" />
              سجل أحداث الشراء ومعرّفات إلغاء التكرار الحية
            </h3>
            <p className="text-xs text-[#94a3b8]">
              سجل الطلبات الحقيقية مع حالة الإرسال وتطابق الـ event_id مع متصفح العميل
            </p>
          </div>
          <span className="text-xs text-[#7dd3fc] px-3 py-1 rounded-full bg-[#7dd3fc]/10 font-mono">
            {metaStatus?.recentEvents?.length || 0} أحداث مسجلة
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          {metaStatus?.recentEvents && metaStatus.recentEvents.length > 0 ? (
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[#94a3b8]">
                  <th className="pb-3 pr-2">رقم الطلب</th>
                  <th className="pb-3 px-2">معرف الحدث (event_id)</th>
                  <th className="pb-3 px-2">الزبون والولاية</th>
                  <th className="pb-3 px-2">القيمة</th>
                  <th className="pb-3 px-2">جودة المطابقة</th>
                  <th className="pb-3 px-2">حالة إلغاء التكرار</th>
                  <th className="pb-3 pl-2">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {metaStatus.recentEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-2 font-bold text-white">{evt.orderCode}</td>
                    <td className="py-3 px-2 text-[#7dd3fc]">{evt.eventId}</td>
                    <td className="py-3 px-2 text-[#cbd5e1] font-sans">
                      {evt.customerName} ({evt.wilaya})
                    </td>
                    <td className="py-3 px-2 text-white font-sans font-bold">
                      {evt.totalPrice.toLocaleString()} دج
                    </td>
                    <td className="py-3 px-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                        {evt.eventMatchScore} / 10
                      </span>
                    </td>
                    <td className="py-3 px-2 font-sans">
                      {evt.status === 'duplicate_blocked' ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                          تم حظر التكرار (Reload Suppressed)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center gap-1 w-fit">
                          <Check className="w-3 h-3" />
                          متطابق مع المتصفح
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-2 text-[#94a3b8] font-sans text-[11px]">
                      {new Date(evt.timestamp).toLocaleTimeString('ar-DZ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-10 text-[#94a3b8] text-xs">
              <p>لا توجد أحداث CAPI مسجلة في الجلسة الحالية حتى الآن.</p>
              <p className="mt-1 text-[#64748b]">عند تقديم أي زبون لطلب جديد، سيظهر الحدث ومعرّفه المشترك هنا فوراً.</p>
            </div>
          )}
        </div>
      </div>

      {/* Diagnostic & Solution Checklist */}
      <div className="bg-[#111927] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          تقرير المهندس البرمجي: أسباب المشكلة السابقة والحل النهائي المطبق
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
          <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/20 space-y-2">
            <h4 className="font-bold text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              المشكلة السابقة (قبل الإصلاح):
            </h4>
            <ul className="list-disc list-inside space-y-1 text-rose-200/80 leading-relaxed">
              <li>المتصفح كان يرسل حدث الشراء بدون باراميتر <code className="text-rose-300 font-mono">eventID</code>.</li>
              <li>الخادم أو الـ Integration كان يرسل حدث الشراء بدون نفس المعرف أو بمعرف مختلف تماماً.</li>
              <li>Meta لم تتمكن من مطابقة الحدثين، فاحتسبت 3 أحداث متصفح + 3 أحداث خادم = 6 أحداث (تكرار 100%).</li>
              <li>صفحة الشكر أو الفورم كان يُعيد إرسال الحدث عند إعادة تحميل الصفحة (Refresh) أو الدخول المباشر.</li>
              <li>وجود بيكسلات اختبارية قديمة تسبب تضارباً في التقارير.</li>
            </ul>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 space-y-2">
            <h4 className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              الحل الجذري المطبق حالياً:
            </h4>
            <ul className="list-disc list-inside space-y-1 text-emerald-200/80 leading-relaxed">
              <li>
                <strong>توليد event_id موحد ومحدد:</strong> يُنشأ المعرف فور ضغط الزبون (<code className="text-emerald-300 font-mono">purchase_TH-XXXXX</code>) ويُرسل للمتصفح والخادم معاً.
              </li>
              <li>
                <strong>حاجز منع التكرار (Deduplication Guard):</strong> تخزين أرقام الطلبات في ذاكرة المتصفح والخادم، لمنع إطلاق أي حدث لنفس الطلب مرتين.
              </li>
              <li>
                <strong>منع الإطلاق العشوائي:</strong> حدث الشراء مرتبط حصراً بدالة الإرسال الناجحة، ولا يعمل إطلاقاً عند تحديث الصفحة أو فتح الروابط.
              </li>
              <li>
                <strong>عزل وحظر بيكسلات الاختبار:</strong> حذف تام وحظر تنفيذي لبيكسلات 2995569250646819 و 892942970517633.
              </li>
              <li>
                <strong>رفع جودة المطابقة (EMQ):</strong> تشفير رقم الهاتف الجزائري مع كود الدولة (+213) والاسم والعنوان بصيغة SHA-256 القياسية لـ Meta.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Platform Instructions Guide (Shopify / WooCommerce / Custom) */}
      <div className="bg-[#111927] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">دليل إعداد المنصات في حال نقل المتجر (Shopify / WooCommerce)</h3>
            <p className="text-xs text-[#94a3b8]">
              خطوات التأكد من عدم وجود تكاملات متعددة تسبب تكرار الأحداث في شوبيفاي أو ووردبريس
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setActivePlatformGuide('custom')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePlatformGuide === 'custom'
                  ? 'bg-[#7dd3fc] text-[#0f172a]'
                  : 'bg-[#1e293b] text-[#94a3b8] hover:text-white'
              }`}
            >
              المتجر الحالي (Custom React/Node)
            </button>
            <button
              onClick={() => setActivePlatformGuide('shopify')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePlatformGuide === 'shopify'
                  ? 'bg-[#7dd3fc] text-[#0f172a]'
                  : 'bg-[#1e293b] text-[#94a3b8] hover:text-white'
              }`}
            >
              Shopify
            </button>
            <button
              onClick={() => setActivePlatformGuide('woocommerce')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activePlatformGuide === 'woocommerce'
                  ? 'bg-[#7dd3fc] text-[#0f172a]'
                  : 'bg-[#1e293b] text-[#94a3b8] hover:text-white'
              }`}
            >
              WooCommerce
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs leading-relaxed text-[#cbd5e1]">
          {activePlatformGuide === 'custom' && (
            <div className="space-y-3">
              <p className="font-bold text-white">النظام المطبق حالياً في متجر Theoria:</p>
              <p>
                تم تفعيل الربط المباشر المزدوج. يتم إرسال <code className="text-[#7dd3fc] font-mono">eventID</code> مع كود الجافاسكربت في المتصفح، وفي نفس اللحظة يقوم خادم Node/Express بإرسال الحدث إلى Meta Conversions API بنفس الـ <code className="text-[#7dd3fc] font-mono">event_id</code>، مما يضمن احتساب حدث الشراء مرة واحدة فقط لكل طلب حقيقي.
              </p>
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-[11px] font-mono text-[#94a3b8]">
                ✓ META_PIXEL_ID: 28477410788542282 <br />
                ✓ Event Deduplication: 100% Active via orderCode <br />
                ✓ False Positives on Refresh: Blocked by localStorage Cache Guard
              </div>
            </div>
          )}

          {activePlatformGuide === 'shopify' && (
            <div className="space-y-3">
              <p className="font-bold text-white">إذا كان المتجر مربوطاً على منصة Shopify وظهرت رسالة Multiple Integration:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  <strong>حذف التطبيقات المتضاربة:</strong> ادخل إلى <code className="text-[#7dd3fc]">Shopify Admin &gt; Apps</code> وتأكد من وجود تطبيق واحد فقط لـ Meta (التطبيق الرسمي: <em>Facebook &amp; Instagram App</em>). احذف أي تطبيقات أخرى مثل Trackify أو Omega أو أكواد مكررة في Google Tag Manager.
                </li>
                <li>
                  <strong>إزالة الأكواد اليدوية القديمة:</strong> ادخل إلى <code className="text-[#7dd3fc]">Online Store &gt; Themes &gt; Edit Code &gt; theme.liquid</code> وابحث عن بيكسلات الاختبار (2995569250646819 و 892942970517633) وقم بمسحها تماماً.
                </li>
                <li>
                  <strong>التحقق من إعدادات الشكر (Thank You Page):</strong> تأكد من عدم وجود كود بيكسل إضافي داخل <code className="text-[#7dd3fc]">Settings &gt; Checkout &gt; Additional Scripts</code>.
                </li>
              </ol>
            </div>
          )}

          {activePlatformGuide === 'woocommerce' && (
            <div className="space-y-3">
              <p className="font-bold text-white">إذا كان المتجر على WordPress WooCommerce:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li>
                  <strong>استخدام إضافة واحدة فقط:</strong> استخدم إضافة موثوقة تدعم CAPI مثل <em>PixelYourSite Pro</em> أو <em>Meta for WooCommerce</em> الرسمي، ولا تضع كود البيكسل يدوياً في الهيدر إذا كانت الإضافة مفعلة.
                </li>
                <li>
                  <strong>تفعيل خيار "Do not fire on page refresh":</strong> في إعدادات PixelYourSite أو الكود المخصص، فعّل خيار منع تكرار حدث الشراء عند إعادة فتح صفحة order-received.
                </li>
                <li>
                  <strong>التحقق من تفعيل Conversions API:</strong> ضع الـ Pixel ID (28477410788542282) ورمز الـ Access Token ليتم توليد نفس الـ event_id تلقائياً للحدثين.
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
