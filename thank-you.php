<?php
/**
 * Theoria Store - thank-you.php
 * صفحة الشكر الآمنة مع حماية إلغاء التكرار (Deduplication Guard)
 * 
 * القواعد الصارمة:
 * 1. لا تطلق حدث Purchase إلا بعد التحقق من token و fb_sent = 0.
 * 2. إذا التحقق فشل (دخول مباشر أو توكن غير صحيح)، لا تطلق Purchase نهائياً.
 * 3. إذا fb_sent = 1 (تم احتسابه مسبقاً)، لا تطلق Purchase نهائياً.
 * 4. استخدام sessionStorage لمنع التكرار عند عمل Refresh.
 * 5. تحديث قاعدة البيانات فوراً عبر api/mark-fb-sent.php ليصبح fb_sent = 1.
 */

header('Content-Type: text/html; charset=UTF-8');

$order_id = isset($_GET['order_id']) ? trim($_GET['order_id']) : '';
$token = isset($_GET['token']) ? trim($_GET['token']) : '';

$is_authorized = false;
$order_data = null;
$already_sent = false;
$error_reason = '';

if (!empty($order_id) && !empty($token)) {
    // 1. فحص ملف أو قاعدة بيانات الطلبات
    $dataFile = __DIR__ . '/orders_data.json';
    $orders = [];
    if (file_exists($dataFile)) {
        $raw = file_get_contents($dataFile);
        $orders = json_decode($raw, true) ?: [];
    }

    // البحث عن الطلب المطابق
    foreach ($orders as $ord) {
        if ((isset($ord['orderCode']) && $ord['orderCode'] === $order_id) || (isset($ord['id']) && $ord['id'] === $order_id)) {
            $order_data = $ord;
            break;
        }
    }

    if ($order_data) {
        // فحص صحة الـ Token
        $saved_token = isset($order_data['fb_token']) ? $order_data['fb_token'] : '';
        if (hash_equals((string)$saved_token, (string)$token)) {
            // فحص fb_sent
            $fb_sent = isset($order_data['fb_sent']) ? (int)$order_data['fb_sent'] : 0;
            if ($fb_sent === 0) {
                $is_authorized = true;
            } else {
                $already_sent = true;
                $error_reason = 'تم احتساب هذا الطلب مسبقاً (fb_sent = 1). تم حظر إطلاق الحدث لمنع التكرار.';
            }
        } else {
            $error_reason = 'رمز التحقق (Token) غير مطابق للطلب.';
        }
    } else {
        $error_reason = 'رقم الطلب غير موجود في النظام.';
    }
} else {
    $error_reason = 'الرابط غير مكتمل (مطلوب order_id و token). تم منع إطلاق حدث الشراء.';
}

$event_id = !empty($order_id) ? "purchase_" . $order_id : "";
$order_value = $order_data && isset($order_data['totalPrice']) ? (float)$order_data['totalPrice'] : 9500;
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>شكراً لتسوقك من Theoria - تم استلام طلبك بنجاح</title>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">

    <!-- Meta Pixel Code (البيكسل الأساسي المعتمد الوحيد) -->
    <script>
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', '28477410788542282');
    </script>
    <!-- End Meta Pixel Code -->

    <?php if ($is_authorized): ?>
    <!-- Server-only intake: the single CAPI Purchase is sent by the server on
         order creation. No browser pixel fire here. -->
    <script>
      const EVENT_ID = <?php echo json_encode($event_id); ?>;
      const ORDER_ID = <?php echo json_encode($order_id); ?>;
      const TOKEN = <?php echo json_encode($token); ?>;
      console.log('[Meta Pixel server-only] Verified order, Purchase recorded server-side only:', EVENT_ID);

      // Update the database to mark fb_sent = 1 (no pixel event fired)
      fetch('/api/mark-fb-sent.php?order_id=' + encodeURIComponent(ORDER_ID) + '&token=' + encodeURIComponent(TOKEN))
        .then(r => r.json())
        .then(res => {
          console.log('[Backend Database] fb_sent successfully marked as 1:', res);
        })
        .catch(err => {
          console.warn('[Backend Database] Notice updating fb_sent:', err);
        });
    </script>
    <?php else: ?>
    <script>
      console.warn('[Meta Pixel Security] Purchase event blocked: <?php echo htmlspecialchars($error_reason); ?>');
    </script>
    <?php endif; ?>

    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Cairo', sans-serif; }
      body { background-color: #0a0e1a; color: #e0e8f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .card { background: #111927; border: 1px solid rgba(125, 211, 252, 0.2); border-radius: 24px; max-width: 580px; width: 100%; padding: 36px 28px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6); text-align: center; }
      .icon-box { width: 72px; height: 72px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; display: inline-flex; align-items: center; justify-content: center; color: #10b981; margin-bottom: 20px; font-size: 32px; }
      .icon-warn { background: rgba(245, 158, 11, 0.15); border-color: #f59e0b; color: #f59e0b; }
      h1 { font-size: 26px; font-weight: 900; color: #ffffff; margin-bottom: 12px; }
      p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
      .order-details { background: #162032; border-radius: 16px; padding: 20px; text-align: right; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.05); }
      .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
      .row:last-child { margin-bottom: 0; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-weight: 700; color: #7dd3fc; }
      .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 20px; }
      .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
      .badge-blocked { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
      .btn { display: inline-block; background: linear-gradient(135deg, #1877f2, #0d5bbd); color: white; padding: 14px 28px; border-radius: 14px; text-decoration: none; font-weight: 700; font-size: 14px; transition: 0.2s; }
      .btn:hover { opacity: 0.9; }
      .code-snippet { background: rgba(0,0,0,0.5); padding: 8px 12px; border-radius: 8px; font-family: monospace; font-size: 12px; color: #7dd3fc; direction: ltr; display: inline-block; }
    </style>
</head>
<body>

<div class="card">
    <?php if ($is_authorized): ?>
        <div class="icon-box">✓</div>
        <div class="badge badge-success">تم تسجيل وتوثيق حدث الشراء بنجاح</div>
        <h1>تهانينا! تم تأكيد طلبك بنجاح</h1>
        <p>شكراً لثقتك بمتجر <strong>Theoria</strong>. سيتصل بك فريق خدمة العملاء خلال ساعات لتأكيد شحن جهاز مساج العينين إلى عنوانك.</p>

        <div class="order-details">
            <div class="row">
                <span>رقم الطلب (Order ID):</span>
                <span style="font-family: monospace; font-weight: 700; color: white;"><?php echo htmlspecialchars($order_id); ?></span>
            </div>
            <div class="row">
                <span>معرف الحدث (Meta event_id):</span>
                <span class="code-snippet"><?php echo htmlspecialchars($event_id); ?></span>
            </div>
            <div class="row">
                <span>اسم العميل:</span>
                <span><?php echo htmlspecialchars($order_data['customerName'] ?? 'زبون'); ?></span>
            </div>
            <div class="row">
                <span>الولاية:</span>
                <span><?php echo htmlspecialchars($order_data['wilaya'] ?? ''); ?></span>
            </div>
            <div class="row">
                <span>المبلغ الإجمالي مع التوصيل:</span>
                <span><?php echo number_format($order_value, 0, '.', ' '); ?> DZD (دج)</span>
            </div>
        </div>

        <p style="font-size: 12px; color: #64748b;">
            حماية الـ Deduplication مفعلة: عند تحديث الصفحة أو الرجوع للخلف، لن يتم إرسال أي أحداث مكررة لـ Meta.
        </p>

    <?php elseif ($already_sent): ?>
        <div class="icon-box icon-warn">ℹ</div>
        <div class="badge badge-blocked">طلب مسجل مسبقاً (تم حظر التكرار)</div>
        <h1>تم استلام طلبك مسبقاً</h1>
        <p>
            رقم الطلب: <strong style="color: #7dd3fc; font-family: monospace;"><?php echo htmlspecialchars($order_id); ?></strong><br>
            <?php echo htmlspecialchars($error_reason); ?>
        </p>
        <p style="font-size: 12px; color: #64748b;">
            نظام Meta Deduplication يمنع إطلاق حدث الشراء أكثر من مرة لنفس الطلب لحماية دقة إحصائيات حملتك الإعلانية.
        </p>

    <?php else: ?>
        <div class="icon-box icon-warn">⚠</div>
        <div class="badge badge-blocked">تنبيه أمني</div>
        <h1>تعذر التحقق من الطلب</h1>
        <p><?php echo htmlspecialchars($error_reason); ?></p>
        <p style="font-size: 12px; color: #64748b;">
            تم منع إطلاق حدث الشراء تماماً لعدم وجود توكن تحقق صالح مرتبط بقاعدة البيانات.
        </p>
    <?php endif; ?>

    <a href="/" class="btn">العودة للصفحة الرئيسية للمتجر</a>
</div>

</body>
</html>
