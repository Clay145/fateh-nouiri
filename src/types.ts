export interface PackageOption {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  originalPrice: number;
  discountBadge?: string;
  units: number;
  popular?: boolean;
  // Meta catalog-style identifier for pixel/CAPI content_ids granularity
  contentId: string;
}

export interface OrderFormData {
  fullName: string;
  phone: string;
  email?: string;
  wilaya: string;
  commune: string;
  notes?: string;
  packageId: string;
}

export type OrderStatus = 'جديد' | 'تم التأكيد' | 'قيد التوصيل' | 'تم التسليم' | 'ملغي';

export interface PlacedOrder {
  id: string;
  orderCode: string;
  customerName: string;
  phone: string;
  email?: string;
  wilaya: string;
  commune: string;
  packageTitle: string;
  totalPrice: number;
  contentId?: string;
  date: string;
  createdAt?: number;
  status?: OrderStatus;
  notes?: string;
  // Meta Pixel & CAPI Deduplication metadata
  currency?: string;
  test_event_code?: string;
  eventId?: string;
  fb_event_id?: string;
  fb_token?: string;
  fb_sent?: number;
  fb_sent_at?: number;
  fbp?: string;
  fbc?: string;
  capiStatus?: 'sent' | 'deduplicated' | 'skipped' | 'test_mode' | 'capi_purchase_disabled';
}

export interface Wilaya {
  code: string;
  nameAr: string;
  nameFr: string;
}

export interface ReviewItem {
  id: string;
  author: string;
  initials: string;
  city: string;
  content: string;
  rating: number;
  isVerified: boolean;
  dateAgo: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface TechFeature {
  number: string;
  title: string;
  headline: string;
  description: string;
  icon: string;
  colSpan?: string;
  tagColor?: string;
  modeName?: string;
}
