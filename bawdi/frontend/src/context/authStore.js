// src/context/authStore.js
import { create } from 'zustand';
import { authAPI } from '../utils/api';

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('bawdi_user') || 'null'),
  token: localStorage.getItem('bawdi_token'),
  loading: false,
  error: null,

  login: async (nik, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await authAPI.login({ nik, password });
      localStorage.setItem('bawdi_token', data.token);
      localStorage.setItem('bawdi_user', JSON.stringify(data.user));
      set({ user: data.user, token: data.token, loading: false });
      return { ok: true, mustChangePassword: data.user.mustChangePassword };
    } catch (err) {
      const msg = err.response?.data?.error || 'Gagal login';
      set({ loading: false, error: msg });
      return { ok: false, error: msg };
    }
  },

  logout: () => {
    localStorage.removeItem('bawdi_token');
    localStorage.removeItem('bawdi_user');
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
