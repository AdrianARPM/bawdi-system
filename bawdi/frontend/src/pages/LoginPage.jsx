// src/pages/LoginPage.jsx  — FIXED (login pakai NIK)
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hash, Lock, Truck, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../utils/api';
import useAuthStore from '../context/authStore';

export default function LoginPage() {
  const { setUser } = useAuthStore();
  const navigate    = useNavigate();
  const [nik,      setNik]      = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!nik.trim() || !password) { toast.error('NIK dan password wajib diisi'); return; }
    setLoading(true);
    try {
      const { data } = await authAPI.login({ nik: nik.trim(), password });
      localStorage.setItem('bawdi_token', data.token);
      localStorage.setItem('bawdi_user',  JSON.stringify(data.user));
      setUser(data.user);
      toast.success(`Selamat datang, ${data.user.name}!`);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login gagal');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mb-4 shadow-lg shadow-amber-500/30">
            <Truck size={28} className="text-white"/>
          </div>
          <h1 className="text-3xl font-black text-white">BAWDI</h1>
          <p className="text-slate-400 text-sm mt-1">PT. Bantu Kawal Distribusi</p>
          <p className="text-slate-500 text-xs mt-0.5">Sistem Pengajuan Maintenance</p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="space-y-4">
          {/* NIK */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">NIK</label>
            <div className="relative">
              <Hash size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"/>
              <input
                type="text"
                value={nik}
                onChange={e => setNik(e.target.value)}
                placeholder="Masukkan NIK Anda"
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 placeholder:text-slate-600 transition-all"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"/>
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full pl-10 pr-11 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 placeholder:text-slate-600 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-bold text-sm transition-all shadow-lg shadow-amber-500/20 mt-2">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                Masuk...
              </span>
            ) : 'Masuk'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Belum punya akun? Hubungi Admin BAWDI
        </p>
      </div>
    </div>
  );
}
