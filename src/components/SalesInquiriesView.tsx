import React, { useState, useEffect, useMemo } from 'react';
import { CustomerInquiry, InquiryCategory } from '../types/inquiries';
import {
  fetchSalesInquiries,
  clearSalesInquiries,
  generateCreativeSummary,
} from '../services/salesInquiriesService';
import {
  Sparkles,
  Search,
  RefreshCw,
  Trash2,
  Download,
  Copy,
  Check,
  Lightbulb,
  MessageCircle,
  ShieldCheck,
  Truck,
  DollarSign,
  Flame,
  BrainCircuit,
  Filter,
  Phone,
  User,
  MapPin,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';

export const SalesInquiriesView: React.FC = () => {
  const [inquiries, setInquiries] = useState<CustomerInquiry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedConceptIndex, setCopiedConceptIndex] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchSalesInquiries();
      setInquiries(data);
    } catch (err) {
      console.warn('[SalesInquiriesView] Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const creativeSummary = useMemo(() => {
    return generateCreativeSummary(inquiries);
  }, [inquiries]);

  const filteredInquiries = useMemo(() => {
    return inquiries.filter((inq) => {
      const matchesSearch =
        searchTerm === '' ||
        inq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inq.reply.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inq.orderData?.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inq.orderData?.phone?.includes(searchTerm);

      const matchesCategory =
        selectedCategory === 'all' || inq.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [inquiries, searchTerm, selectedCategory]);

  const handleCopyHook = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedConceptIndex(index);
    setTimeout(() => setCopiedConceptIndex(null), 2500);
  };

  const handleClear = async () => {
    if (
      !window.confirm(
        'هل أنت متأكد من مسح جميع استفسارات العملاء المسجلة؟ لا يمكن التراجع عن هذه الخطوة.'
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      await clearSalesInquiries();
      setInquiries([]);
    } catch (err: any) {
      alert(err?.message || 'فشل مسح الاستفسارات');
    } finally {
      setIsClearing(false);
    }
  };

  const exportCsv = () => {
    if (inquiries.length === 0) {
      alert('لا توجد استفسارات لتصديرها');
      return;
    }
    const headers = [
      'التاريخ',
      'سؤال العميل',
      'تصنيف السؤال',
      'الفكرة الإعلانية المقترحة (Ad Hook)',
      'رد الوكيل',
      'اسم العميل',
      'رقم الهاتف',
      'الولاية',
    ];
    const rows = inquiries.map((inq) => [
      `"${inq.dateStr || ''}"`,
      `"${(inq.question || '').replace(/"/g, '""')}"`,
      `"${inq.category || ''}"`,
      `"${(inq.adHookIdea || '').replace(/"/g, '""')}"`,
      `"${(inq.reply || '').replace(/"/g, '""')}"`,
      `"${inq.orderData?.customerName || ''}"`,
      `"${inq.orderData?.phone || ''}"`,
      `"${inq.orderData?.wilaya || ''}"`,
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `theoria_inquiries_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryColor = (cat: InquiryCategory) => {
    switch (cat) {
      case 'أمان وضغط العينين':
        return 'bg-amber-950/70 text-amber-300 border-amber-500/40';
      case 'صداع وأرق وإجهاد':
        return 'bg-purple-950/70 text-purple-300 border-purple-500/40';
      case 'شحن وتوصيل':
        return 'bg-blue-950/70 text-blue-300 border-blue-500/40';
      case 'سعر وعروض':
        return 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40';
      case 'طلب مباشر':
        return 'bg-sky-950/70 text-sky-300 border-sky-500/40';
      default:
        return 'bg-slate-800/80 text-slate-300 border-slate-600/40';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-right">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-[#111c33] via-[#162544] to-[#111c33] border border-[#7dd3fc]/20 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30">
              <BrainCircuit size={24} />
            </span>
            <h2 className="text-xl font-headline font-bold text-white">
              استخبارات العملاء وصناعة الكرياتيف (AI Creative Intelligence)
            </h2>
          </div>
          <p className="text-xs text-[#94a3b8] max-w-2xl leading-relaxed">
            كل استفسار أو اعتراض يطرحه الزائر على الوكيل الذكي يتم تسجيله وتصنيفه هنا تلقائياً، لاستخراج أقوى خطافات إعلانية وزوايا تسويقية (Ad Hooks & Angles) لحملاتك القادمة على TikTok وMeta!
          </p>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          <button
            onClick={loadData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-[#1e2d4d] hover:bg-[#283c66] text-white text-xs font-bold border border-white/10 flex items-center gap-1.5 transition-all active:scale-95"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </button>

          <button
            onClick={exportCsv}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all active:scale-95"
          >
            <Download size={14} />
            <span>تصدير Excel/CSV</span>
          </button>

          <button
            onClick={handleClear}
            disabled={isClearing || inquiries.length === 0}
            className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-40"
          >
            <Trash2 size={14} />
            <span>مسح السجل</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-[#131e36]/90 border border-[#7dd3fc]/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-1">
            <span>إجمالي الأسئلة</span>
            <MessageCircle size={15} className="text-[#38bdf8]" />
          </div>
          <span className="text-xl font-bold font-mono text-white">
            {creativeSummary.totalInquiries}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#131e36]/90 border border-amber-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-1">
            <span>مخاوف الأمان</span>
            <ShieldCheck size={15} className="text-amber-400" />
          </div>
          <span className="text-xl font-bold font-mono text-amber-300">
            {creativeSummary.categoryCounts['أمان وضغط العينين'] || 0}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#131e36]/90 border border-purple-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-1">
            <span>الصداع والشاشات</span>
            <Flame size={15} className="text-purple-400" />
          </div>
          <span className="text-xl font-bold font-mono text-purple-300">
            {creativeSummary.categoryCounts['صداع وأرق وإجهاد'] || 0}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#131e36]/90 border border-blue-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-1">
            <span>التوصيل والشحن</span>
            <Truck size={15} className="text-blue-400" />
          </div>
          <span className="text-xl font-bold font-mono text-blue-300">
            {creativeSummary.categoryCounts['شحن وتوصيل'] || 0}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#131e36]/90 border border-emerald-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-1">
            <span>الأسعار والعروض</span>
            <DollarSign size={15} className="text-emerald-400" />
          </div>
          <span className="text-xl font-bold font-mono text-emerald-300">
            {creativeSummary.categoryCounts['سعر وعروض'] || 0}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#131e36]/90 border border-sky-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[#94a3b8] mb-1">
            <span>طلبات حجز مباشرة</span>
            <TrendingUp size={15} className="text-sky-400" />
          </div>
          <span className="text-xl font-bold font-mono text-sky-300">
            {creativeSummary.categoryCounts['طلب مباشر'] || 0}
          </span>
        </div>
      </div>

      {/* Creative Ad Angles & Hooks (The Powerhouse for Media Buyers) */}
      <div className="p-5 rounded-2xl bg-gradient-to-b from-[#13223f] to-[#0d1628] border border-cyan-500/30 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-400/20 text-amber-400 border border-amber-400/30">
              <Lightbulb size={20} />
            </span>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>أفكار وسيناريوهات الكرياتيف المستنتجة من أسئلة الزبائن (Ad Scripts)</span>
                <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold">
                  جاهزة للتصوير والإطلاق
                </span>
              </h3>
              <p className="text-xs text-[#94a3b8]">
                مبنية على أكثر التخوفات التي سألها الزوار في متجرك، صُممت خصيصاً لمضاعفة الـ ROAS
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {creativeSummary.suggestedAdConcepts.map((concept, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-[#101b33] border border-white/10 hover:border-[#7dd3fc]/40 transition-all flex flex-col justify-between gap-3 shadow-md group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-[#7dd3fc]">{concept.title}</h4>
                </div>
                <div className="space-y-1.5 text-[11px] mb-3">
                  <p className="text-[#a0b4c4]">
                    <strong className="text-white">الجمهور:</strong> {concept.targetAudience}
                  </p>
                  <p className="text-[#a0b4c4]">
                    <strong className="text-white">الزاوية:</strong> {concept.angle}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-[#090d17] border border-white/5 text-xs text-[#cbd5e1] leading-relaxed font-sans">
                  {concept.hookScript}
                </div>
              </div>

              <button
                onClick={() => handleCopyHook(concept.hookScript, idx)}
                type="button"
                className="w-full py-2 px-3 rounded-lg bg-[#1e2f52] hover:bg-[#284070] text-[#7dd3fc] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-[#7dd3fc]/20 active:scale-95"
              >
                {copiedConceptIndex === idx ? (
                  <>
                    <Check size={14} className="text-emerald-400" />
                    <span className="text-emerald-400">تم نسخ السيناريو!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>نسخ السيناريو للإعلان</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-[#111a2f] border border-white/10">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute right-3 top-3 text-[#64748b]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث في أسئلة الزبائن أو أرقامهم..."
            className="w-full pr-9 pl-4 py-2 rounded-lg bg-[#16223b] border border-white/10 text-white text-xs placeholder:text-[#64748b] focus:border-[#7dd3fc] focus:ring-1 focus:ring-[#7dd3fc] outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'أمان وضغط العينين', label: '🛡️ الأمان' },
            { id: 'صداع وأرق وإجهاد', label: '💆‍♂️ الصداع والأرق' },
            { id: 'شحن وتوصيل', label: '🚚 التوصيل' },
            { id: 'سعر وعروض', label: '💰 السعر' },
            { id: 'طلب مباشر', label: '📦 طلبات حجز' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-[#38bdf8] text-slate-950 shadow-md'
                  : 'bg-[#182642] text-[#94a3b8] hover:text-white border border-white/5'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed of Inquiries */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-12 text-center text-[#94a3b8]">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#38bdf8]" />
            <p className="text-xs">جاري تحميل استفسارات واعتراضات العملاء...</p>
          </div>
        ) : filteredInquiries.length === 0 ? (
          <div className="p-12 text-center bg-[#101728] border border-white/5 rounded-2xl">
            <MessageCircle size={32} className="mx-auto mb-2 text-[#475569]" />
            <h4 className="text-sm font-bold text-white mb-1">لا توجد استفسارات مسجلة بعد</h4>
            <p className="text-xs text-[#94a3b8] max-w-md mx-auto">
              بمجرد أن يبدأ زوار متجرك بطرح الأسئلة على الوكيل الذكي، ستظهر فوراً هنا مع التصنيف التلقائي والأفكار الإعلانية المقترحة!
            </p>
          </div>
        ) : (
          filteredInquiries.map((inq) => (
            <div
              key={inq.id}
              className="p-4 rounded-xl bg-[#111c33]/90 border border-white/10 hover:border-[#7dd3fc]/30 transition-all shadow-md flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getCategoryColor(
                      inq.category
                    )}`}
                  >
                    {inq.category}
                  </span>
                  <span className="text-[11px] text-[#64748b]">{inq.dateStr}</span>
                </div>

                {inq.orderData?.phone && (
                  <a
                    href={`https://wa.me/213${inq.orderData.phone.replace(/^0/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-emerald-900 transition-colors"
                  >
                    <MessageCircle size={12} />
                    <span>مراسلة عبر واتساب</span>
                  </a>
                )}
              </div>

              {/* Question & Answer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#182642] border border-white/5">
                  <span className="text-[10px] text-[#38bdf8] font-bold block mb-1">
                    ❓ سؤال أو اعتراض العميل:
                  </span>
                  <p className="text-xs font-semibold text-white leading-relaxed">
                    "{inq.question}"
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0e1628] border border-white/5">
                  <span className="text-[10px] text-emerald-400 font-bold block mb-1">
                    🤖 رد الوكيل الذكي:
                  </span>
                  <p className="text-xs text-[#cbd5e1] leading-relaxed line-clamp-3 hover:line-clamp-none transition-all">
                    {inq.reply}
                  </p>
                </div>
              </div>

              {/* Marketing Hook Idea */}
              {inq.adHookIdea && (
                <div className="p-2.5 rounded-lg bg-[#1a2538]/70 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-200">
                  <Lightbulb size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold text-amber-300">فكرة كرياتيف مستنتجة من هذا السؤال: </span>
                    <span className="text-[#e2e8f0]">{inq.adHookIdea}</span>
                  </div>
                </div>
              )}

              {/* Lead Information if captured */}
              {inq.orderData && (inq.orderData.customerName || inq.orderData.phone) && (
                <div className="flex items-center gap-4 text-[11px] bg-[#0c1220] p-2 rounded-lg border border-cyan-500/20 text-[#a0b4c4]">
                  <span className="font-bold text-[#38bdf8]">بيانات المهتم:</span>
                  {inq.orderData.customerName && (
                    <span className="flex items-center gap-1 text-white">
                      <User size={12} /> {inq.orderData.customerName}
                    </span>
                  )}
                  {inq.orderData.phone && (
                    <span className="flex items-center gap-1 text-white font-mono">
                      <Phone size={12} /> {inq.orderData.phone}
                    </span>
                  )}
                  {inq.orderData.wilaya && (
                    <span className="flex items-center gap-1 text-white">
                      <MapPin size={12} /> {inq.orderData.wilaya}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
