<?php
/**
 * Theoria Store - api/mark-fb-sent.php
 * تحديث حالة fb_sent = 1 في قاعدة البيانات بعد إطلاق حدث الشراء الأول من المتصفح بنجاح
 * لمنع أي إطلاق مستقبلي في حال تكرار الزيارة أو الريفريش
 */

header('Content-Type: application/json; charset=UTF-8');

$order_id = trim($_GET['order_id'] ?? ($_POST['order_id'] ?? ''));
$token = trim($_GET['token'] ?? ($_POST['token'] ?? ''));

if (empty($order_id)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Missing order_id'
    ]);
    exit;
}

$dataFile = dirname(__DIR__) . '/orders_data.json';
$orders = [];
if (file_exists($dataFile)) {
    $raw = file_get_contents($dataFile);
    $orders = json_decode($raw, true) ?: [];
}

$updated = false;
$was_already_sent = false;

foreach ($orders as &$ord) {
    if ((isset($ord['orderCode']) && $ord['orderCode'] === $order_id) || (isset($ord['id']) && $ord['id'] === $order_id)) {
        // فحص التوكن إذا تم تمريره
        if (!empty($token) && isset($ord['fb_token'])) {
            if (!hash_equals((string)$ord['fb_token'], (string)$token)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Invalid token']);
                exit;
            }
        }

        if (isset($ord['fb_sent']) && (int)$ord['fb_sent'] === 1) {
            $was_already_sent = true;
        } else {
            $ord['fb_sent'] = 1;
            $ord['fb_sent_at'] = time() * 1000;
            $updated = true;
        }
        break;
    }
}
unset($ord);

if ($updated) {
    file_put_contents($dataFile, json_encode($orders, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

echo json_encode([
    'success' => true,
    'order_id' => $order_id,
    'fb_sent' => 1,
    'previously_sent' => $was_already_sent,
    'message' => 'Order fb_sent successfully set to 1. Duplicate fires permanently blocked.'
]);
