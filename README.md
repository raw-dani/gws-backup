# Google Workspace Backup

A production-ready cross-platform desktop backup application for Google Workspace (Gmail & Google Drive).

## Architecture Highlights
- **Backend**: FastAPI, SQLAlchemy (Async SQLite with WAL mode), Argon2id + AES-256-GCM Envelope Encryption.
- **Frontend**: React, TypeScript, Vite, Lucide Icons.
- **Storage**: Directory sharding (`accounts/<id>/gmail/messages/YYYY/MM/<id>.eml`), atomic writes, path-traversal protection.
- **Connectors**:
  - Gmail API with adaptive Token Bucket rate limiter (200 req/sec limit) & RFC 822 `.eml` raw ingestion.
  - Drive API with chunked resumable download and Google Docs/Sheets/Slides export converters.
- **Security**: OS Keyring abstraction for OAuth refresh tokens (never plaintext in DB).
- **Standalone Runtime**: Bundled via PyInstaller (`dist/gws-backend/gws-backend.exe`).

## Quick Start
Run the application launcher:
```bat
run.bat
```
- Backend runs locally at `http://127.0.0.1:8000`
- Frontend UI runs at `http://localhost:5173`

---

## Background & Auto-Backup Behavior

### Apakah Auto-Backup Berjalan Tanpa Membuka Browser?
**Ya, auto-backup tetap berjalan secara otomatis di latar belakang meskipun tab browser ditutup.**

- **Scheduler Berjalan di Service Backend:** Penjadwal otomatis (`LocalScheduler`) dijalankan oleh backend lokal komputer Anda (`gws-backend` / Python), **bukan oleh browser**. Tab browser hanya berfungsi sebagai antarmuka (UI).
- **Background Loop Mandiri:** Backend mengecek jadwal secara otomatis setiap 60 detik. Saat interval tercapai (misal harian / *daily*), backend langsung mengunduh email dan file baru secara incremental tanpa perlu interaksi di browser.
- **Deduplikasi Cerdas (Incremental):** Hanya mengunduh pesan dan file baru yang belum ada di penyimpanan lokal. Email atau dokumen yang sudah tersimpan akan langsung dilewati (`skip`), menghemat kuota Google API dan waktu.
- **Catch-Up Mechanism:** Jika komputer Anda dimatikan atau berada dalam mode tidur (*sleep*) saat jam backup tiba, scheduler akan mendeteksi jadwal yang terlewat dan langsung menjalankan backup segera setelah komputer menyala kembali.

### Menjalankan Otomatis Saat Komputer Dinyalakan (Windows Startup)
Agar service backup selalu aktif tanpa perlu menjalankan `run.bat` manual setiap kali menyalakan komputer:
1. Tekan tombol `Win + R` di keyboard, ketik `shell:startup`, lalu tekan **Enter**.
2. Buat *Shortcut* dari berkas `run.bat` ke dalam folder Startup tersebut.
3. Aplikasi akan otomatis aktif di latar belakang setiap kali Anda login ke Windows.

---

## Fitur Utama & Navigasi
- **1-Click Google OAuth:** Login Google langsung dari browser aktif Anda dengan auto-closing loopback authorization.
- **Live Backup Progress & Stop Button:** Pantau proses pencadangan secara real-time dan hentikan proses kapan saja menggunakan tombol **Stop** tanpa merusak data yang sudah terdownload.
- **Search & Restore (Gmail Viewer):** Cari email lokal, baca isi email (*HTML & Text*) langsung di aplikasi dengan fitur **View Email**, atau unduh file mentah `.eml`.
- **Google Drive Tree:** Jelajahi struktur direktori hierarkis folder dan file Google Drive yang sudah dicadangkan secara interaktif.

---

## Running Tests
Run backend automated unit tests:
```powershell
$env:PYTHONPATH="backend"
.\backend\venv\Scripts\pytest backend\tests
```

