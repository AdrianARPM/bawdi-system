# 🚛 BAWDI — Sistem Pengajuan Maintenance

**PT. Bantu Kawal Distribusi · Pekanbaru, Riau**

Platform web untuk pengajuan service & maintenance kendaraan operasional.
Menggantikan pengajuan kertas dengan sistem digital yang bisa diakses dari HP & laptop.

---

## ✨ Fitur Utama

| Fitur | Keterangan |
|-------|-----------|
| 🔐 **Autentikasi NIK** | Login dengan Nomor Induk Karyawan |
| 📋 **Form PR / PAR** | Multi-step form pengajuan Purchase Requisition & Purchase Auth |
| ✅ **Alur Approval 3 Tingkat** | Operasional → Verifikator → Approval |
| 💬 **Diskusi per Pengajuan** | Chat real-time antara pemohon dan approver |
| ⚠️ **Alert 3 Hari** | Peringatan otomatis jika pengajuan tidak ditanggapi > 3 hari |
| 📴 **Offline Support** | Input data meski sinyal lemah, sync otomatis saat online |
| 👥 **Manajemen User** | Admin dapat tambah, nonaktifkan, dan reset password karyawan |
| 📱 **Mobile-First PWA** | Bisa diinstall di HP seperti aplikasi native |

---

## 🏗️ Arsitektur Sistem

```
Browser/HP  →  Vercel (Frontend React)  →  Railway (Express API)  →  Supabase (PostgreSQL)
```

### Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS + Zustand + PWA (Workbox)
- **Backend**: Node.js + Express.js + JWT Auth
- **Database**: PostgreSQL via Supabase
- **Hosting**: Vercel (frontend) + Railway (backend)

---

## 🚀 Quick Start (Development)

### Prasyarat
- Node.js v18+
- Akun Supabase (gratis)

### 1. Clone & Install

```bash
git clone https://github.com/USERNAME/bawdi-system.git
cd bawdi-system

# Install backend
cd backend && npm install

# Install frontend
cd ../frontend && npm install
```

### 2. Setup Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env dengan kredensial Supabase Anda

# Frontend
echo "VITE_API_URL=http://localhost:4000/api" > frontend/.env
```

### 3. Jalankan Database Migration

Buka Supabase SQL Editor → paste isi `backend/src/utils/schema.sql` → Run

### 4. Seed Data Awal

```bash
cd backend
npm run seed
```

### 5. Jalankan Development Server

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Buka: `http://localhost:3000`

---

## 👥 Akun Default (setelah seed)

| NIK | Nama | Role | Password Default |
|-----|------|------|-----------------|
| 10000 | Admin BAWDI | Admin | 10000 |
| 10001 | Fathiyyah Amanina | Operasional | 10001 |
| 10002 | Yuni Fitriani | Verifikator | 10002 |
| 10003 | Rahmat Yuli | Approval | 10003 |

> ⚠️ **Wajib ganti password setelah login pertama!**

---

## 🌐 Deploy Produksi

Lihat panduan lengkap di file `PANDUAN-DEPLOY-BAWDI.html`

### Ringkasan Deploy:
1. **Supabase** → buat project → jalankan `schema.sql` → ambil URL & service key
2. **Railway** → connect GitHub repo → set env vars → root dir = `backend`
3. **Vercel** → connect GitHub repo → set `VITE_API_URL` → root dir = `frontend`

---

## 📁 Struktur Project

```
bawdi/
├── backend/
│   ├── config/
│   │   └── supabase.js          # Supabase client
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── authController.js       # Login, change password
│   │   │   ├── submissionController.js # CRUD pengajuan + approval
│   │   │   └── messageController.js    # Chat/diskusi
│   │   ├── middleware/
│   │   │   └── auth.js          # JWT verify + role guard
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── submissions.js
│   │   │   ├── messages.js
│   │   │   ├── notifications.js
│   │   │   └── users.js
│   │   ├── utils/
│   │   │   ├── schema.sql       # Database schema (jalankan di Supabase)
│   │   │   └── seed.js          # Data awal karyawan
│   │   └── index.js             # Express app entry point
│   ├── package.json
│   └── railway.toml             # Railway deployment config
│
└── frontend/
    ├── public/
    │   └── icons/               # PWA icons & favicon
    ├── src/
    │   ├── components/
    │   │   ├── Layout.jsx       # Sidebar + topbar wrapper
    │   │   └── ui.jsx           # Shared UI components
    │   ├── context/
    │   │   └── authStore.js     # Zustand auth state
    │   ├── pages/
    │   │   ├── LoginPage.jsx    # Halaman login
    │   │   ├── DashboardPage.jsx
    │   │   ├── SubmissionsPage.jsx
    │   │   ├── DetailPage.jsx   # Detail + chat + approval actions
    │   │   ├── NewFormPage.jsx  # Form multi-step PR/PAR
    │   │   └── UsersPage.jsx    # Admin user management
    │   ├── utils/
    │   │   └── api.js           # Axios instance + API calls + offline queue
    │   ├── App.jsx              # Router & protected routes
    │   ├── main.jsx             # Entry point + SW registration
    │   └── index.css            # Tailwind + custom styles
    ├── index.html
    ├── vercel.json              # SPA routing fix
    ├── vite.config.js           # Vite + PWA config
    ├── tailwind.config.js
    └── postcss.config.js
```

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| POST | `/api/auth/login` | Login dengan NIK + password |
| GET | `/api/auth/me` | Profil user aktif |
| PUT | `/api/auth/change-password` | Ganti password |

### Submissions
| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| GET | `/api/submissions` | List pengajuan (filter by role) |
| GET | `/api/submissions/stats` | Statistik dashboard |
| GET | `/api/submissions/:id` | Detail pengajuan |
| POST | `/api/submissions` | Buat pengajuan baru |
| PUT | `/api/submissions/:id/verify` | Verifikasi (Verifikator) |
| PUT | `/api/submissions/:id/approve` | Setujui (Approval) |
| PUT | `/api/submissions/:id/reject` | Tolak (Approval/Verifikator) |

### Messages & Notifications
| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| GET | `/api/messages/:submissionId` | Riwayat chat |
| POST | `/api/messages/:submissionId` | Kirim pesan |
| GET | `/api/notifications` | Notifikasi user |
| PUT | `/api/notifications/read-all` | Tandai semua dibaca |

### Users (Admin only)
| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| GET | `/api/users` | List semua user |
| POST | `/api/users` | Tambah user baru |
| PUT | `/api/users/:id/toggle-active` | Aktif/nonaktifkan user |
| PUT | `/api/users/:id/reset-password` | Reset password ke NIK |

---

## 🔒 Keamanan

- JWT token dengan expiry 7 hari
- Password di-hash dengan bcrypt (12 rounds)
- Rate limiting: 200 req/15mnt umum, 20 req/15mnt untuk login
- CORS dibatasi hanya ke domain frontend
- Helmet.js untuk HTTP security headers
- `.env` tidak pernah dicommit ke Git

---

## 📞 Kontak & Support

**PT. Bantu Kawal Distribusi**
Jl. Rajawali Sakti, Ruko Komplek Royal Regency, Kota Pekanbaru

Untuk pertanyaan teknis, hubungi tim IT internal.
