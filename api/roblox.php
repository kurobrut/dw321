<?php
// Tiny same-origin proxy for Roblox public APIs.
// Upload this file as: public_html/api/roblox.php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function fail_response($status, $message, $details = null) {
    http_response_code($status);
    $out = array('error' => $message);
    if ($details !== null) $out['details'] = $details;
    echo json_encode($out, JSON_UNESCAPED_SLASHES);
    exit;
}

function roblox_get($url) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => array(
                'Accept: application/json',
                'User-Agent: Mozilla/5.0 RobloxProxy/1.0'
            ),
        ));
        $body = curl_exec($ch);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($body === false || $errno) {
            fail_response(502, 'Could not connect to Roblox.', $error ?: ('cURL error ' . $errno));
        }
        return array($status, $body);
    }

    $context = stream_context_create(array(
        'http' => array(
            'method' => 'GET',
            'timeout' => 20,
            'ignore_errors' => true,
            'header' => "Accept: application/json\r\nUser-Agent: Mozilla/5.0 RobloxProxy/1.0\r\n"
        )
    ));
    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
        fail_response(502, 'Could not connect to Roblox. Enable PHP cURL or allow_url_fopen on x10Hosting.');
    }

    $status = 200;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $status = (int)$m[1];
    }
    return array($status, $body);
}

$action = isset($_GET['action']) ? strtolower(trim($_GET['action'])) : '';

if ($action === 'search') {
    $keyword = isset($_GET['keyword']) ? trim($_GET['keyword']) : '';
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;
    $limit = max(1, min(10, $limit));

    if ($keyword === '') fail_response(400, 'keyword is required');
    if (strlen($keyword) > 30) fail_response(400, 'keyword is too long');

    $url = 'https://users.roblox.com/v1/users/search?keyword=' . rawurlencode($keyword) . '&limit=' . $limit;
    list($status, $body) = roblox_get($url);

    http_response_code($status ?: 200);
    echo $body;
    exit;
}

if ($action === 'avatar') {
    $userIds = isset($_GET['userIds']) ? trim($_GET['userIds']) : '';
    $size = isset($_GET['size']) ? trim($_GET['size']) : '48x48';
    $format = isset($_GET['format']) ? trim($_GET['format']) : 'Png';
    $circular = isset($_GET['isCircular']) ? trim($_GET['isCircular']) : 'true';

    if ($userIds === '' || !preg_match('/^[0-9,]+$/', $userIds)) {
        fail_response(400, 'A valid userIds value is required');
    }

    $url = 'https://thumbnails.roblox.com/v1/users/avatar-headshot' .
        '?userIds=' . rawurlencode($userIds) .
        '&size=' . rawurlencode($size) .
        '&format=' . rawurlencode($format) .
        '&isCircular=' . rawurlencode($circular);

    list($status, $body) = roblox_get($url);

    // The Roblox thumbnails endpoint returns JSON containing imageUrl.
    // An <img src=...> cannot display that JSON, so resolve the URL and
    // redirect the browser to the actual CDN image.
    if ($status < 200 || $status >= 300) {
        http_response_code($status ?: 502);
        echo $body;
        exit;
    }

    $json = json_decode($body, true);
    $imageUrl = '';

    if (is_array($json) && isset($json['data'][0]['imageUrl'])) {
        $imageUrl = $json['data'][0]['imageUrl'];
    }

    if ($imageUrl === '' || !filter_var($imageUrl, FILTER_VALIDATE_URL)) {
        fail_response(502, 'Roblox did not return an avatar image.', $body);
    }

    header('Location: ' . $imageUrl, true, 302);
    exit;
}

fail_response(400, 'Invalid action. Use action=search or action=avatar.');
?>
