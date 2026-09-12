import React, { useState } from 'react';
import { INITIAL_REVIEWS } from '../data/reviews';
import { ReviewItem } from '../types';
import { Star, Award, CheckCircle, PlusCircle, MessageSquare, X } from 'lucide-react';

export const ReviewsSection: React.FC = () => {
  const [reviews, setReviews] = useState<ReviewItem[]>(INITIAL_REVIEWS);
  const [modalOpen, setModalOpen] = useState(false);
  const [newAuthor, setNewAuthor] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newRating, setNewRating] = useState(5);
  const [showToast, setShowToast] = useState(false);

  const handleAddReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthor.trim() || !newContent.trim()) return;

    const initials = newAuthor
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('.') || 'ع.ج';

    const newRev: ReviewItem = {
      id: Date.now().toString(),
      author: newAuthor.trim(),
      initials,
      city: newCity.trim() || 'الجزائر',
      content: `"${newContent.trim()}"`,
      rating: newRating,
      isVerified: true,
      dateAgo: 'الآن',
    };

    setReviews([newRev, ...reviews]);
    setModalOpen(false);
    setNewAuthor('');
    setNewCity('');
    setNewContent('');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 4000);
  };

  return (
    <section id="reviews" className="py-12 sm:py-24 px-4 sm:px-6 lg:px-12 max-w-7xl mx-auto w-full overflow-hidden">
      {/* Toast notification for added review */}
      {showToast && (
        <div className="fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 z-50 bg-[#0e4d6e] border border-[#7dd3fc] text-[#c8eaff] px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs sm:text-sm font-bold animate-bounce max-w-[92vw] text-center">
          <CheckCircle className="w-4 sm:w-5 h-4 sm:h-5 text-[#7dd3fc] shrink-0" />
          <span>تمت إضافة تقييمك بنجاح، شكراً لثقتكم في Theoria!</span>
        </div>
      )}

      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12 space-y-3">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7dd3fc] uppercase tracking-wider bg-[#0e4d6e]/40 px-4 py-1 rounded-full border border-[#7dd3fc]/30">
          <Award className="w-3.5 h-3.5" />
          <span>تجارب حقيقية موثقة</span>
        </div>
        <h2 className="text-2xl sm:text-4xl font-headline font-black text-white">
          ماذا يقول عملاؤنا في الجزائر؟
        </h2>
        <p className="text-sm sm:text-base text-[#a0b4c4]">
          أكثر من 3,800 عميل راضٍ تخلصوا من الصداع والأرق بفضل Theoria
        </p>
      </div>

      {/* Reviews Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
        {reviews.slice(0, 6).map((rev) => (
          <div
            key={rev.id}
            id={`review-card-${rev.id}`}
            className="bg-[#141c2e]/60 backdrop-blur-xl border border-[#2a3a48]/50 hover:border-[#7dd3fc]/40 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-xl relative text-right transition-all group"
          >
            {rev.isVerified && (
              <div className="absolute -top-3 right-5 sm:right-6 bg-[#7dd3fc] text-[#001f2e] text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                <span>شراء مؤكد</span>
              </div>
            )}

            <div className="space-y-2.5 sm:space-y-3">
              {/* Star Rating */}
              <div className="flex items-center text-[#ffb800] gap-0.5 pt-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3.5 sm:w-4 h-3.5 sm:h-4 ${
                      i < rev.rating
                        ? 'fill-[#ffb800] text-[#ffb800]'
                        : 'text-gray-600'
                    }`}
                  />
                ))}
                <span className="text-[11px] text-[#a0b4c4] ms-2">
                  {rev.dateAgo}
                </span>
              </div>

              {/* Review Content */}
              <p className="text-xs sm:text-sm text-[#e0e8f0] leading-relaxed font-normal">
                {rev.content}
              </p>
            </div>

            {/* Author info */}
            <div className="flex items-center gap-3 pt-3.5 sm:pt-4 border-t border-white/5 mt-4 sm:mt-5">
              <div className="w-10 h-10 rounded-full bg-[#7dd3fc]/15 border border-[#7dd3fc]/30 text-[#7dd3fc] flex items-center justify-center font-bold text-sm">
                {rev.initials}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{rev.author}</p>
                <p className="text-xs text-[#a0b4c4]">{rev.city}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Review Trigger */}
      <div className="mt-10 text-center">
        <button
          id="open-add-review-btn"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#1a2438] hover:bg-[#202c42] border border-[#7dd3fc]/30 text-sm font-bold text-[#7dd3fc] transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>هل جربت جهاز Theoria؟ شاركنا رأيك</span>
        </button>
      </div>

      {/* Add Review Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f1524] border border-[#7dd3fc]/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-right shadow-2xl relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-5 left-5 p-2 text-[#a0b4c4] hover:text-white rounded-full bg-[#1a2438]"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#0e4d6e] text-[#7dd3fc] flex items-center justify-center">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">إضافة تقييم جديد</h3>
                <p className="text-xs text-[#a0b4c4]">شارك تجربتك لمساعدة الزبائن في اتخاذ قرارهم</p>
              </div>
            </div>

            <form onSubmit={handleAddReview} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0b4c4] mb-1">الاسم الكامل *</label>
                <input
                  type="text"
                  required
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  placeholder="مثال: يوسف معمري"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#141c2e] border border-[#2a3a48] text-white text-sm outline-none focus:border-[#7dd3fc]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0b4c4] mb-1">المدينة أو الولاية</label>
                <input
                  type="text"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="مثال: الجزائر العاصمة، سطيف، قسنطينة..."
                  className="w-full px-4 py-2.5 rounded-xl bg-[#141c2e] border border-[#2a3a48] text-white text-sm outline-none focus:border-[#7dd3fc]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0b4c4] mb-1">التقييم بالنجوم</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setNewRating(s)}
                      className="p-1 text-[#ffb800]"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          s <= newRating ? 'fill-[#ffb800]' : 'text-gray-600'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs text-[#a0b4c4] mr-2 font-bold">{newRating} / 5</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0b4c4] mb-1">تجربتك مع الجهاز *</label>
                <textarea
                  required
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="كيف ساعدك جهاز Theoria في التخلص من الصداع وإجهاد العين؟"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#141c2e] border border-[#2a3a48] text-white text-sm outline-none focus:border-[#7dd3fc] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-transparent border border-white/10 text-sm text-[#a0b4c4] hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#7dd3fc] text-[#001f2e] text-sm font-black hover:bg-[#c8eaff] transition-all"
                >
                  نشر التقييم
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
