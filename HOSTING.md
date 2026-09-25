# Instalasi WebOTP lewat Terminal atau FTP

## Prasyarat

Hosting harus menyediakan **Node.js 18 atau lebih baru**, npm, dan MySQL/TiDB. FTP hanya digunakan untuk mengunggah file; FTP sendiri tidak dapat menjalankan script shell.

## Cara 1: VPS atau terminal hosting dengan Git

### Autoinstall satu perintah

```bash
curl -fsSL https://raw.githubusercontent.com/usnulnifah-web/webotp/main/autoinstall.sh -o autoinstall.sh
chmod 700 autoinstall.sh
export DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/NAMA_DATABASE'
export JWT_SECRET='ganti-dengan-rahasia-minimal-32-karakter'
bash autoinstall.sh
```

Untuk shared hosting tanpa systemd, tambahkan `--no-systemd`:

```bash
bash autoinstall.sh --no-systemd --port 3000
```

```bash
git clone https://github.com/usnulnifah-web/webotp.git
cd webotp
export DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/NAMA_DATABASE'
export JWT_SECRET='ganti-dengan-rahasia-minimal-32-karakter'
bash install.sh
```

Pada VPS root dengan systemd, installer membuat service `webotp.service` dan mengaktifkan auto-start setelah reboot.

## Cara 2: Upload melalui FTP

1. Clone atau download source repository di komputer.
2. Upload seluruh isi repository ke folder aplikasi melalui FTP. Pastikan `package.json`, `pnpm-lock.yaml`, `install.sh`, dan folder `server`, `client`, `drizzle`, serta `shared` ikut ter-upload.
3. Buka Terminal/SSH hosting dan masuk ke folder tersebut.
4. Jalankan:

```bash
chmod 700 install.sh
export DATABASE_URL='mysql://USER:PASSWORD@HOST:3306/NAMA_DATABASE'
export JWT_SECRET='ganti-dengan-rahasia-minimal-32-karakter'
bash install.sh --no-systemd --port 3000
```

5. Di cPanel/Plesk/DirectAdmin, buat **Node.js Application** dengan:
   - Node.js: 18+
   - Application root: folder upload tadi
   - Startup file: `start-hosting.js`
   - Application URL/port: port yang diberikan panel hosting
   - Environment variables: `DATABASE_URL`, `JWT_SECRET`, dan `PORT`

Pada shared hosting, jangan menjalankan `pnpm dev`; gunakan `start-hosting.js` sebagai startup file Node.js, atau `start-hosting.sh` dari Terminal.

## Pemeriksaan

```bash
curl http://127.0.0.1:3000/health
pnpm check
pnpm test
pnpm build
```

Jangan meng-upload `.env` melalui FTP jika berisi password database. Buat `.env` langsung melalui Terminal atau Environment Variables panel. Repository ini masih private; jangan menjadikannya public sebelum source dan konfigurasi internal diperiksa.
