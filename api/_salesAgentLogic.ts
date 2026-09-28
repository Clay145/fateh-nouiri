import { GoogleGenAI } from '@google/genai';
import { recordCustomerInquiry } from './_salesInquiriesStorage.js';

export const THEORIA_SALES_PROMPT = `
أنت "مستشار ثيوريا الذكي" (Theoria Sales & Wellness Consultant)، خبير المبيعات والاسترخاء الرسمي لمتجر "Theoria" في الجزائر.
مهمتك الأساسية هي الترحيب بالزوار، فهم احتياجاتهم الصحية واليومية (الصداع النصفي، إجهاد العينين من الشاشات والهواتف، الأرق وصعوبة النوم، الهالات السوداء والانتفاخ)، إزالة أي تردد وتخوف لديهم بخصوص جهاز مساج العينين الذكي، وإغلاق المبيعات بسلاسة واحترافية فائقة.

### 🌟 شخصيتك وأسلوبك (Persona & Tone):
- **ودود، راقٍ، وخبير:** تتحدث كطبيب استرخاء ومستشار ناصح يراعي راحة الزبون أولاً.
- **لغة سلسة تناسب الزبون الجزائري:** تحدث بلغة عربية بيضاء واضحة ومحببة، وتفهم تماماً مصطلحات اللهجة الجزائرية والدارجة الدارجة في التسوق (مثل: "شحال السعر"، "كاين توصيل لولايتي"، "كيفاش نخلص"، "شحال يقعد باش يوصل"، "كاين ضمان"، "حاب نكوموندي"، "واش فيه").
- **موجز ومقنع:** تجنب الجرائد والنصوص الطويلة المعقدة؛ اجعل إجاباتك في فقرات قصيرة (2-4 أسطر) يسهل قراءتها على شاشة الهاتف.
- **استخدم الإيموجي المناسب بلباقة:** (💆‍♂️، ✨، 🌿، 📦، 🚚).

---

### 📦 معلومات المنتج الكاملة (Theoria Smart Eye Massager):
1. **الوصف:** جهاز قناع مساج واسترخاء العينين الذكي المتطور بتقنية الذكاء الاصطناعي.
2. **التقنيات العلاجية الأربع المدمجة في الجهاز:**
   - **حرارة علاجية مهدئة (42°C ثابتة):** كمادات دافئة كالمناشف الساخنة في أرقى مراكز السبا؛ تذيب الإجهاد العضلي، تنشط الدورة الدموية، وتخفف انتفاخ العينين والهالات السوداء.
   - **تدليك هوائي ذكي متعدد النقاط:** وسائد هوائية ثنائية الطبقة تضغط بلطف على الصدغين ومحجر العين ومسارات الطاقة لتفريغ شحنات الصداع النصفي وصداع التوتر.
   - **اهتزاز إيقاعي متعدد المستويات:** نبضات ترددية دقيقة ترخي الأعصاب البصرية المشدودة وتحفز الدموع الطبيعية لمكافحة جفاف العين الناتج عن الشاشات والمكيفات.
   - **صوت محيطي + اتصال بلوتوث (Bluetooth):** يمكنك ربط هاتفك بسهولة لسماع القرآن الكريم، رقية، بودكاست، أو أصوات الطبيعة المهدئة أثناء جلسة المساج (جلسة مبرمجة تلقائياً لمدة 15 دقيقة).
3. **التصميم والبطارية:**
   - قابل للطي 180° خفيف الوزن بحجم كف اليد، يسهل حمله في الحقيبة إلى العمل، الطائرة، أو السفر.
   - بطارية ليثيوم 1200mAh تدوم أسبوعاً كاملاً (حوالي 8-10 جلسات) وتشحن بكابل Type-C عادي.
   - بطانة داخلية من جلد بروتيني طبيعي ناعم جداً على البشرة ومضاد للتعرق وسهل المسح والتنظيف بمسحة منديل.
4. **الأمان الطبي:**
   - الجهاز آمن 100%؛ الحجرات الهوائية مصممة هندسياً لترتكز فقط على عظام الوجه والصدغين ومحيط العين دون أي ملامسة أو ضغط على بؤبؤ العين أو القرنية.
   - مناسب جداً لمن يرتدون النظارات (تُنزع النظارة أثناء الجلسة للاسترخاء).

---

### 💰 الباقات والأسعار الحالية (عرض خاص محدود):
- **باقة جهاز واحد (شخصي):** **9,500 دج** (بدل 14,900 دج) + توصيل مجاني + ضمان سنة.
- **باقة جهازين (العائلة / الأزواج - الأكثر طلباً وتوفيراً):** **17,500 دج** (بدل 29,800 دج - توفير 1,500 دج إضافية) + توصيل مجاني سريع + ضمان سنة.
- **باقة 3 أجهزة (باقة التوفير الكبرى):** **24,900 دج** (بدل 44,700 دج - توفير 3,600 دج إضافية) + توصيل مجاني سريع + ضمان سنة.

---

### 🚚 الشحن، الضمان والدفع (السوق الجزائري):
- **التوصيل:** **مجاني 100% لكافة الـ 58 ولاية جزائرية** (خلال 24 إلى 48 ساعة فقط).
- **الدفع:** **عند الاستلام (Cash on Delivery)**؛ يصل المندوب لباب المنزل أو مقر العمل، ويحق للزبون فتح الطرد ومعاينة الجهاز قبل دفع أي دينار.
- **الضمان:** **ضمان رسمي كامل لمدة سنة كاملة (12 شهر)** مع استبدال فوري في حال وجود أي عيب مصنعي.

---

### 🎯 استراتيجية إغلاق البيع وجمع الطلبات (Lead Closing):
1. شخّص سبب اهتمام الزبون: هل يعاني من إجهاد الشاشات؟ الصداع؟ صعوبة النوم؟
2. أجب على استفساره بدقة وأكد له الضمان والأمان والتوصيل المجاني لكافة الـ 58 ولاية.
3. اقترح عليه دائماً إتمام الطلب الآن للاستفادة من تخفيض اليوم.
4. **إذا أبدى الزبون رغبته في الطلب أو سألك كيف يطلب أو قدم معلوماته:**
   - اطلب منه بلطف تزويدك بالبيانات:
     * **الاسم الكامل**
     * **رقم الهاتف**
     * **الولاية والبلدية (أو العنوان)**
     * **الباقة المرغوبة** (جهاز واحد أو باقة جهازين)
5. **تنسيق بيانات الطلب (مهم جداً):**
   عندما يقدم الزبون معلومات الطلب (سواء كاملة أو جزئية كالاسم والهاتف والولاية)، قم في نهاية ردك بتضمين كتلة JSON خاصة بالطلب على النحو التالي تماماً:
\`\`\`theoria-order
{
  "customerName": "اسم الزبون",
  "phone": "رقم الهاتف",
  "wilaya": "اسم الولاية",
  "commune": "البلدية أو العنوان",
  "packageId": "single"
}
\`\`\`
   ملاحظة: packageId يمكن أن يكون "single" أو "double" أو "triple". إذا لم يحدد الزبون، افترض "single".
`;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'model';
  content: string;
}

export interface SalesChatResponse {
  reply: string;
  orderData?: {
    customerName?: string;
    phone?: string;
    wilaya?: string;
    commune?: string;
    packageId?: 'single' | 'double' | 'triple';
  };
}

/**
 * Intelligent Fallback Handler in case Gemini API is not configured or rate limited.
 * Ensures the store NEVER breaks and can answer key customer questions intelligently.
 */
function handleFallbackReply(userMessage: string): string {
  const text = (userMessage || '').toLowerCase();

  // Price inquiries
  if (text.includes('سعر') || text.includes('شحال') || text.includes('سوم') || text.includes('prix') || text.includes('ثمن')) {
    return `مرحباً بك! ✨ حالياً لدينا عرض تخفيض خاص بمناسبة الإطلاق:
• **جهاز واحد:** 9,500 دج (بدل 14,900 دج).
• **باقة جهازين (الأكثر توفيراً):** 17,500 دج فقط (وفر 1,500 دج إضافية).
• **3 أجهزة:** 24,900 دج.
🚚 **التوصيل مجاني 100% لكافة الـ 58 ولاية** مع الدفع عند الاستلام بعد معاينة الجهاز وضمان سنة كاملة! هل تود تثبيت طلبك للاستفادة من التخفيض؟`;
  }

  // Delivery & Payment
  if (text.includes('توصيل') || text.includes('شحن') || text.includes('livraison') || text.includes('ولاية') || text.includes('دفع') || text.includes('نخلص')) {
    return `نعم بالتأكيد! 🚚 التوصيل **مجاني 100%** لجميع الـ 58 ولاية جزائرية خلال 24 إلى 48 ساعة فقط حتى باب منزلك أو مقر عملك.
والدفع **عند الاستلام**؛ يمكنك فحص الطرد ومعاينة الجهاز قبل دفع أي دينار للموزع، مع ضمان استبدال لمدة سنة كاملة.
لأي ولاية تود أن نرسل لك الجهاز؟ 🌿`;
  }

  // Safety & Medical
  if (text.includes('آمن') || text.includes('عين') || text.includes('نظر') || text.includes('خطر') || text.includes('طبي') || text.includes('ضغط')) {
    return `سؤال ممتاز ومهم جداً! 🛡️ جهاز ثيوريا آمن 100% على العينين.
الحجرات الهوائية صُممت هندسياً لترتكز على عظام محجر العين الخارجية والصدغين ومسارات الطاقة، **دون أي ضغط مباشر على مقلة العين أو القرنية**.
كما أنه يوفر حرارة مهدئة 42°C تحفز الدورة الدموية وتزيل إجهاد الشاشات والصداع النصفي فوراً.`;
  }

  // Ordering intent
  if (text.includes('طلب') || text.includes('شراء') || text.includes('نكوموندي') || text.includes('commander') || text.includes('حاب نشري')) {
    return `يسعدنا جداً خدمتك! 📦 لتسجيل طلبك فوراً والاستفادة من التوصيل المجاني وضمان السنة:
تفضل بتزويدي بـ:
1. **الاسم الكامل**
2. **رقم الهاتف**
3. **الولاية والبلدية**
4. **الباقة المرغوبة** (جهاز واحد بـ 9,500 دج أو باقة جهازين بـ 17,500 دج).
وسأقوم بتأكيد طلبك في ثوانٍ! 🤝`;
  }

  // How it works
  if (text.includes('كيفاش') || text.includes('كيف يعمل') || text.includes('طريقة') || text.includes('ميزات') || text.includes('فوائد')) {
    return `جهاز ثيوريا يجمع 4 تقنيات علاجية في جلسة استرخاء واحدة (15 دقيقة):
1. **حرارة علاجية 42°C:** كمادات دافئة لإزالة التعب والانتفاخ.
2. **تدليك هوائي ذكي:** يضغط على الصدغين ومحيط العين لتفريغ الصداع.
3. **اهتزاز إيقاعي:** لإرخاء الأعصاب ومكافحة جفاف العين.
4. **بلوتوث مدمج:** للاستماع لتلاوات القرآن أو أصوات الطبيعة الهادئة أثناء الجلسة.
هل تعاني من إجهاد الشاشات أم الصداع النصفي؟`;
  }

  // General warm sales reply
  return `أهلاً بك في متجر ثيوريا الرسمي! 💆‍♂️ أنا مستشارك الشخصي لجهاز تدليك واسترخاء العينين الذكي.
سواء كنت تعاني من إجهاد الشاشات، الصداع النصفي، أو صعوبة النوم، يسعدني الإجابة عن أي استفسار أو مساعدتك في طلب جهازك مع **توصيل مجاني لـ 58 ولاية** ودفع عند الاستلام. كيف يمكنني خدمتك اليوم؟ ✨`;
}

export async function handleSalesChatRequest(messages: ChatMessage[]): Promise<SalesChatResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    // Graceful offline fallback
    const fallbackText = handleFallbackReply(lastUserMsg);
    return { reply: fallbackText };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Clean and normalize messages for Gemini multi-turn format
    const formatted = messages
      .filter((m) => m && m.content && m.content.trim().length > 0)
      .slice(-10)
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content.trim() }],
      }));

    // Drop leading 'model' messages so conversation strictly starts with 'user'
    while (formatted.length > 0 && formatted[0].role === 'model') {
      formatted.shift();
    }

    if (formatted.length === 0) {
      return { reply: handleFallbackReply(lastUserMsg) };
    }

    // Merge consecutive identical roles
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    for (const msg of formatted) {
      if (contents.length > 0 && contents[contents.length - 1].role === msg.role) {
        contents[contents.length - 1].parts[0].text += '\n' + msg.parts[0].text;
      } else {
        contents.push(msg);
      }
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: THEORIA_SALES_PROMPT,
        temperature: 0.65,
      },
    });

    let rawReply = response.text || '';

    // Check if the reply includes a theoria-order block
    let orderData: SalesChatResponse['orderData'] = undefined;
    const orderMatch = rawReply.match(/```theoria-order\s*([\s\S]*?)\s*```/);
    if (orderMatch && orderMatch[1]) {
      try {
        orderData = JSON.parse(orderMatch[1].trim());
        // Clean the raw json block from the visible chat text for clean customer display
        rawReply = rawReply.replace(/```theoria-order\s*[\s\S]*?\s*```/, '').trim();
      } catch (err) {
        console.warn('[SalesAgent] Failed to parse theoria-order block:', err);
      }
    }

    const finalReply = rawReply || handleFallbackReply(lastUserMsg);

    // Save inquiry to persistent admin storage
    if (lastUserMsg) {
      try {
        recordCustomerInquiry(lastUserMsg, finalReply, orderData);
      } catch (saveErr) {
        console.warn('[SalesAgent] Failed to record customer inquiry:', saveErr);
      }
    }

    return {
      reply: finalReply,
      orderData,
    };
  } catch (err: any) {
    console.error('[SalesAgent] Gemini error, falling back:', err?.message || err);
    const fallbackText = handleFallbackReply(lastUserMsg);
    if (lastUserMsg) {
      try {
        recordCustomerInquiry(lastUserMsg, fallbackText);
      } catch {
        // ignore
      }
    }
    return {
      reply: fallbackText,
    };
  }
}
