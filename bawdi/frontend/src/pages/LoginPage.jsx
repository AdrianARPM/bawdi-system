// src/pages/LoginPage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Eye, EyeOff, Lock, User } from 'lucide-react';
import useAuthStore from '../context/authStore';

// Akun demo yang ditampilkan di form (hanya untuk development)
const DEMO_ACCOUNTS = [
  { nik: '10001', name: 'Fathiyyah Amanina', role: 'Operasional', color: 'bg-amber-400' },
  { nik: '10002', name: 'Yuni Fitriani',     role: 'Verifikator',  color: 'bg-blue-500'  },
  { nik: '10003', name: 'Rahmat Yuli',        role: 'Approval',    color: 'bg-emerald-500'},
  { nik: '10000', name: 'Admin BAWDI',        role: 'Admin',       color: 'bg-violet-500' },
];

const IS_DEV = import.meta.env.DEV;

export default function LoginPage() {
  const navigate      = useNavigate();
  const { login, user, loading, error, clearError } = useAuthStore();
  const [nik,      setNik]      = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);

  // Jika sudah login, redirect ke dashboard
  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  // Clear error saat input berubah
  useEffect(() => { clearError(); }, [nik, password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nik.trim() || !password) return;
    const result = await login(nik.trim(), password);
    if (result.ok) navigate('/', { replace: true });
  };

  const quickLogin = async (acc) => {
    setNik(acc.nik);
    setPassword(acc.nik); // password default = NIK
    const result = await login(acc.nik, acc.nik);
    if (result.ok) navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 40%, #0F172A 100%)' }}>

      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-5"
        style={{ background: '#F59E0B', filter: 'blur(80px)', pointerEvents: 'none' }} />
      <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-5"
        style={{ background: '#3B82F6', filter: 'blur(80px)', pointerEvents: 'none' }} />

      <div className="w-full max-w-sm relative z-10">

        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
            <Truck size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">BAWDI</h1>
          <p className="text-slate-400 text-sm mt-1.5">Sistem Pengajuan Maintenance</p>
          <p className="text-slate-600 text-xs mt-1">PT. Bantu Kawal Distribusi · Pekanbaru</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-3xl shadow-2xl shadow-black/30 p-7">
          <h2 className="text-lg font-black text-slate-800 mb-0.5">Masuk ke Sistem</h2>
          <p className="text-slate-400 text-xs mb-6">Gunakan NIK dan password Anda</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* NIK Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                Nomor Induk Karyawan (NIK)
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={nik}
                  onChange={e => setNik(e.target.value)}
                  placeholder="Contoh: 10001"
                  autoComplete="username"
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm font-medium text-slate-800 outline-none transition-all
                    placeholder:text-slate-300 placeholder:font-normal
                    ${error ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'}`}
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password Anda"
                  autoComplete="current-password"
                  className={`w-full pl-10 pr-10 py-3 rounded-xl border text-sm font-medium text-slate-800 outline-none transition-all
                    placeholder:text-slate-300 placeholder:font-normal
                    ${error ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                            : 'border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-semibold text-red-600 text-center animate-fade-in">
                ⚠ {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !nik || !password}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all
                bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white shadow-lg shadow-amber-500/30
                disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                  Memverifikasi...
                </span>
              ) : 'Masuk →'}
            </button>
          </form>

          {/* Help text */}
          <p className="text-center text-xs text-slate-400 mt-4">
            Lupa password? Hubungi Admin untuk reset akun.
          </p>

          {/* Demo accounts (hanya tampil di mode development) */}
          {IS_DEV && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center mb-3">
                ⚡ Demo — Klik untuk Login Cepat
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map(acc => (
                  <button
                    key={acc.nik}
                    onClick={() => quickLogin(acc)}
                    disabled={loading}
                    className="flex items-center gap-2 p-2 rounded-xl border border-slate-100 hover:border-amber-200 hover:bg-amber-50 transition-all text-left group">
                    <div className={`w-7 h-7 rounded-full ${acc.color} flex items-center justify-center flex-shrink-0`}>
                      <span className="text-white text-[9px] font-bold">
                        {acc.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-700 truncate">{acc.name.split(' ')[0]}</p>
                      <p className="text-[9px] text-slate-400">{acc.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Password default = NIK karyawan. Ganti setelah login pertama.
        </p>
      </div>
    </div>
  );
}
