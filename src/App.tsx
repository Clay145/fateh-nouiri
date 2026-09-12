import { useState, useEffect } from 'react';
import { TopBanner } from './components/TopBanner';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ProblemSection } from './components/ProblemSection';
import { ClinicalProofSection } from './components/ClinicalProofSection';
import { FeaturesSection } from './components/FeaturesSection';
import { ReviewsSection } from './components/ReviewsSection';
import { FaqSection } from './components/FaqSection';
import { OrderSection } from './components/OrderSection';
import { Footer } from './components/Footer';
import { FloatingMobileBar } from './components/FloatingMobileBar';
import { SoundPlayerBar } from './components/SoundPlayerBar';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { OrdersHistoryModal } from './components/OrdersHistoryModal';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminAuthGate } from './components/AdminAuthGate';
import { PlacedOrder } from './types';
import { verifyAdminSession, removeAdminToken } from './services/orderService';

export default function App() {
  const [viewMode, setViewMode] = useState<'store' | 'admin'>('store');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [soundModalOpen, setSoundModalOpen] = useState(false);
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [successfulOrder, setSuccessfulOrder] = useState<PlacedOrder | null>(null);

  // Check auth session on startup
  useEffect(() => {
    async function checkAuth() {
      try {
        const valid = await verifyAdminSession();
        setIsAdminAuthenticated(valid);
      } catch {
        setIsAdminAuthenticated(false);
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#admin') {
        setViewMode('admin');
      } else if (window.location.hash === '#store' || window.location.hash === '') {
        setViewMode('store');
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleOpenAdmin = () => {
    setViewMode('admin');
    window.location.hash = 'admin';
  };

  const handleExitAdmin = () => {
    setViewMode('store');
    window.location.hash = '';
  };

  const handleAdminLogout = () => {
    removeAdminToken();
    setIsAdminAuthenticated(false);
    setViewMode('store');
    window.location.hash = '';
  };

  const handleOrderSuccess = (order: PlacedOrder) => {
    setSuccessfulOrder(order);
  };

  // When user enters admin route
  if (viewMode === 'admin') {
    if (!isAdminAuthenticated) {
      return (
        <AdminAuthGate
          onAuthenticated={() => setIsAdminAuthenticated(true)}
          onExit={handleExitAdmin}
        />
      );
    }
    return (
      <AdminDashboard
        onExitDashboard={handleExitAdmin}
        onLogout={handleAdminLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#e0e8f0] flex flex-col selection:bg-[#7dd3fc]/30 selection:text-[#7dd3fc] w-full max-w-full overflow-x-hidden">
      {/* Top Banner with countdown */}
      <TopBanner />

      {/* Main Sticky Navbar - Clean customer navigation without admin button */}
      <Navbar
        onOpenSoundPreview={() => setSoundModalOpen(true)}
        onOpenOrdersHistory={() => setHistoryModalOpen(true)}
        soundPlaying={soundPlaying}
      />

      {/* Main Content Sections */}
      <main className="flex-1 w-full max-w-full flex flex-col items-center overflow-x-hidden">
        {/* Hero Section */}
        <HeroSection
          onOpenSoundPreview={() => setSoundModalOpen(true)}
          soundPlaying={soundPlaying}
        />

        {/* Problem Agitation Section */}
        <ProblemSection />

        {/* Scientific Proof & Comparison Graph */}
        <ClinicalProofSection />

        {/* 5 Therapeutic Technologies */}
        <FeaturesSection
          onOpenSoundPreview={() => setSoundModalOpen(true)}
        />

        {/* Real Customer Testimonials (Algerian Social Proof) */}
        <ReviewsSection />

        {/* FAQ Section */}
        <FaqSection />

        {/* High Converting Order Checkout Section */}
        <OrderSection onOrderSuccess={handleOrderSuccess} />
      </main>

      {/* Footer with secure admin lock shortcut */}
      <Footer onOpenAdmin={handleOpenAdmin} />

      {/* Mobile Sticky Quick Order Bar */}
      <FloatingMobileBar />

      {/* Ambient Relaxation Sound Player Modal */}
      <SoundPlayerBar
        isOpen={soundModalOpen}
        onClose={() => setSoundModalOpen(false)}
        onStateChange={(playing) => setSoundPlaying(playing)}
      />

      {/* Order Confirmation Receipt Modal */}
      <OrderSuccessModal
        order={successfulOrder}
        onClose={() => setSuccessfulOrder(null)}
      />

      {/* Orders History & Tracking Modal */}
      <OrdersHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
      />
    </div>
  );
}
