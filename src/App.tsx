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
import { trackPageViewVisitor, trackContentEngagement } from './services/analyticsService';

export default function App() {
  const isInitialAdmin = typeof window !== 'undefined' && (
    window.location.hash === '#admin' ||
    window.location.hash === '#/admin' ||
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin')
  );
  const [viewMode, setViewMode] = useState<'store' | 'admin'>(isInitialAdmin ? 'admin' : 'store');
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

  // Track visitor page view and content engagement on landing page
  useEffect(() => {
    if (viewMode === 'store') {
      trackPageViewVisitor();

      const handleScroll = () => {
        if (window.scrollY > 400) {
          trackContentEngagement();
          window.removeEventListener('scroll', handleScroll);
        }
      };
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [viewMode]);

  useEffect(() => {
    const checkAdminRoute = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      if (hash === '#admin' || pathname === '/admin' || hash === '#/admin') {
        setViewMode('admin');
      } else {
        setViewMode('store');
      }
    };

    checkAdminRoute();
    window.addEventListener('hashchange', checkAdminRoute);
    window.addEventListener('popstate', checkAdminRoute);
    return () => {
      window.removeEventListener('hashchange', checkAdminRoute);
      window.removeEventListener('popstate', checkAdminRoute);
    };
  }, []);

  const handleExitAdmin = () => {
    setViewMode('store');
    if (window.location.hash) {
      window.location.hash = '';
    }
    if (window.location.pathname === '/admin') {
      window.history.pushState(null, '', '/');
    }
  };

  const handleAdminLogout = () => {
    removeAdminToken();
    setIsAdminAuthenticated(false);
    setViewMode('store');
    if (window.location.hash) {
      window.location.hash = '';
    }
    if (window.location.pathname === '/admin') {
      window.history.pushState(null, '', '/');
    }
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

      {/* Footer */}
      <Footer />

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
