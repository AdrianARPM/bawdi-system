// src/utils/api.js  — v8 (tambah revisionAPI.exportArsip — export Excel arsip per cabang)
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({ baseURL: API_URL, timeout: 30000, headers: { 'Content-Type': 'application/json' } });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('bawdi_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, err => Promise.reject(err));

api.interceptors.response.use(res => res, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('bawdi_token'); localStorage.removeItem('bawdi_user');
    window.location.href = '/login';
  } else if (err.response?.status === 403) {
    toast.error('Anda tidak memiliki izin untuk aksi ini');
  }
  return Promise.reject(err);
});

export const authAPI = {
  login:            d  => api.post('/auth/login', d),         // email + password
  getMe:            () => api.get('/auth/me'),
  changePassword:   d  => api.put('/auth/change-password', d),
  toggleEmailNotif: d  => api.put('/auth/email-notif', d),    // toggle email notif
};
export const submissionAPI = {
  list:         p  => api.get('/submissions', { params: p }),
  stats:        () => api.get('/submissions/stats'),
  overdueAction:() => api.get('/submissions/overdue-action'),
  getOne:       id => api.get(`/submissions/${id}`),
  create:       d  => api.post('/submissions', d),
  verify:       id => api.put(`/submissions/${id}/verify`),
  approve:      id => api.put(`/submissions/${id}/approve`),
  reject:       (id, alasan_tolak) => api.put(`/submissions/${id}/reject`, { alasan_tolak }),
  selectVendor: (id, vendor_pilihan, vendor_pilihan_alasan) =>
    api.put(`/submissions/${id}/select-vendor`, { vendor_pilihan, vendor_pilihan_alasan }),
};
export const messageAPI = {
  list: id      => api.get(`/messages/${id}`),
  send: (id, m) => api.post(`/messages/${id}`, { message: m }),
};
export const notifAPI = {
  list:    () => api.get('/notifications'),
  readAll: () => api.put('/notifications/read-all'),
  readOne: id => api.put(`/notifications/${id}/read`),
};
export const userAPI = {
  list:          () => api.get('/users'),
  create:        d  => api.post('/users', d),
  toggleActive:  id => api.put(`/users/${id}/toggle-active`),
  resetPassword: id => api.put(`/users/${id}/reset-password`),
};
export const photoAPI = {
  upload: (sid, p) => api.post(`/photos/${sid}`, p),
  list:   sid      => api.get(`/photos/${sid}`),
  remove: id       => api.delete(`/photos/${id}`),
};
export const revisionAPI = {
  list:          sid    => api.get(`/revisions/${sid}`),
  request:       (sid,d)=> api.post(`/revisions/${sid}/request`, d),
  uploadNota:    (sid,d)=> api.post(`/revisions/${sid}/nota`, d),
  listNota:      sid    => api.get(`/revisions/${sid}/nota`),
  deleteNota:    notaId => api.delete(`/revisions/nota/${notaId}`),
  recordDP:      (sid,d)=> api.put(`/revisions/${sid}/dp`, d),
  recordPayment: (sid,d)=> api.put(`/revisions/${sid}/payment`, d),
  close:         (sid,d)=> api.put(`/revisions/${sid}/close`, d),
  getDraft:      p      => api.get('/revisions/draft', { params: p }),
  // Export Excel arsip per cabang — responseType blob lalu unduh di browser
  async exportArsip(params = {}) {
    try {
      const res = await api.get('/revisions/draft/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BAWDI - Rekap Arsip ${params.tahun || new Date().getFullYear()}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Respons error datang sebagai Blob — baca pesan asli dari server
      if (err?.response?.data instanceof Blob) {
        try { const j = JSON.parse(await err.response.data.text()); if (j.error) err.message = j.error; } catch {}
      }
      throw err;
    }
  },
  editSnapshot:    (snapId,d)=> api.put(`/revisions/snapshot/${snapId}`, d),
  submitSnapshot:  snapId    => api.put(`/revisions/snapshot/${snapId}/submit`),
  verifySnapshot:  snapId    => api.put(`/revisions/snapshot/${snapId}/verify`),
  approveSnapshot: snapId    => api.put(`/revisions/snapshot/${snapId}/approve`),
  rejectSnapshot:  (snapId,d)=> api.put(`/revisions/snapshot/${snapId}/reject`, d),
};
export const vehicleAPI = {
  list:   (year)        => api.get('/vehicles', { params: { year } }),
  create: (d)           => api.post('/vehicles', d),
  update: (id, d)       => api.put(`/vehicles/${id}`, d),
  report: (plat, year)  => api.get('/vehicles/report', { params: { plat, year } }),
  // Kas kecil (v25) — input manual Super Track
  createKasKecil: (d)     => api.post('/vehicles/kas-kecil', d),
  updateKasKecil: (id, d) => api.put(`/vehicles/kas-kecil/${id}`, d),
  deleteKasKecil: (id)    => api.delete(`/vehicles/kas-kecil/${id}`),
  // Export Excel — responseType blob lalu trigger unduhan di browser
  async exportExcel(year, plat = '') {
    const res = await api.get('/vehicles/export', {
      params: plat ? { year, plat } : { year },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = plat
      ? `BAWDI - Laporan ${plat} ${year}.xlsx`
      : `BAWDI - Laporan Kendaraan ${year}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },
};
export const historyAPI = {
  getVehicleHistory: (kendaraan, limit = 5) =>
    api.get('/history/vehicle', { params: { kendaraan, limit } }),
  getLastKM: (kendaraan, keyword = '') =>
    api.get('/history/last-km', { params: { kendaraan, keyword } }),
  getVehicleItems: (kendaraan) =>
    api.get('/history/items', { params: { kendaraan } }),
};

export const analyticsAPI = {
  get: (months = 6) => api.get('/analytics', { params: { months } }),
};

const QUEUE_KEY = 'bawdi_offline_queue';
export const offlineQueue = {
  add(s) { const q=this.getAll(); q.push({...s,_offlineId:Date.now()}); localStorage.setItem(QUEUE_KEY,JSON.stringify(q)); },
  getAll() { try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');}catch{return [];} },
  remove(id) { localStorage.setItem(QUEUE_KEY,JSON.stringify(this.getAll().filter(i=>i._offlineId!==id))); },
  async sync() {
    const q=this.getAll(); if(!q.length||!navigator.onLine) return;
    let n=0; for(const item of q){try{await submissionAPI.create(item);this.remove(item._offlineId);n++;}catch{}}
    if(n>0) toast.success(`${n} pengajuan offline disinkronkan!`);
  },
};
window.addEventListener('online',()=>offlineQueue.sync());
export default api;
