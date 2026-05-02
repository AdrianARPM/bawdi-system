// src/utils/api.js  — v2
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000, // lebih lama untuk upload foto
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bawdi_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, (err) => Promise.reject(err));

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bawdi_token');
      localStorage.removeItem('bawdi_user');
      window.location.href = '/login';
    } else if (err.response?.status === 403) {
      toast.error('Anda tidak memiliki izin untuk aksi ini');
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login:          (data) => api.post('/auth/login', data),
  getMe:          ()     => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

export const submissionAPI = {
  list:         (params) => api.get('/submissions', { params }),
  stats:        ()       => api.get('/submissions/stats'),
  getOne:       (id)     => api.get(`/submissions/${id}`),
  create:       (data)   => api.post('/submissions', data),
  verify:       (id)     => api.put(`/submissions/${id}/verify`),
  approve:      (id)     => api.put(`/submissions/${id}/approve`),
  reject:       (id, alasan_tolak) => api.put(`/submissions/${id}/reject`, { alasan_tolak }),
  selectVendor: (id, vendor_pilihan, vendor_pilihan_alasan) =>
    api.put(`/submissions/${id}/select-vendor`, { vendor_pilihan, vendor_pilihan_alasan }),
};

export const messageAPI = {
  list: (submissionId)          => api.get(`/messages/${submissionId}`),
  send: (submissionId, message) => api.post(`/messages/${submissionId}`, { message }),
};

export const notifAPI = {
  list:    () => api.get('/notifications'),
  readAll: () => api.put('/notifications/read-all'),
  readOne: (id) => api.put(`/notifications/${id}/read`),
};

export const userAPI = {
  list:          ()     => api.get('/users'),
  create:        (data) => api.post('/users', data),
  toggleActive:  (id)   => api.put(`/users/${id}/toggle-active`),
  resetPassword: (id)   => api.put(`/users/${id}/reset-password`),
};

export const photoAPI = {
  upload: (submissionId, payload) => api.post(`/photos/${submissionId}`, payload),
  list:   (submissionId)          => api.get(`/photos/${submissionId}`),
  remove: (photoId)               => api.delete(`/photos/${photoId}`),
};

// ── Offline queue ─────────────────────────────────────────────────
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
      } catch (err) { console.error('Gagal sync:', err); }
    }
    if (synced > 0) toast.success(`${synced} pengajuan offline berhasil disinkronkan!`);
  },
};

window.addEventListener('online', () => offlineQueue.sync());
export default api;
