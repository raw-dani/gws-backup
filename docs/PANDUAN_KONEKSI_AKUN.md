# Panduan Koneksi Akun Google (1-Click Browser Login)

Aplikasi **Google Workspace Backup** kini telah mendukung **1-Click Browser Login (Local Loopback Redirect)**. Anda tidak perlu lagi melakukan copy-paste kode otorisasi manual.

---

## Panduan Konfigurasi Google Cloud Console (Tampilan Baru: Google Auth Platform)

Jika Anda belum memiliki **Client ID** & **Client Secret**, ikuti 4 langkah cepat ini:

### Langkah 1: Buat Project
1. Buka [console.cloud.google.com](https://console.cloud.google.com/) dan login dengan akun Google Anda.
2. Di bilah atas sebelah logo Google Cloud, klik dropdown project > klik **NEW PROJECT**.
3. Beri nama (contoh: `GWS-Backup`) lalu klik **CREATE**.

### Langkah 2: Aktifkan API Gmail & Google Drive
1. Di kolom pencarian atas, cari **Gmail API** lalu klik **ENABLE**.
2. Cari lagi **Google Drive API** lalu klik **ENABLE**.

### Langkah 3: Konfigurasi Google Auth Platform (Branding & Audience)
Google kini memperbarui menu konsol menjadi **Google Auth Platform**:
1. Buka menu kiri (atau cari di search bar) > pilih **Google Auth Platform**.
2. Klik sub-menu **Branding**:
   - Masukkan App name: `GWS Backup`
   - Masukkan email pengguna Anda di kolom kontak pengembang, lalu klik **SAVE**.
3. Klik sub-menu **Audience**:
   - Pilih User Type: **External**.
   - Pada bagian **Test Users**, klik **+ ADD USERS**, ketik alamat email Gmail Anda sendiri, lalu klik **Save**.

### Langkah 4: Buat OAuth Client ID di Menu "Clients"
1. Pada menu sebelah kiri Google Auth Platform, klik **Clients**.
2. Di bagian atas, klik tombol **+ Create client**.
3. Pilih Application type: **Web application**.
4. Beri nama (contoh: `GWS Backup`).
5. Pada bagian **Authorized redirect URIs**, klik **+ ADD URI** lalu masukkan:
   ```text
   http://127.0.0.1:8000/api/accounts/callback
   ```
6. Klik **CREATE**.
7. Google akan menampilkan modal berisi **Client ID** dan **Client Secret**. Salin keduanya dan masukkan ke form aplikasi desktop!
