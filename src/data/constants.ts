// Self-hosted WebP (public/img/*) — same-origin, immutable-cached, no
// cross-origin DNS/TLS on the LCP path. Regenerate with PIL if source art
// changes; keep width/height attrs on <img> tags in sync with these files.
export const ASSETS = {
  logo: '/img/logo.webp',
  lifestyle: '/img/lifestyle.webp',
  deviceFolded: '/img/device-folded.webp',
  clinicalChart: '/img/clinical-chart.webp',
  comparison: '/img/comparison.webp',
  footerLogo: '/img/footer-logo.webp',
};

export const STORE_INFO = {
  name: 'Theoria',
  arabicName: 'ثيوريا',
  tagline: 'Theoria Luxury Eye Massager',
  phone: '0550 00 00 00',
  freeShippingNote: 'توصيل مجاني لـ 58 ولاية + الدفع عند الاستلام',
  guaranteeText: 'ضمان استبدال 14 يوم + ضمان سنة كاملة',
};
