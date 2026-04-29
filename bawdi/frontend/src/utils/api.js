// src/utils/api.js
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: tambahkan JWT token ──────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('bawdi_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => Promise.reject(err)
);

// ── Response interceptor: handle 401 ──────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bawdi_token');
      localStorage.removeItem('bawdi_user');
      window.location.href = '/login';
    } else if (err.response?.status === 403) {
      toast.error('Anda tidak memiliki izin untuk melakukan aksi ini');
    } else if (!navigator.onLine) {
      toast.error('Tidak ada koneksi internet. Data akan disinkronkan saat online kembali.');
    }
    return Promise.reject(err);
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  getMe:          ()     => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

// ═══════════════════════════════════════════════════════════════════════════
// SUBMISSIONS
// ═══════════════════════════════════════════════════════════════════════════
export const submissionAPI = {
  list:    (params) => api.get('/submissions', { params }),
  stats:   ()       => api.get('/submissions/stats'),
  getOne:  (id)     => api.get(`/submissions/${id}`),
  create:  (data)   => api.post('/submissions', data),
  verify:  (id)     => api.put(`/submissions/${id}/verify`),
  approve: (id)     => api.put(`/submissions/${id}/approve`),
  reject:  (id, alasan_tolak) => api.put(`/submissions/${id}/reject`, { alasan_tolak }),
};

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════
export const messageAPI = {
  list: (submissionId)          => api.get(`/messages/${submissionId}`),
  send: (submissionId, message) => api.post(`/messages/${submissionId}`, { message }),
};

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
export const notifAPI = {
  list:    ()   => api.get('/notifications'),
  readAll: ()   => api.put('/notifications/read-all'),
  readOne: (id) => api.put(`/notifications/${id}/read`),
};

// ═══════════════════════════════════════════════════════════════════════════
// USERS (Admin)
// ═══════════════════════════════════════════════════════════════════════════
export const userAPI = {
  list:          ()     => api.get('/users'),
  create:        (data) => api.post('/users', data),
  toggleActive:  (id)   => api.put(`/users/${id}/toggle-active`),
  resetPassword: (id)   => api.put(`/users/${id}/reset-password`),
};

// ═══════════════════════════════════════════════════════════════════════════
// OFFLINE QUEUE — simpan pengajuan saat offline, kirim saat online
// ═══════════════════════════════════════════════════════════════════════════
const QUEUE_KEY = 'bawdi_offline_queue';

export const offlineQueue = {
  add(submission) {
    const queue = this.getAll();
    queue.push({ ...submission, _offlineId: Date.now(), _queuedAt: new Date().toISOString() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },
  getAll() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
  },
  remove(offlineId) {
    const q = this.getAll().filter(i => i._offlineId !== offlineId);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  },
  async sync() {
    const queue = this.getAll();
    if (!queue.length || !navigator.onLine) return;
    let synced = 0;
    for (const item of queue) {
      try {
        await submissionAPI.create(item);
        this.remove(item._offlineId);
        synced++;
      } catch (err) {
        console.error('Gagal sync offline item:', err);
      }
    }
    if (synced > 0) toast.success(`${synced} pengajuan offline berhasil disinkronkan!`);
    return synced;
  },
};

// Auto-sync saat kembali online
window.addEventListener('online', () => offlineQueue.sync());

export default api;
