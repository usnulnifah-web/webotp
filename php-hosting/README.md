# WebOTP PHP Hosting

Storefront sederhana untuk shared hosting biasa. Tidak membutuhkan Node.js, npm, database, atau framework.

## Instalasi

1. Upload folder `php-hosting` ke hosting.
2. Salin `config.php.example` menjadi `config.php`.
3. Edit `config.php`: nama website, nomor WhatsApp admin, dan paket/harga.
4. Buka folder tersebut melalui browser.

Contoh melalui File Manager: upload isi folder ke `public_html/`, sehingga file utama berada di `public_html/index.php`.

## Alur pesanan

Pelanggan memilih paket, mengisi nama dan kontak, lalu diarahkan ke WhatsApp admin dengan detail pesanan. Pemrosesan layanan dan pembayaran masih dilakukan oleh admin secara manual.

## Catatan penting

Template ini tidak terhubung ke supplier nomor virtual, SMS gateway, atau payment gateway. Untuk otomatisasi order, diperlukan API supplier dan payment gateway yang sah. Jangan meminta pelanggan memasukkan OTP dari Google, Gmail, bank, atau layanan pihak ketiga ke situs ini.

Sebelum produksi, tambahkan HTTPS, kebijakan privasi, syarat layanan, serta validasi dan pencatatan order di backend.
