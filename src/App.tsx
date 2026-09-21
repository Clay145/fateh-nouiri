import { useState, useEffect } from 'react';
import { TopBanner } from './components/TopBanner';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { ProblemSection } from './components/ProblemSection';
import { ClinicalProofSection } from './components/ClinicalProofSection';
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
import { ThankYouPage } from './components/ThankYouPage';

export default function App() {
  const isInitialThankYou = typeof window !== 'undefined' && (
    window.location.pathname === '/thank-you' ||
    window.location.pathname === '/thank-you.php' ||
    window.location.pathname.startsWith('/thank-you') ||
    window.location.hash.startsWith('#/thank-you') ||
    window.location.hash.startsWith('#thank-you')
  );
  const isInitialAdmin = typeof window !== 'undefined' && (
    window.location.hash === '#admin' ||
    window.location.hash === '#/admin' ||
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin')
  );
  const [viewMode, setViewMode] = useState<'store' | 'admin' | 'thank-you'>(
    isInitialThankYou ? 'thank-you' : isInitialAdmin ? 'admin' : 'store'
  );
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

  // Track visitor page view and content engagement on landing page.
  // ViewContent fires immediately on load (bouncers included) with the same
  // once-per-session guards; the scroll listener is a backstop for older marks.
  useEffect(() => {
    if (viewMode === 'store') {
      trackPageViewVisitor();
      trackContentEngagement();

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
    const checkRoute = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      if (
        pathname === '/thank-you' ||
        pathname === '/thank-you.php' ||
        pathname.startsWith('/thank-you') ||
        hash.startsWith('#/thank-you') ||
        hash.startsWith('#thank-you')
      ) {
        setViewMode('thank-you');
      } else if (hash === '#admin' || pathname === '/admin' || hash === '#/admin') {
        setViewMode('admin');
      } else {
        setViewMode('store');
      }
    };

    checkRoute();
    window.addEventListener('hashchange', checkRoute);
    window.addEventListener('popstate', checkRoute);
    return () => {
      window.removeEventListener('hashchange', checkRoute);
      window.removeEventListener('popstate', checkRoute);
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

  // When user visits Thank You page
  if (viewMode === 'thank-you') {
    return <ThankYouPage />;
  }

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

        {/* Problem Agitation + Honest Comparison */}
        <ProblemSection />

        {/* Clinical Graph + 4 Core Mechanisms */}
        <ClinicalProofSection />

        {/* FAQ Section */}
        <FaqSection />

        {/* High Converting Order Checkout Section */}
        <OrderSection onOrderSuccess={handleOrderSuccess} />
      </main>

      {/* Footer */}
      <Footer />

      {/* Spacer so the fixed sticky checkout dock never covers content */}
      <div className="h-24 sm:h-28" aria-hidden="true" />

      {/* Smart Sticky Checkout Dock */}
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
