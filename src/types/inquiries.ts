export type InquiryCategory =
  | 'أمان وضغط العينين'
  | 'صداع وأرق وإجهاد'
  | 'سعر وعروض'
  | 'شحن وتوصيل'
  | 'طريقة الاستعمال'
  | 'طلب مباشر'
  | 'استفسار عام';

export interface CustomerInquiry {
  id: string;
  timestamp: number;
  dateStr: string;
  question: string;
  reply: string;
  category: InquiryCategory;
  adHookIdea: string;
  orderData?: {
    customerName?: string;
    phone?: string;
    wilaya?: string;
    commune?: string;
    packageId?: string;
  };
}

export interface CreativeInsightSummary {
  totalInquiries: number;
  categoryCounts: Record<InquiryCategory, number>;
  topObjections: Array<{ topic: string; count: number; hookIdea: string }>;
  suggestedAdConcepts: Array<{
    title: string;
    targetAudience: string;
    hookScript: string;
    angle: string;
  }>;
}
