<?php
declare(strict_types=1);

$config = __DIR__ . '/config.php';
if (!is_file($config)) {
    http_response_code(500);
    exit('Salin config.php.example menjadi config.php lalu isi pengaturan hosting.');
}
require $config;

function h(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
function rupiah(int $amount): string { return CURRENCY . ' ' . number_format($amount, 0, ',', '.'); }

$selected = filter_input(INPUT_GET, 'paket', FILTER_VALIDATE_INT);
$selectedPackage = ($selected !== false && $selected !== null && isset(PACKAGES[$selected])) ? PACKAGES[$selected] : null;
$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $packageIndex = filter_input(INPUT_POST, 'package', FILTER_VALIDATE_INT);
    $customer = trim((string) ($_POST['customer'] ?? ''));
    $contact = trim((string) ($_POST['contact'] ?? ''));
    $package = ($packageIndex !== false && $packageIndex !== null && isset(PACKAGES[$packageIndex])) ? PACKAGES[$packageIndex] : null;

    if (!$package || $customer === '' || $contact === '') {
        $message = 'Lengkapi nama, kontak, dan paket yang dipilih.';
    } else {
        $text = rawurlencode("Halo " . SITE_NAME . ", saya ingin memesan:\nPaket: {$package['name']}\nNama: {$customer}\nKontak: {$contact}\nHarga: " . rupiah((int) $package['price']));
        header('Location: https://wa.me/' . rawurlencode(ADMIN_WHATSAPP) . '?text=' . $text);
        exit;
    }
}
?>
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h(SITE_NAME) ?> - <?= h(SITE_TAGLINE) ?></title>
<style>
:root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#142033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}header{background:#101828;color:#fff;padding:22px 6%;display:flex;justify-content:space-between;align-items:center}header a{color:#fff;text-decoration:none;font-weight:700}.wrap{max-width:1100px;margin:auto;padding:0 22px}.hero{padding:74px 0 50px;display:grid;grid-template-columns:1.2fr .8fr;gap:30px;align-items:center}.hero h1{font-size:clamp(2.1rem,5vw,4.2rem);line-height:1.05;margin:0 0 18px}.hero p{font-size:1.15rem;color:#526173;line-height:1.6}.button{display:inline-block;background:#155eef;color:#fff;text-decoration:none;border:0;border-radius:10px;padding:13px 18px;font-weight:700;cursor:pointer}.card{background:#fff;border:1px solid #dfe5ee;border-radius:16px;padding:24px;box-shadow:0 15px 40px #10182812}.hero-card{background:#eaf2ff;border-color:#c4d8ff}.section{padding:35px 0}.section h2{font-size:2rem}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.price{font-size:1.65rem;font-weight:800;margin:16px 0}.muted{color:#66758a;line-height:1.55}.order{max-width:650px;margin:20px auto}label{display:block;font-weight:700;margin:16px 0 7px}input,select{width:100%;padding:12px;border:1px solid #bdc7d6;border-radius:9px;font:inherit}.alert{background:#fff3cd;color:#664d03;padding:12px;border-radius:9px;margin-bottom:16px}footer{padding:35px 0;color:#66758a;border-top:1px solid #dfe5ee}@media(max-width:760px){.hero,.grid{grid-template-columns:1fr}header{padding:18px 22px}}
</style>
</head>
<body>
<header><a href="."><?= h(SITE_NAME) ?></a><a href="#pesan">Pesan sekarang</a></header>
<main>
<section class="hero wrap"><div><p><strong>Nomor virtual dan OTP</strong></p><h1><?= h(SITE_TAGLINE) ?></h1><p>Pilih paket yang sesuai kebutuhan Anda. Pemesanan dilakukan melalui WhatsApp agar admin dapat memproses layanan dan memberikan instruksi pembayaran.</p><a class="button" href="#paket">Lihat paket</a></div><div class="card hero-card"><h3>Proses sederhana</h3><p class="muted">Pilih paket → kirim pesanan → admin mengonfirmasi ketersediaan dan pembayaran → layanan diproses.</p></div></section>
<section id="paket" class="section wrap"><h2>Paket layanan</h2><div class="grid">
<?php foreach (PACKAGES as $i => $package): ?><article class="card"><h3><?= h((string) $package['name']) ?></h3><p class="muted"><?= h((string) $package['description']) ?></p><div class="price"><?= h(rupiah((int) $package['price'])) ?></div><a class="button" href="?paket=<?= $i ?>#pesan">Pilih paket</a></article><?php endforeach; ?>
</div></section>
<section id="pesan" class="section wrap"><div class="card order"><h2>Formulir pesanan</h2><p class="muted">Setelah dikirim, WhatsApp admin akan terbuka dengan detail pesanan.</p><?php if ($message): ?><div class="alert"><?= h($message) ?></div><?php endif; ?><form method="post"><label for="package">Paket</label><select id="package" name="package" required><?php foreach (PACKAGES as $i => $package): ?><option value="<?= $i ?>" <?= ($selectedPackage === $package) ? 'selected' : '' ?>><?= h((string) $package['name']) ?> — <?= h(rupiah((int) $package['price'])) ?></option><?php endforeach; ?></select><label for="customer">Nama</label><input id="customer" name="customer" required maxlength="80"><label for="contact">Nomor WhatsApp/email</label><input id="contact" name="contact" required maxlength="120"><button class="button" type="submit">Kirim pesanan ke WhatsApp</button></form></div></section>
</main><footer><div class="wrap">© <?= date('Y') ?> <?= h(SITE_NAME) ?>. Sesuaikan informasi layanan dan kebijakan sebelum dipublikasikan.</div></footer>
</body></html>
