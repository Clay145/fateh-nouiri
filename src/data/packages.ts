import { PackageOption } from '../types';

export const STORE_PACKAGES: PackageOption[] = [
  {
    id: 'single',
    name: 'جهاز واحد (شخصي)',
    subtitle: 'توصيل مجاني لـ 58 ولاية + ضمان سنة',
    price: 9500,
    originalPrice: 14900,
    units: 1,
    contentId: 'theoria_eye_massager_single',
  },
  {
    id: 'double',
    name: 'جهازين (العائلة / الأزواج)',
    subtitle: 'هدية مثالية + توصيل مجاني سريع',
    price: 17500,
    originalPrice: 29800,
    discountBadge: 'الأكثر توفيراً (وفر 1,500 دج إضافية)',
    units: 2,
    popular: true,
    contentId: 'theoria_eye_massager_double',
  },
  {
    id: 'triple',
    name: '3 أجهزة (باقة التوفير الكبرى)',
    subtitle: 'أفضل هدية للوالدين والعائلة',
    price: 24900,
    originalPrice: 44700,
    discountBadge: 'وفر 3,600 دج إضافية',
    units: 3,
    contentId: 'theoria_eye_massager_triple',
  },
];
