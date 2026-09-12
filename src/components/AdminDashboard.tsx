import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PlacedOrder, OrderStatus } from '../types';
import { ALGERIA_WILAYAS } from '../data/wilayas';
import {
  getOrders,
  updateOrderStatus,
  deleteOrder,
  submitOrder,
  subscribeToRealtimeOrders,
  playOrderNotificationSound,
} from '../services/orderService';
import {
  ShieldAlert,
  Search,
  Download,
  Plus,
  Phone,
  MessageCircle,
  Trash2,
  CheckCircle2,
  Clock,
  Truck,
  XCircle,
  DollarSign,
  Package,
  TrendingUp,
  Volume2,
  VolumeX,
  Radio,
  RefreshCw,
  Eye,
  ArrowRight,
  Filter,
  Check,
  X,
  AlertCircle,
  FileSpreadsheet,
  LogOut,
} from 'lucide-react';
import { removeAdminToken } from '../services/orderService';

interface AdminDashboardProps {
  onExitDashboard: () => void;
  onLogout?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onExitDashboard, onLogout }) => {
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedWilaya, setSelectedWilaya] = useState<string>('all');

  // Real-time toast notification
  const [newOrderToast, setNewOrderToast] = useState<PlacedOrder | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Manual Add Order Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualWilaya, setManualWilaya] = useState('16 - الجزائر العاصمة');
  const [manualCommune, setManualCommune] = useState('');
  const [manualPackage, setManualPackage] = useState('الباقة الفردية (جهاز واحد Theoria)');
  const [manualPrice, setManualPrice] = useState('9500');
  const [manualNotes, setManualNotes] = useState('');
  const [isAddingOrder, setIsAddingOrder] = useState(false);

  // Active editing note order
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState('');

  // Initial fetch
  const loadInitialOrders = async () => {
    setIsLoading(true);
    const data = await getOrders();
    setOrders(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadInitialOrders();

    // Subscribe to SSE and Broadcast real-time stream
    const unsubscribe = subscribeToRealtimeOrders({
      onNewOrder: (order) => {
        setOrders((prev) => {
          // Avoid duplicate insertion
          if (prev.some((o) => o.id === order.id || o.orderCode === order.orderCode)) {
            return prev.map((o) => (o.id === order.id || o.orderCode === order.orderCode ? order : o));
          }
          return [order, ...prev];
        });

        if (soundEnabled) {
          playOrderNotificationSound();
        }

        // Show Toast
        setNewOrderToast(order);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = window.setTimeout(() => {
          setNewOrderToast(null);
        }, 6000);
      },
      onUpdateOrder: (order) => {
        setOrders((prev) => prev.map((o) => (o.id === order.id || o.orderCode === order.orderCode ? order : o)));
      },
      onDeleteOrder: (id) => {
        setOrders((prev) => prev.filter((o) => o.id !== id && o.orderCode !== id));
      },
      onConnectionChange: (connected) => {
        setIsConnected(connected);
      },
    });

    return () => {
      unsubscribe();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [soundEnabled]);

  // Status Change Handler
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    // optimistic update
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    await updateOrderStatus(orderId, newStatus);
  };

  // Save Note Handler
  const handleSaveNote = async (orderId: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, notes: tempNoteText } : o)));
    await updateOrderStatus(orderId, undefined, tempNoteText);
    setEditingNoteId(null);
  };

  // Delete Order Handler
  const handleDeleteOrder = async (orderId: string, customerName: string) => {
    if (window.confirm(`هل أنت متأكد من حذف طلب العميل: ${customerName}؟`)) {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      await deleteOrder(orderId);
    }
  };

  // Trigger Sample Real-Time Order for testing
  const handleCreateTestOrder = async () => {
    const randomWilaya = ALGERIA_WILAYAS[Math.floor(Math.random() * ALGERIA_WILAYAS.length)];
    const names = ['سفيان بن علي', 'إيمان بلقاسم', 'حمزة زروقي', 'ليلى مرابط', 'عبد القادر شريف', 'مريم حداد'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomPhone = `05${Math.floor(10000000 + Math.random() * 89999999)}`;

    await submitOrder({
      customerName: randomName,
      phone: randomPhone,
      wilaya: `${randomWilaya.code} - ${randomWilaya.nameAr}`,
      commune: `وسط مدينة ${randomWilaya.nameAr}`,
      packageTitle: 'الباقة الفردية (جهاز واحد Theoria)',
      totalPrice: 9500,
      notes: 'طلب تجريبي سريع لاختبار البث الحي في لوحة التحكم',
    });
  };

  // Submit Manual Order
  const handleManualOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualPhone.trim()) return;

    setIsAddingOrder(true);
    await submitOrder({
      customerName: manualName.trim(),
      phone: manualPhone.trim(),
      wilaya: manualWilaya,
      commune: manualCommune.trim() || 'وسط المدينة',
      packageTitle: manualPackage,
      totalPrice: parseInt(manualPrice, 10) || 9500,
      notes: manualNotes.trim() || 'طلب مدخل يدوياً من الإدارة',
    });

    setIsAddingOrder(false);
    setIsAddModalOpen(false);
    setManualName('');
    setManualPhone('');
    setManualCommune('');
    setManualNotes('');
  };

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Search
      const searchMatch =
        !searchTerm.trim() ||
        order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone.includes(searchTerm) ||
        order.orderCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.wilaya.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.commune.toLowerCase().includes(searchTerm.toLowerCase());

      // Status
      const statusMatch = selectedStatus === 'all' || (order.status || 'جديد') === selectedStatus;

      // Wilaya
      const wilayaMatch = selectedWilaya === 'all' || order.wilaya.includes(selectedWilaya);

      return searchMatch && statusMatch && wilayaMatch;
    });
  }, [orders, searchTerm, selectedStatus, selectedWilaya]);

  // Analytics Metrics
  const stats = useMemo(() => {
    const total = orders.length;
    const active = orders.filter((o) => o.status !== 'ملغي');
    const totalRevenue = active.reduce((sum, o) => sum + (o.totalPrice || 0), 0);
    const newCount = orders.filter((o) => !o.status || o.status === 'جديد').length;
    const confirmedCount = orders.filter((o) => o.status === 'تم التأكيد').length;
    const shippingCount = orders.filter((o) => o.status === 'قيد التوصيل').length;
    const deliveredCount = orders.filter((o) => o.status === 'تم التسليم').length;
    const cancelledCount = orders.filter((o) => o.status === 'ملغي').length;

    const confirmationRate = total > 0 ? Math.round(((total - cancelledCount - newCount) / total) * 100) : 0;

    return {
      total,
      totalRevenue,
      newCount,
      confirmedCount,
      shippingCount,
      deliveredCount,
      cancelledCount,
      confirmationRate,
    };
  }, [orders]);

  // Export CSV for Shipping Agencies (Yalidine / ZR Express format)
  const exportToCSV = () => {
    const headers = ['رمز الطلب', 'اسم العميل', 'رقم الهاتف', 'الولاية', 'البلدية / العنوان', 'الباقة', 'المبلغ (د.ج)', 'الحالة', 'تاريخ الطلب', 'ملاحظات'];
    const rows = filteredOrders.map((o) => [
      o.orderCode,
      `"${o.customerName.replace(/"/g, '""')}"`,
      `"${o.phone}"`,
      `"${o.wilaya}"`,
      `"${o.commune.replace(/"/g, '""')}"`,
      `"${o.packageTitle}"`,
      o.totalPrice,
      o.status || 'جديد',
      o.date,
      `"${(o.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `طلبات_Theoria_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status?: OrderStatus) => {
    switch (status) {
      case 'تم التأكيد':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
            تم التأكيد
          </span>
        );
      case 'قيد التوصيل':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            <Truck className="w-3 h-3 text-purple-400" />
            قيد التوصيل
          </span>
        );
      case 'تم التسليم':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            تم التسليم
          </span>
        );
      case 'ملغي':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
            <XCircle className="w-3 h-3 text-red-400" />
            ملغي
          </span>
        );
      case 'جديد':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse">
            <Clock className="w-3 h-3 text-amber-400" />
            جديد (يحتاج اتصال)
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-['Cairo',sans-serif] selection:bg-[#7dd3fc]/30" dir="rtl">
      {/* Real-time Order Toast Alert */}
      {newOrderToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg bg-gradient-to-r from-[#14233c] to-[#0f172a] border-2 border-emerald-400/80 rounded-2xl p-4 shadow-[0_10px_40px_rgba(16,185,129,0.3)] animate-bounce flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 shrink-0">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-md">
                  طلب وارد الآن ⚡
                </span>
                <span className="text-xs text-slate-400">{newOrderToast.orderCode}</span>
              </div>
              <p className="font-bold text-base text-white mt-1">
                {newOrderToast.customerName} - {newOrderToast.wilaya}
              </p>
              <p className="text-xs text-emerald-300 font-semibold">
                {newOrderToast.totalPrice.toLocaleString()} د.ج • {newOrderToast.phone}
              </p>
            </div>
          </div>
          <button
            onClick={() => setNewOrderToast(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/90 backdrop-blur-xl border-b border-slate-800 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7dd3fc] to-blue-600 flex items-center justify-center font-black text-slate-950 text-xl shadow-[0_0_20px_rgba(125,211,252,0.3)]">
            T
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">لوحة تحكم Theoria</h1>
              <span className="text-[11px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-full">
                إدارة الطلبات الحية
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {isConnected ? 'متصل بالبث اللحظي (Live Stream)' : 'جارِ الاتصال بالبث الحي...'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              soundEnabled
                ? 'bg-slate-800/80 text-emerald-300 border-emerald-500/30 hover:bg-slate-800'
                : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800'
            }`}
            title={soundEnabled ? 'صوت التنبيهات مفعّل' : 'صوت التنبيهات مكتوم'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            <span className="hidden sm:inline">{soundEnabled ? 'التنبيه الصوتي شغال' : 'كتم الصوت'}</span>
          </button>

          {/* Test Order Trigger Button */}
          <button
            onClick={handleCreateTestOrder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 transition"
            title="محاكاة طلب جديد لاختبار وصول البيانات لحظياً"
          >
            <Radio className="w-4 h-4 text-purple-400 animate-pulse" />
            <span className="hidden sm:inline">تجربة طلب حي</span>
          </button>

          {/* Refresh button */}
          <button
            onClick={loadInitialOrders}
            className="p-2 rounded-xl text-slate-300 bg-slate-800/70 hover:bg-slate-800 border border-slate-700 transition"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {/* Return to Store */}
          <button
            onClick={onExitDashboard}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-[#7dd3fc] text-slate-950 hover:bg-[#60a5fa] transition shadow-[0_0_20px_rgba(125,211,252,0.2)]"
          >
            <span>معاينة المتجر</span>
            <Eye className="w-4 h-4" />
          </button>

          {/* Logout Button */}
          <button
            onClick={() => {
              removeAdminToken();
              if (onLogout) {
                onLogout();
              } else {
                onExitDashboard();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 transition"
            title="تسجيل الخروج وقفل لوحة الإدارة"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">قفل اللوحة</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* KPI Cards Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Total Revenue */}
          <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-[#7dd3fc]/40 transition">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400">إجمالي المداخيل</span>
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {stats.totalRevenue.toLocaleString()} <span className="text-sm font-normal text-slate-400">د.ج</span>
            </div>
            <div className="text-xs text-slate-400 mt-2 flex items-center gap-1">
              <span className="text-emerald-400 font-bold">من {stats.total} طلب</span>
              <span>مسجل</span>
            </div>
          </div>

          {/* New Orders Pending */}
          <div className="bg-[#0f172a]/80 backdrop-blur border border-amber-500/30 rounded-2xl p-5 relative overflow-hidden group hover:border-amber-400 transition">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-amber-300">طلبات جديدة (تحتاج تأكيد)</span>
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center animate-pulse">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-300 tracking-tight">
              {stats.newCount} <span className="text-sm font-normal text-slate-400">طلب</span>
            </div>
            <div className="text-xs text-amber-400/80 mt-2 font-semibold">
              اتصل بالزبائن لتأكيد الشحن فوراً
            </div>
          </div>

          {/* Confirmed / In Delivery */}
          <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-purple-500/40 transition">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400">قيد التوصيل والجاهزة</span>
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                <Truck className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {stats.confirmedCount + stats.shippingCount} <span className="text-sm font-normal text-slate-400">شحنة</span>
            </div>
            <div className="text-xs text-slate-400 mt-2">
              {stats.shippingCount} مع شركات الشحن حالياً
            </div>
          </div>

          {/* Confirmation / Success Rate */}
          <div className="bg-[#0f172a]/80 backdrop-blur border border-slate-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-emerald-500/40 transition">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400">نسبة التأكيد والتسليم</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
              {stats.confirmationRate}%
            </div>
            <div className="text-xs text-slate-400 mt-2">
              {stats.deliveredCount} طلب تم تسليمه بنجاح
            </div>
          </div>
        </section>

        {/* Action Controls & Filters Bar */}
        <section className="bg-[#0f172a]/90 backdrop-blur border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث باسم الزبون، رقم الهاتف، رمز الطلب، أو الولاية..."
                className="w-full pr-10 pl-4 py-2.5 bg-[#090d16] border border-slate-700/80 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#7dd3fc]"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة طلب يدوي</span>
              </button>

              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
                title="تصدير جدول الطلبات إلى ملف Excel/CSV للتوصيل"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>تصدير Excel (CSV)</span>
              </button>
            </div>
          </div>

          {/* Status Filter Tabs & Wilaya Filter */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
              {[
                { id: 'all', label: 'جميع الطلبات', count: stats.total },
                { id: 'جديد', label: 'جديد', count: stats.newCount, color: 'text-amber-400' },
                { id: 'تم التأكيد', label: 'تم التأكيد', count: stats.confirmedCount, color: 'text-blue-400' },
                { id: 'قيد التوصيل', label: 'قيد التوصيل', count: stats.shippingCount, color: 'text-purple-400' },
                { id: 'تم التسليم', label: 'تم التسليم', count: stats.deliveredCount, color: 'text-emerald-400' },
                { id: 'ملغي', label: 'ملغي', count: stats.cancelledCount, color: 'text-red-400' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedStatus(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                    selectedStatus === tab.id
                      ? 'bg-[#7dd3fc] text-slate-950 shadow'
                      : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 border border-slate-700/50'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                      selectedStatus === tab.id ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Wilaya Filter Dropdown */}
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedWilaya}
                onChange={(e) => setSelectedWilaya(e.target.value)}
                className="bg-[#090d16] border border-slate-700 text-xs text-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#7dd3fc] w-full sm:w-auto"
              >
                <option value="all">كل الولايات الجزائرية</option>
                {ALGERIA_WILAYAS.map((w) => (
                  <option key={w.code} value={w.nameAr}>
                    {w.code} - {w.nameAr}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Orders Table Container */}
        <section className="bg-[#0f172a]/90 backdrop-blur border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-black text-white text-base sm:text-lg">بيانات العملاء والطلبات</h2>
              <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-lg border border-slate-700">
                {filteredOrders.length} طلب معروض
              </span>
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">
              يتم تحديث الطلبات تلقائياً فور تسجيل أي عميل جديد
            </span>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-slate-300 font-bold text-base">لا توجد طلبات مطابقة لمعايير البحث</p>
              <p className="text-slate-500 text-xs max-w-sm mx-auto">
                جرب تغيير كلمة البحث أو إعادة تعيين الفلاتر لعرض كافة طلبات المتجر
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedStatus('all');
                  setSelectedWilaya('all');
                }}
                className="mt-2 text-xs text-[#7dd3fc] hover:underline font-bold"
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-[#090e1a] text-slate-400 text-xs font-bold border-b border-slate-800 uppercase">
                  <tr>
                    <th className="py-3.5 px-4">رمز الطلب والوقت</th>
                    <th className="py-3.5 px-4">العميل ورقم الهاتف</th>
                    <th className="py-3.5 px-4">الولاية والبلدية</th>
                    <th className="py-3.5 px-4">الباقة المختارة</th>
                    <th className="py-3.5 px-4">المبلغ الإجمالي</th>
                    <th className="py-3.5 px-4">حالة الطلب</th>
                    <th className="py-3.5 px-4">ملاحظات والتأكيد</th>
                    <th className="py-3.5 px-4 text-center">إجراءات سريعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-200 font-medium">
                  {filteredOrders.map((order) => {
                    // WhatsApp message pre-fill
                    const cleanPhone213 = order.phone.startsWith('0')
                      ? '213' + order.phone.substring(1)
                      : order.phone;
                    const waMessage = encodeURIComponent(
                      `السلام عليكم ${order.customerName}، معك خدمة عملاء متجر Theoria بخصوص طلبك لجهاز مساج العينين الذكي (${order.orderCode}) في ولاية ${order.wilaya}. هل تؤكد لنا العنوان لتسليمه لشركة التوصيل؟`
                    );

                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-slate-800/40 transition ${
                          order.status === 'جديد' || !order.status ? 'bg-amber-500/[0.03]' : ''
                        }`}
                      >
                        {/* Order Code & Date */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-white text-sm flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#7dd3fc]"></span>
                            {order.orderCode}
                          </div>
                          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{order.date}</span>
                          </div>
                        </td>

                        {/* Customer Info */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="font-bold text-white text-base">{order.customerName}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <a
                              href={`tel:${order.phone}`}
                              className="font-mono text-xs text-[#7dd3fc] hover:underline flex items-center gap-1"
                              dir="ltr"
                            >
                              <Phone className="w-3 h-3" />
                              {order.phone}
                            </a>
                          </div>
                        </td>

                        {/* Wilaya & Address */}
                        <td className="py-4 px-4">
                          <div className="font-bold text-slate-200 text-sm">{order.wilaya}</div>
                          <div className="text-xs text-slate-400 truncate max-w-[200px]" title={order.commune}>
                            {order.commune || 'وسط المدينة'}
                          </div>
                        </td>

                        {/* Package */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="text-xs font-semibold text-slate-300 max-w-[170px] truncate" title={order.packageTitle}>
                            {order.packageTitle}
                          </div>
                        </td>

                        {/* Price */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="font-black text-[#7dd3fc] text-base">
                            {order.totalPrice.toLocaleString()} <span className="text-xs text-slate-400">د.ج</span>
                          </div>
                          <div className="text-[11px] text-emerald-400 font-semibold">الدفع عند الاستلام</div>
                        </td>

                        {/* Status Changer */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="space-y-1.5">
                            <div>{getStatusBadge(order.status)}</div>
                            <select
                              value={order.status || 'جديد'}
                              onChange={(e) => handleStatusChange(order.id, e.target.value as OrderStatus)}
                              className="bg-[#090d16] border border-slate-700 text-xs text-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#7dd3fc] cursor-pointer"
                            >
                              <option value="جديد">جديد</option>
                              <option value="تم التأكيد">تم التأكيد</option>
                              <option value="قيد التوصيل">قيد التوصيل</option>
                              <option value="تم التسليم">تم التسليم</option>
                              <option value="ملغي">ملغي</option>
                            </select>
                          </div>
                        </td>

                        {/* Notes */}
                        <td className="py-4 px-4 min-w-[180px]">
                          {editingNoteId === order.id ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={tempNoteText}
                                onChange={(e) => setTempNoteText(e.target.value)}
                                rows={2}
                                className="w-full text-xs p-1.5 bg-[#090d16] border border-blue-500 rounded-lg text-white focus:outline-none"
                                placeholder="ملاحظات حول المكالمة أو الشحن..."
                              />
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleSaveNote(order.id)}
                                  className="text-[11px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold hover:bg-blue-500"
                                >
                                  حفظ
                                </button>
                                <button
                                  onClick={() => setEditingNoteId(null)}
                                  className="text-[11px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded"
                                >
                                  إلغاء
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingNoteId(order.id);
                                setTempNoteText(order.notes || '');
                              }}
                              className="text-xs text-slate-400 hover:text-white cursor-pointer group flex items-start gap-1 p-1 rounded hover:bg-slate-800/50"
                              title="انقر لتعديل الملاحظة"
                            >
                              <span className="line-clamp-2 italic">
                                {order.notes ? order.notes : '+ إضافة ملاحظة للمكالمة'}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Quick Contact & Action Buttons */}
                        <td className="py-4 px-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            {/* WhatsApp Direct Action */}
                            <a
                              href={`https://wa.me/${cleanPhone213}?text=${waMessage}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 transition"
                              title="مراسلة العميل عبر واتساب"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>

                            {/* Direct Call Button */}
                            <a
                              href={`tel:${order.phone}`}
                              className="p-2 rounded-xl bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/30 transition"
                              title="اتصال هاتفي مباشر"
                            >
                              <Phone className="w-4 h-4" />
                            </a>

                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteOrder(order.id, order.customerName)}
                              className="p-2 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition"
                              title="حذف الطلب"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Manual Order Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-700 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-5 left-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-black text-white mb-1">تسجيل طلب زبون يدوياً</h3>
            <p className="text-xs text-slate-400 mb-6">
              أدخل بيانات الزبون الواردة عبر الهاتف أو رسائل الصفحة مباشرة إلى النظام
            </p>

            <form onSubmit={handleManualOrderSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">الاسم واللقب *</label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="مثال: فاروق بن عيسى"
                  className="w-full px-4 py-2.5 bg-[#090d16] border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-[#7dd3fc]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">رقم الهاتف (الجزائر) *</label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  placeholder="05 / 06 / 07 ..."
                  className="w-full px-4 py-2.5 bg-[#090d16] border border-slate-700 rounded-xl text-sm text-white text-right focus:outline-none focus:border-[#7dd3fc]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">الولاية *</label>
                  <select
                    value={manualWilaya}
                    onChange={(e) => setManualWilaya(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#090d16] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#7dd3fc]"
                  >
                    {ALGERIA_WILAYAS.map((w) => (
                      <option key={w.code} value={`${w.code} - ${w.nameAr}`}>
                        {w.code} - {w.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">البلدية / العنوان</label>
                  <input
                    type="text"
                    value={manualCommune}
                    onChange={(e) => setManualCommune(e.target.value)}
                    placeholder="مثال: الرويبة، حي النصر"
                    className="w-full px-3 py-2.5 bg-[#090d16] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#7dd3fc]"
                  >
                  </input>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">الباقة المطلوبة</label>
                  <select
                    value={manualPackage}
                    onChange={(e) => {
                      setManualPackage(e.target.value);
                      if (e.target.value.includes('جهاز واحد')) setManualPrice('9500');
                      else if (e.target.value.includes('جهازين')) setManualPrice('16900');
                      else setManualPrice('23500');
                    }}
                    className="w-full px-3 py-2.5 bg-[#090d16] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#7dd3fc]"
                  >
                    <option value="الباقة الفردية (جهاز واحد Theoria)">الباقة الفردية (جهاز واحد)</option>
                    <option value="باقة الراحة الكاملة (جهازين Theoria)">باقة الراحة الكاملة (جهازين)</option>
                    <option value="باقة العائلة والشركاء (3 أجهزة Theoria)">باقة العائلة والشركاء (3 أجهزة)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">المبلغ الإجمالي (د.ج)</label>
                  <input
                    type="number"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#090d16] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#7dd3fc]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">ملاحظات إضافية</label>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={2}
                  placeholder="ملاحظات وقت الاتصال، تعليمات التوصيل..."
                  className="w-full px-3 py-2 bg-[#090d16] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-[#7dd3fc]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isAddingOrder}
                  className="px-6 py-2.5 text-xs font-bold bg-[#7dd3fc] text-slate-950 rounded-xl hover:bg-[#60a5fa] transition"
                >
                  {isAddingOrder ? 'جارِ الحفظ...' : 'حفظ الطلب وبثه فوراً'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
