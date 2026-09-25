# PHP Standalone OTP Demo

Folder ini adalah contoh aplikasi OTP sederhana yang berjalan dengan PHP native dan HTML, tanpa Node.js, database, atau framework.

## Menjalankan lokal

```bash
php -S 127.0.0.1:8080 -t php-standalone
```

Buka `http://127.0.0.1:8080`.

## Upload ke hosting

Upload seluruh isi folder `php-standalone` ke document root atau subfolder hosting yang mendukung PHP 8.0+. Pastikan session PHP aktif.

## Catatan keamanan

Aplikasi ini hanya demo. OTP ditampilkan di halaman agar alur dapat diuji tanpa provider SMS/email. Untuk produksi, hapus `$_SESSION['demo_otp']` dan kirim OTP melalui provider SMS/email resmi milik aplikasi Anda. Jangan meminta atau menyimpan OTP Google, Gmail, atau layanan pihak ketiga.

Fitur yang sudah tersedia:

- OTP enam digit yang dibuat secara kriptografis.
- Hash OTP menggunakan `password_hash`.
- Masa berlaku lima menit.
- Batas lima kali percobaan.
- Token CSRF pada formulir.
- Session PHP, tanpa Node.js dan tanpa database.
