<?php
declare(strict_types=1);

session_start();

const OTP_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;

if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

function flash(string $type, string $message): void
{
    $_SESSION['flash'] = ['type' => $type, 'message' => $message];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $csrf = (string) ($_POST['csrf'] ?? '');
    if (!hash_equals((string) $_SESSION['csrf'], $csrf)) {
        http_response_code(400);
        exit('Permintaan tidak valid.');
    }

    $action = (string) ($_POST['action'] ?? '');

    if ($action === 'generate') {
        $otp = (string) random_int(100000, 999999);
        $_SESSION['otp_hash'] = password_hash($otp, PASSWORD_DEFAULT);
        $_SESSION['otp_expires_at'] = time() + OTP_TTL_SECONDS;
        $_SESSION['otp_attempts'] = 0;

        // Demo only: pada produksi, kirim $otp melalui provider SMS/email resmi.
        $_SESSION['demo_otp'] = $otp;
        flash('success', 'OTP berhasil dibuat. Mode demo menampilkan OTP di bawah formulir.');
    }

    if ($action === 'verify') {
        $entered = trim((string) ($_POST['otp'] ?? ''));
        $hash = (string) ($_SESSION['otp_hash'] ?? '');
        $expiresAt = (int) ($_SESSION['otp_expires_at'] ?? 0);
        $attempts = (int) ($_SESSION['otp_attempts'] ?? 0);

        if ($hash === '' || $expiresAt < time()) {
            flash('error', 'OTP belum dibuat atau sudah kedaluwarsa.');
        } elseif ($attempts >= MAX_ATTEMPTS) {
            flash('error', 'Batas percobaan tercapai. Buat OTP baru.');
        } elseif (!preg_match('/^\d{6}$/', $entered)) {
            $_SESSION['otp_attempts'] = $attempts + 1;
            flash('error', 'Masukkan OTP 6 digit.');
        } elseif (password_verify($entered, $hash)) {
            unset($_SESSION['otp_hash'], $_SESSION['otp_expires_at'], $_SESSION['otp_attempts'], $_SESSION['demo_otp']);
            flash('success', 'OTP valid. Verifikasi berhasil.');
        } else {
            $_SESSION['otp_attempts'] = $attempts + 1;
            flash('error', 'OTP salah.');
        }
    }

    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));
    exit;
}

$flash = $_SESSION['flash'] ?? null;
unset($_SESSION['flash']);
$demoOtp = (string) ($_SESSION['demo_otp'] ?? '');
$expiresAt = (int) ($_SESSION['otp_expires_at'] ?? 0);
$remaining = max(0, $expiresAt - time());
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OTP Demo PHP</title>
    <style>
        :root { color-scheme: light; font-family: system-ui, sans-serif; }
        body { margin: 0; background: #f4f7fb; color: #182230; }
        main { max-width: 560px; margin: 8vh auto; padding: 28px; background: #fff; border: 1px solid #dbe3ee; border-radius: 16px; box-shadow: 0 12px 30px #15223812; }
        h1 { margin-top: 0; }
        p { line-height: 1.55; }
        label { display: block; margin: 18px 0 6px; font-weight: 650; }
        input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #b9c5d5; border-radius: 9px; font-size: 1rem; }
        button { margin-top: 16px; padding: 11px 16px; border: 0; border-radius: 9px; background: #155eef; color: white; font-weight: 700; cursor: pointer; }
        button.secondary { background: #526173; }
        .notice { padding: 12px 14px; border-radius: 9px; margin: 16px 0; background: #eef4ff; }
        .success { background: #eaf8ef; color: #14532d; }
        .error { background: #fff0f0; color: #991b1b; }
        code { font-size: 1.2rem; letter-spacing: .18em; }
        small { color: #526173; }
    </style>
</head>
<body>
<main>
    <h1>OTP Demo PHP</h1>
    <p>Contoh OTP untuk aplikasi milik sendiri. Tidak terhubung ke Google, Gmail, atau layanan OTP pihak ketiga.</p>

    <?php if ($flash): ?>
        <div class="notice <?= e((string) $flash['type']) ?>"><?= e((string) $flash['message']) ?></div>
    <?php endif; ?>

    <?php if ($demoOtp !== '' && $remaining > 0): ?>
        <div class="notice"><strong>OTP demo:</strong> <code><?= e($demoOtp) ?></code><br><small>Berlaku sekitar <?= $remaining ?> detik. Jangan tampilkan OTP di sini pada produksi.</small></div>
    <?php endif; ?>

    <form method="post">
        <input type="hidden" name="csrf" value="<?= e((string) $_SESSION['csrf']) ?>">
        <input type="hidden" name="action" value="generate">
        <button type="submit">Buat OTP</button>
    </form>

    <form method="post">
        <input type="hidden" name="csrf" value="<?= e((string) $_SESSION['csrf']) ?>">
        <input type="hidden" name="action" value="verify">
        <label for="otp">Masukkan OTP</label>
        <input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required>
        <button class="secondary" type="submit">Verifikasi OTP</button>
    </form>
</main>
</body>
</html>
