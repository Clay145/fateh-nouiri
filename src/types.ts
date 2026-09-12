export interface PackageOption {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  originalPrice: number;
  discountBadge?: string;
  units: number;
  popular?: boolean;
}

export interface OrderFormData {
  fullName: string;
  phone: string;
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
  wilaya: string;
  commune: string;
  packageTitle: string;
  totalPrice: number;
  date: string;
  createdAt?: number;
  status?: OrderStatus;
  notes?: string;
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
