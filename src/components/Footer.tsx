import React, { useState } from 'react';
import { ASSETS } from '../data/constants';
import { X } from 'lucide-react';

export const Footer: React.FC = () => {
  const [modalType, setModalType] = useState<'privacy' | 'terms' | 'warranty' | null>(null);

  return (
    <footer id="main-footer" className="w-full bg-[#0a0e1a] border-t border-[#2a3a48]/20 py-8 px-4 sm:px-8 mt-6 overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#a0b4c4]">
        <div className="flex items-center gap-2">
          <img alt="Theoria Logo" width={512} height={279} loading="lazy" decoding="async" className="h-6 w-auto object-contain rounded" src={ASSETS.footerLogo} />
          <span className="font-bold text-white">Theoria Algeria</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <span>توصيل مجاني لـ 58 ولاية</span>
          <span>•</span>
          <span>الدفع عند الاستلام</span>
          <span>•</span>
          <span>خدمة الزبائن متوفرة يومياً</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <button onClick={() => setModalType('privacy')} className="hover:text-white transition-colors cursor-pointer">
            سياسة الخصوصية
          </button>
          <button onClick={() => setModalType('terms')} className="hover:text-white transition-colors cursor-pointer">
            الشروط والأحكام
          </button>
          <button onClick={() => setModalType('warranty')} className="hover:text-white transition-colors cursor-pointer">
            الضمان (14 يوم)
          </button>
        </div>
        <p className="text-[11px]">© 2024 جميع الحقوق محفوظة.</p>
      </div>

      {modalType && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f1524] border border-[#7dd3fc]/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-right shadow-2xl relative">
            <button
              onClick={() => setModalType(null)}
              className="absolute top-5 left-5 p-2 text-[#a0b4c4] hover:text-white rounded-full bg-[#1a2438]"
            >
              <X className="w-5 h-5" />
            </button>

            {modalType === 'privacy' && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white">سياسة الخصوصية وحماية البيانات</h3>
                <p className="text-xs text-[#a0b4c4] leading-relaxed">
                  في متجر Theoria، نلتزم بحماية بياناتك الشخصية بنسبة 100%. لن يتم استخدام رقم هاتفك أو عنوانك إلا لأغراض توصيل طلبيتك من قبل فريق الشحن. لن نشارك بياناتك مع أي طرف ثالث تحت أي ظرف.
                </p>
              </div>
            )}

            {modalType === 'terms' && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white">الشروط والأحكام</h3>
                <p className="text-xs text-[#a0b4c4] leading-relaxed">
                  - الدفع يتم نقداً عند الاستلام فقط وبعد فحص محتوى الطرد.<br />
                  - الشحن مجاني تماماً لجميع الـ 58 ولاية جزائرية.<br />
                  - يستغرق التوصيل بين 24 إلى 48 ساعة من تاريخ تأكيد المكالمة الهاتفية.<br />
                  - يحق للمشتري رفض استلام الطرد إذا لم يتطابق مع المواصفات المذكورة.
                </p>
              </div>
            )}

            {modalType === 'warranty' && (
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white">سياسة الاسترجاع والضمان (14 يوم)</h3>
                <p className="text-xs text-[#a0b4c4] leading-relaxed">
                  نوفر ضمان استبدال مجاني لمدة 14 يوماً في حال وجود أي عيب مصنعي في جهاز Theoria. كما يشمل الجهاز ضمان صيانة لمدة عام كامل. فريق خدمة العملاء متاح 7/7 للمساعدة والمتابعة.
                </p>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-white/10">
              <button
                onClick={() => setModalType(null)}
                className="w-full py-2.5 rounded-xl bg-[#7dd3fc] text-[#001f2e] text-xs font-bold hover:bg-[#c8eaff]"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
