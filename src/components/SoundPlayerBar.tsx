import React, { useState, useEffect } from 'react';
import { relaxAudio } from '../utils/soundEngine';
import { Volume2, VolumeX, Waves, CloudRain, Sparkles, X } from 'lucide-react';
import { trackAddToCartClick, trackFormOpened } from '../services/analyticsService';

interface SoundPlayerBarProps {
  isOpen: boolean;
  onClose: () => void;
  onStateChange: (isPlaying: boolean) => void;
}

export const SoundPlayerBar: React.FC<SoundPlayerBarProps> = ({
  isOpen,
  onClose,
  onStateChange,
}) => {
  const [activeTrack, setActiveTrack] = useState<'waves' | 'rain' | 'binaural' | 'none'>('none');

  const tracks = [
    {
      id: 'waves' as const,
      name: 'أمواج البحر الهادئة',
      desc: 'صوت خرير وأمواج طبيعية لتهدئة الأعصاب',
      icon: Waves,
    },
    {
      id: 'rain' as const,
      name: 'زخات المطر الاستوائي',
      desc: 'صوت قطرات المطر العذبة للنوم العميق',
      icon: CloudRain,
    },
    {
      id: 'binaural' as const,
      name: 'ترددات ثيتا للتأمل (432Hz)',
      desc: 'نغمات استرخاء لتصفية الذهن من الصداع',
      icon: Sparkles,
    },
  ];

  const handlePlayTrack = (trackId: 'waves' | 'rain' | 'binaural') => {
    if (activeTrack === trackId) {
      relaxAudio.stop();
      setActiveTrack('none');
      onStateChange(false);
    } else {
      relaxAudio.play(trackId);
      setActiveTrack(trackId);
      onStateChange(true);
    }
  };

  const handleStop = () => {
    relaxAudio.stop();
    setActiveTrack('none');
    onStateChange(false);
  };

  useEffect(() => {
    return () => {
      relaxAudio.stop();
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#0f1524] border border-[#7dd3fc]/30 rounded-3xl p-5 sm:p-8 max-w-lg w-full text-right shadow-[0_0_50px_rgba(125,211,252,0.2)] relative overflow-hidden my-auto">
        <button
          onClick={() => {
            handleStop();
            onClose();
          }}
          className="absolute top-4 left-4 sm:top-5 sm:left-5 p-2 text-[#a0b4c4] hover:text-white rounded-full bg-[#1a2438] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#3d2060] border border-[#c8a0f0]/30 text-[#c8a0f0] flex items-center justify-center">
            <Volume2 className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">تجربة الصوت المحيطي المدمج</h3>
            <p className="text-xs text-[#a0b4c4]">
              الجهاز مزود بسماعات محيطية يمكنك ربطها بالبلوتوث للاستماع للقرآن الكريم أو أصوات الاسترخاء الطبيعية
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {tracks.map((t) => {
            const Icon = t.icon;
            const isPlaying = activeTrack === t.id;
            return (
              <div
                key={t.id}
                onClick={() => handlePlayTrack(t.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                  isPlaying
                    ? 'border-[#7dd3fc] bg-[#0e4d6e]/40 shadow-[0_0_20px_rgba(125,211,252,0.2)]'
                    : 'border-[#2a3a48]/60 bg-[#141c2e] hover:border-[#7dd3fc]/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      isPlaying
                        ? 'bg-[#7dd3fc] text-[#001f2e]'
                        : 'bg-[#1a2438] text-[#7dd3fc]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{t.name}</h4>
                    <p className="text-xs text-[#a0b4c4]">{t.desc}</p>
                  </div>
                </div>

                <div className="text-left shrink-0">
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                      isPlaying
                        ? 'bg-[#7dd3fc] text-[#001f2e]'
                        : 'bg-[#1a2438] text-[#a0b4c4]'
                    }`}
                  >
                    {isPlaying ? 'جاري التشغيل ⏸' : 'تشغيل ▶'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {activeTrack !== 'none' && (
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
            <button
              onClick={handleStop}
              className="text-xs text-[#ff6b6b] hover:underline flex items-center gap-1.5 font-bold"
            >
              <VolumeX className="w-4 h-4" />
              <span>إيقاف الصوت</span>
            </button>
            <span className="text-xs text-[#7dd3fc] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#7dd3fc] animate-ping"></span>
              مستوى صوت آمن للأذن أثناء جلسة المساج
            </span>
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={() => {
              trackAddToCartClick('مشغل الصوت الاسترخائي - زر الطلب');
              trackFormOpened('نقر مشغل الصوت');
              onClose();
              const el = document.getElementById('order-form');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="w-full py-3 rounded-xl bg-[#7dd3fc] text-[#001f2e] text-sm font-black hover:bg-[#c8eaff] transition-all"
          >
            اطلب جهاز Theoria الآن للاستمتاع بالجلسات كاملة
          </button>
        </div>
      </div>
    </div>
  );
};
