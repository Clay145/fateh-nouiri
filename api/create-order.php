<?php
/**
 * Theoria Store - api/create-order.php
 * معالجة إنشاء الطلب وإرسال حدث الشراء الفوري إلى Meta Conversions API (CAPI v20.0)
 * وتوليد token و fb_event_id وتخزين fbp و fbc وحماية fb_sent = 0.
 */

header('Content-Type: application/json; charset=UTF-8');

// إعدادات Meta Pixel & CAPI
$META_PIXEL_ID = '28477410788542282';
$META_ACCESS_TOKEN = getenv('META_CONVERSIONS_API_ACCESS_TOKEN') ?: getenv('FB_CONVERSIONS_API_TOKEN') ?: '';

// قراءة بيانات الطلب (يدعم JSON و Form POST)
$rawInput = file_get_contents('php://input');
$inputData = json_decode($rawInput, true);
if (!$inputData && !empty($_POST)) {
    $inputData = $_POST;
}

$customerName = trim($inputData['customerName'] ?? '');
$phone = trim($inputData['phone'] ?? '');
$wilaya = trim($inputData['wilaya'] ?? 'غير محدد');
$commune = trim($inputData['commune'] ?? '');
$packageTitle = trim($inputData['packageTitle'] ?? 'جهاز مساج Theoria');
$totalPrice = !empty($inputData['totalPrice']) ? (float)$inputData['totalPrice'] : 9500;
$notes = trim($inputData['notes'] ?? '');
$email = trim($inputData['email'] ?? '');

if (empty($customerName) || empty($phone)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'الاسم ورقم الهاتف مطلوبان لإتمام الطلب'
    ]);
    exit;
}

// 1. توليد رقم الطلب الحقيقي ومعرف الحدث والتوكن
$order_id = !empty($inputData['orderCode']) ? $inputData['orderCode'] : 'TH-' . mt_rand(10000, 99999);
$fb_event_id = "purchase_" . $order_id;
$fb_token = bin2hex(random_bytes(16));
$fb_sent = 0; // لم يُطلق من المتصفح بعد

// 2. استخراج كوكيز _fbp و _fbc
$fbp = $_COOKIE['_fbp'] ?? ($inputData['fbp'] ?? null);
$fbc = $_COOKIE['_fbc'] ?? ($inputData['fbc'] ?? null);

// إذا كان الرابط يحتوي على ?fbclid= ولم يتم حفظ _fbc بعد، يتم إنشاؤه بالصيغة القياسية: fb.1.timestamp.fbclid
$fbclid = $_GET['fbclid'] ?? ($inputData['fbclid'] ?? null);
if (empty($fbc) && !empty($fbclid)) {
    $fbc = 'fb.1.' . (time() * 1000) . '.' . trim($fbclid);
}

// 3. تطبيع رقم الهاتف الجزائري وتشفيره بصيغة SHA-256
$cleanPhone = preg_replace('/[^\d]/', '', $phone);
if (strpos($cleanPhone, '0') === 0) {
    $normalizedPhone = '213' . substr($cleanPhone, 1);
} elseif (strpos($cleanPhone, '213') === 0) {
    $normalizedPhone = $cleanPhone;
} else {
    $normalizedPhone = '213' . $cleanPhone;
}
$phoneHashed = hash('sha256', $normalizedPhone);

// تفكيك وتشفير الاسم
$nameParts = explode(' ', $customerName, 2);
$fnHashed = hash('sha256', mb_strtolower(trim($nameParts[0]), 'UTF-8'));
$lnHashed = isset($nameParts[1]) ? hash('sha256', mb_strtolower(trim($nameParts[1]), 'UTF-8')) : '';

// 4. حفظ الطلب في قاعدة البيانات (أو JSON Storage)
$dataFile = dirname(__DIR__) . '/orders_data.json';
$orders = [];
if (file_exists($dataFile)) {
    $raw = file_get_contents($dataFile);
    $orders = json_decode($raw, true) ?: [];
}

$newOrder = [
    'id' => 'ord_' . time() . '_' . mt_rand(100, 999),
    'orderCode' => $order_id,
    'customerName' => $customerName,
    'phone' => $phone,
    'wilaya' => $wilaya,
    'commune' => $commune,
    'packageTitle' => $packageTitle,
    'totalPrice' => $totalPrice,
    'date' => date('d/m/Y H:i'),
    'createdAt' => time() * 1000,
    'status' => 'جديد',
    'notes' => $notes,
    'fb_event_id' => $fb_event_id,
    'fb_token' => $fb_token,
    'fb_sent' => $fb_sent,
    'fbp' => $fbp,
    'fbc' => $fbc,
    'capiStatus' => 'pending'
];

array_unshift($orders, $newOrder);
file_put_contents($dataFile, json_encode($orders, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// 5. إرسال حدث الخادم CAPI في نفس اللحظة عبر Meta Graph API v20.0
$clientIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
if (strpos($clientIp, ',') !== false) {
    $clientIp = trim(explode(',', $clientIp)[0]);
}
$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

$thankYouUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https" : "http")
    . "://" . ($_SERVER['HTTP_HOST'] ?? 'theoriastore.com')
    . "/thank-you.php?order_id=" . urlencode($order_id) . "&token=" . urlencode($fb_token);

$userData = [
    'ph' => [$phoneHashed],
    'fn' => [$fnHashed],
    'country' => [hash('sha256', 'dz')],
    'client_user_agent' => $userAgent,
    'client_ip_address' => $clientIp
];

if (!empty($lnHashed)) $userData['ln'] = [$lnHashed];
if (!empty($wilaya)) $userData['st'] = [hash('sha256', mb_strtolower($wilaya, 'UTF-8'))];
if (!empty($fbp)) $userData['fbp'] = $fbp;
if (!empty($fbc)) $userData['fbc'] = $fbc;
if (!empty($email)) $userData['em'] = [hash('sha256', strtolower(trim($email)))];

$capiPayload = [
    'data' => [
        [
            'event_name' => 'Purchase',
            'event_time' => time(),
            'event_id' => $fb_event_id, // نفس الـ event_id تماماً كالمتصفح
            'event_source_url' => $thankYouUrl,
            'action_source' => 'website',
            'user_data' => $userData,
            'custom_data' => [
                'value' => $totalPrice,
                'currency' => 'DZD',
                'order_id' => (string)$order_id,
                'content_name' => $packageTitle,
                'content_type' => 'product'
            ]
        ]
    ]
];

// فحص رمز الاختبار إن وُجد (لأداة Test Events)
$testEventCode = getenv('META_TEST_EVENT_CODE') ?: ($inputData['test_event_code'] ?? null);
if (!empty($testEventCode)) {
    $capiPayload['test_event_code'] = $testEventCode;
}

$capiResponseStatus = 'local_logged';
$capiDetails = null;

if (!empty($META_ACCESS_TOKEN)) {
    $ch = curl_init("https://graph.facebook.com/v20.0/{$META_PIXEL_ID}/events?access_token=" . urlencode($META_ACCESS_TOKEN));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($capiPayload));
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        $capiResponseStatus = 'sent_to_meta_v20';
        $capiDetails = json_decode($response, true);
    } else {
        $capiResponseStatus = 'meta_error_' . $httpCode;
        $capiDetails = $response;
    }
}

// 6. إرجاع النتيجة ورابط صفحة الشكر الآمن
echo json_encode([
    'success' => true,
    'order_id' => $order_id,
    'token' => $fb_token,
    'event_id' => $fb_event_id,
    'fb_sent' => 0,
    'redirect_url' => '/thank-you.php?order_id=' . urlencode($order_id) . '&token=' . urlencode($fb_token),
    'capi_status' => $capiResponseStatus,
    'deduplication_ready' => true,
    'instructions' => 'Proceed to thank-you.php with order_id and token to fire browser Purchase with identical event_id.'
]);
