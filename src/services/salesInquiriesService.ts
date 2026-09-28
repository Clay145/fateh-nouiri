import { CustomerInquiry, CreativeInsightSummary, InquiryCategory } from '../types/inquiries';

const ADMIN_TOKEN_KEY = 'theoria_admin_token';

function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function fetchSalesInquiries(): Promise<CustomerInquiry[]> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/sales-inquiries', {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'فشل تحميل استفسارات العملاء');
  }

  const data = await response.json();
  return Array.isArray(data.inquiries) ? data.inquiries : [];
}

export async function clearSalesInquiries(): Promise<void> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api/sales-inquiries', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'clear' }),
  });

  if (!response.ok) {
    throw new Error('فشل مسح الاستفسارات');
  }
}

export function generateCreativeSummary(inquiries: CustomerInquiry[]): CreativeInsightSummary {
  const categoryCounts: Record<InquiryCategory, number> = {
    'أمان وضغط العينين': 0,
    'صداع وأرق وإجهاد': 0,
    'سعر وعروض': 0,
    'شحن وتوصيل': 0,
    'طريقة الاستعمال': 0,
    'طلب مباشر': 0,
    'استفسار عام': 0,
  };

  inquiries.forEach((inq) => {
    if (categoryCounts[inq.category] !== undefined) {
      categoryCounts[inq.category]++;
    } else {
      categoryCounts['استفسار عام']++;
    }
  });

  // Calculate top objections
  const topObjections = Object.entries(categoryCounts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([topic, count]) => {
      let hook = '';
      if (topic === 'أمان وضغط العينين') hook = 'فيديو يزيل الخوف: تجربة الجهاز وإثبات عدم الضغط على مقلة العين';
      else if (topic === 'صداع وأرق وإجهاد') hook = 'خطاف ألم الشاشات والصداع النصفي قبل النوم';
      else if (topic === 'شحن وتوصيل') hook = 'إعلان المعاينة قبل الدفع والتوصيل المجاني لـ 58 ولاية';
      else if (topic === 'سعر وعروض') hook = 'إعلان باقة التوفير الزوجية (وفر 1,500 دج اليوم)';
      else hook = 'إجابة مباشرة على أسئلة الجمهور';

      return {
        topic,
        count,
        hookIdea: hook,
      };
    });

  // Pre-configured high converting ad concepts based on Algerian eCommerce psychology
  const suggestedAdConcepts = [
    {
      title: '🎯 إعلان معالجة الاعتراض الأول (الأمان الطبي ومحجر العين)',
      targetAudience: 'الموظفون، الطلاب، وكل من يخاف من أجهزة العينين',
      angle: 'إزالة الخوف وبناء الأمان المطلق',
      hookScript:
        '🎙️ السيناريو (أول 3 ثواني): "أكبر غلطة تديرها كي تحس بالصداع وإجهاد الشاشات هي تغمض عينيك وتتحمل! بزاف سقساونا: هل جهاز ثيوريا يضغط على بؤبؤ العين؟ شوف معايا هنا بالتفصيل كيفاش يرتكز فقط على الصدغين ونقاط الوخز الإبري بحرارة 42°C بدون أي لمس لقرنية العين..."',
    },
    {
      title: '💻 إعلان متلازمة إجهاد الشاشات (Screen Fatigue Hook)',
      targetAudience: 'المبرمجون، المصممون، ورواد السوشيال ميديا وعمال المكاتب',
      angle: 'تشخيص الألم اليومي والحل الفوري في 15 دقيقة',
      hookScript:
        '🎙️ السيناريو: "يلا كنت تقضي أكثر من 6 ساعات فاليوم بين التيليفون والميكرو، وتصحى الصباح بعينين حمرين وصداع نصفي... هاد الـ 15 دقيقة قبل ما ترقد رح تبدل حياتك! تدليك هوائي ذكي مع صوت القرآن وبطارية تدوم سمانة كاملة..."',
    },
    {
      title: '📦 إعلان الثقة التامة والتوصيل لـ 58 ولاية (Zero-Risk COD)',
      targetAudience: 'الزبائن المترددون في الشراء عبر الإنترنت',
      angle: 'شراء بدون أي مخاطرة (الدفع بعد الفحص والمعاينة)',
      hookScript:
        '🎙️ السيناريو: "حاب تشري جهاز مساج العينين وخايف ما يوصلكش كيما شفتو؟ مع متجر ثيوريا الرسمي، التوصيل مجاني 0 دج حتى لباب دارك فـ 58 ولاية، حل الطرد، فتش الجهاز وتأكد منو، وعاد خلص الموزع نتاعك مع ضمان استبدال سنة كاملة!"',
    },
  ];

  return {
    totalInquiries: inquiries.length,
    categoryCounts,
    topObjections,
    suggestedAdConcepts,
  };
}
