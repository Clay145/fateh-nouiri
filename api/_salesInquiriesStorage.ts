import fs from 'fs';
import path from 'path';

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

const INQUIRIES_FILE = path.join(process.cwd(), 'sales_inquiries.json');
const INQUIRIES_BACKUP_FILE = path.join(process.cwd(), 'sales_inquiries.backup.json');

// In-memory cache
let inquiriesCache: CustomerInquiry[] | null = null;

export function categorizeInquiry(question: string): { category: InquiryCategory; adHookIdea: string } {
  const text = (question || '').toLowerCase();

  // 1. Safety & Eye Pressure Objections
  if (
    text.includes('آمن') ||
    text.includes('قرنية') ||
    text.includes('عين') ||
    text.includes('ضغط') ||
    text.includes('خطر') ||
    text.includes('عملية') ||
    text.includes('ليزك') ||
    text.includes('نظر') ||
    text.includes('طبي')
  ) {
    return {
      category: 'أمان وضغط العينين',
      adHookIdea:
        '🎯 هوك إعلاني (Hook): "كنت خايف يضغط على عينيك أو يضرك؟ شوف كيفاش مصممة وسائد ثيوريا الهوائية لعظام الوجه فقط بدون أي ملامسة للقرنية!" (زاوية الأمان والثقة الطبية)',
    };
  }

  // 2. Headache, Insomnia & Screen Fatigue
  if (
    text.includes('صداع') ||
    text.includes('شاشة') ||
    text.includes('شاشات') ||
    text.includes('هاتف') ||
    text.includes('نوم') ||
    text.includes('أرق') ||
    text.includes('رقاد') ||
    text.includes('ميكرين') ||
    text.includes('تعب') ||
    text.includes('دوخة')
  ) {
    return {
      category: 'صداع وأرق وإجهاد',
      adHookIdea:
        '🎯 هوك إعلاني (Hook): "تقضي أكثر من 6 ساعات يومياً في الشاشات وتصحى بالصداع النصفي؟ هكذا تتخلص من إجهاد اليوم كامل في 15 دقيقة فقط قبل النوم!" (زاوية حل المشكلة المؤلمة)',
    };
  }

  // 3. Delivery & Payment Questions
  if (
    text.includes('توصيل') ||
    text.includes('شحن') ||
    text.includes('ولاية') ||
    text.includes('دفع') ||
    text.includes('نخلص') ||
    text.includes('livraison') ||
    text.includes('stopdesk') ||
    text.includes('دار')
  ) {
    return {
      category: 'شحن وتوصيل',
      adHookIdea:
        '🎯 زاوية إعلانية (Angle): "التوصيل مجاني 0 دج حتى باب دارك فـ 58 ولاية، وتفتح الطرد وتجرب الجهاز وتفحصو عاد تخلص الموزع!" (إزالة حاجز الخوف من الشراء عبر الإنترنت)',
    };
  }

  // 4. Price & Discounts
  if (
    text.includes('سعر') ||
    text.includes('شحال') ||
    text.includes('سوم') ||
    text.includes('prix') ||
    text.includes('تخفيض') ||
    text.includes('عرض') ||
    text.includes('بروموسيون')
  ) {
    return {
      category: 'سعر وعروض',
      adHookIdea:
        '🎯 هوك العروض والتوفير: "وفر 1,500 دج اليوم مع عرض باقة الزوجين أو الوالدين + ضمان سنة كاملة وتوصيل مجاني!" (زاوية القيمة المضافة والإهداء)',
    };
  }

  // 5. How it works / Usage
  if (
    text.includes('كيفاش') ||
    text.includes('كيف يعمل') ||
    text.includes('طريقة') ||
    text.includes('موسيقى') ||
    text.includes('بلوتوث') ||
    text.includes('حرارة') ||
    text.includes('بطارية') ||
    text.includes('مدة')
  ) {
    return {
      category: 'طريقة الاستعمال',
      adHookIdea:
        '🎯 كرياتيف UGC (Unboxing & Demo): "فيديو يوضح فتح العلبة، طي الجهاز 180°، ربط البلوتوث بسماع القرآن الكريم، والشعور بالحرارة العلاجية 42°C مباشرة على الوجه!"',
    };
  }

  // 6. Direct purchase intent
  if (
    text.includes('طلب') ||
    text.includes('نكوموندي') ||
    text.includes('نشري') ||
    text.includes('commander') ||
    text.includes('احجز')
  ) {
    return {
      category: 'طلب مباشر',
      adHookIdea:
        '🎯 إعلان إعادة استهداف (Retargeting): "الكمية المخصصة لعرض اليوم قاربت على الانتهاء... احجز جهازك الآن واستفد من التوصيل المجاني قبل انتهاء العرض!"',
    };
  }

  return {
    category: 'استفسار عام',
    adHookIdea:
      '🎯 محتوى إعلاني تفاعلي: الإجابة على استفسارات المتابعين الحقيقية في فيديو ريلز لإظهار المصداقية وبناء الثقة.',
  };
}

export function loadInquiriesFromFile(): CustomerInquiry[] {
  if (inquiriesCache) return inquiriesCache;
  try {
    if (fs.existsSync(INQUIRIES_FILE)) {
      const raw = fs.readFileSync(INQUIRIES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inquiriesCache = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[InquiriesStorage] Failed to read primary file, checking backup:', err);
    try {
      if (fs.existsSync(INQUIRIES_BACKUP_FILE)) {
        const rawB = fs.readFileSync(INQUIRIES_BACKUP_FILE, 'utf-8');
        const parsedB = JSON.parse(rawB);
        if (Array.isArray(parsedB)) {
          inquiriesCache = parsedB;
          return parsedB;
        }
      }
    } catch {
      // ignore
    }
  }
  inquiriesCache = [];
  return [];
}

export function persistInquiries(list: CustomerInquiry[]): void {
  inquiriesCache = list;
  try {
    const dataStr = JSON.stringify(list, null, 2);
    fs.writeFileSync(INQUIRIES_FILE, dataStr, 'utf-8');
    // Mirror to backup
    fs.writeFileSync(INQUIRIES_BACKUP_FILE, dataStr, 'utf-8');
  } catch (err) {
    console.warn('[InquiriesStorage] Persistent write failed (read-only filesystem or quota):', err);
  }
}

export function recordCustomerInquiry(
  question: string,
  reply: string,
  orderData?: CustomerInquiry['orderData']
): CustomerInquiry {
  const list = loadInquiriesFromFile();
  const { category, adHookIdea } = categorizeInquiry(question);

  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-DZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const inquiry: CustomerInquiry = {
    id: `inq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    dateStr,
    question: question.trim(),
    reply: reply.trim(),
    category,
    adHookIdea,
    orderData,
  };

  list.unshift(inquiry);
  // Cap at 1000 items to avoid oversized storage
  persistInquiries(list.slice(0, 1000));
  return inquiry;
}

export function clearInquiries(): void {
  persistInquiries([]);
}
