import React, { useState, useEffect } from 'react';
import { PlacedOrder } from '../types';
import { Package, Truck, Clock, X } from 'lucide-react';

interface OrdersHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrdersHistoryModal: React.FC<OrdersHistoryModalProps> = ({ isOpen, onClose }) => {
  const [orders, setOrders] = useState<PlacedOrder[]>([]);

  useEffect(() => {
    if (isOpen) {
      try {
        const stored = JSON.parse(localStorage.getItem('theoria_orders') || '[]');
        setOrders(stored);
      } catch {
        setOrders([]);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0f1524] border border-[#7dd3fc]/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-right shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 left-5 p-2 text-[#a0b4c4] hover:text-white rounded-full bg-[#1a2438]"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#0e4d6e] text-[#7dd3fc] flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">طلباتي السابقة</h3>
            <p className="text-xs text-[#a0b4c4]">متابعة حالة شحن طلباتك المسجلة</p>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="py-12 text-center text-[#a0b4c4] space-y-3">
            <Package className="w-12 h-12 mx-auto text-gray-600 opacity-40" />
            <p className="text-sm">لم تقم بتسجيل أي طلب بعد في هذه الجلسة.</p>
            <a
              href="#order-form"
              onClick={(e) => {
                e.preventDefault();
                onClose();
                document.getElementById('order-form')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-block mt-2 text-xs font-bold text-[#7dd3fc] hover:underline cursor-pointer"
            >
              انتقل لطلب جهاز Theoria الآن
            </a>
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {orders.map((o) => (
              <div
                key={o.id}
                className="bg-[#141c2e] border border-[#2a3a48] rounded-2xl p-4 space-y-2.5 text-xs text-right"
              >
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <span className="font-mono font-bold text-[#7dd3fc] text-sm">{o.orderCode}</span>
                  <span className="px-2 py-0.5 rounded bg-[#0e4d6e] text-[#c8eaff] text-[10px] font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#7dd3fc]" />
                    قيد المعالجة والتأكيد
                  </span>
                </div>

                <div className="flex justify-between text-[#a0b4c4]">
                  <span>الباقة:</span>
                  <span className="font-semibold text-white">{o.packageTitle}</span>
                </div>

                <div className="flex justify-between text-[#a0b4c4]">
                  <span>العنوان:</span>
                  <span className="font-semibold text-white">
                    {o.wilaya} ({o.commune})
                  </span>
                </div>

                <div className="flex justify-between text-[#a0b4c4]">
                  <span>المبلغ المطلوب:</span>
                  <span className="font-bold text-[#7dd3fc]">
                    {o.totalPrice.toLocaleString('ar-DZ')} دج (الدفع عند الاستلام)
                  </span>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-[#a0b4c4]">
                  <span className="flex items-center gap-1 text-[#7dd3fc]">
                    <Truck className="w-3.5 h-3.5" />
                    توصيل مجاني 58 ولاية
                  </span>
                  <span>{o.date}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
