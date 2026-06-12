// src/components/Layout.jsx  — v7 (Draft hanya Admin/Verifikator/Approval)
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Plus, Users, LogOut, Menu, Truck, Archive, Bell, BarChart3 } from 'lucide-react';
import useAuthStore from '../context/authStore';
import { notifAPI } from '../utils/api';

const ROLE_COLOR = { Operasional:'bg-amber-400', Verifikator:'bg-blue-500', Approval:'bg-emerald-500', Admin:'bg-violet-500' };
const DRAFT_ROLES = ['Admin', 'Verifikator', 'Approval'];

function NavItem({ to, icon: Icon, label, onClick, badge }) {
  return (
    <NavLink to={to} onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 relative ${
          isActive ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
        }`}>
      <Icon size={15}/>
      {label}
      {badge > 0 && (
        <span className="absolute right-2 top-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate         = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unread,      setUnread]      = useState(0);

  useEffect(() => {
    const fetch = async () => {
      try { const { data } = await notifAPI.list(); setUnread(data.data.filter(n => !n.is_read).length); } catch {}
    };
    fetch();
    const t = setInterval(fetch, 30000);
    return () => clearInterval(t);
  }, []);

  const doLogout = () => { logout(); navigate('/login'); };
  const close    = () => setSidebarOpen(false);

  const sidebar = (
    <div className="flex flex-col h-full bg-slate-900">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          {/* Logo di sidebar */}
            <div className="px-4 py-4 border-b border-slate-800">
              <img src="/Logo.jpg" alt="BAWDI" className="h-8 w-auto"/>
            </div>
          <div>
            <p className="text-white font-extrabold text-sm leading-none">BAWDI</p>
            <p className="text-slate-500 text-[10px] mt-0.5">Maintenance System</p>
          </div>
        </div>
      </div>

      {/* User badge */}
      <div className="px-3 py-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2.5 bg-slate-800 rounded-xl px-3 py-2">
          <div className={`w-7 h-7 rounded-full ${ROLE_COLOR[user?.role]||'bg-amber-500'} flex items-center justify-center flex-shrink-0`}>
            <span className="text-white text-[10px] font-bold">{user?.avatar_initials||'?'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-slate-200 text-xs font-semibold truncate">{user?.name}</p>
            <p className="text-slate-500 text-[10px]">{user?.role}</p>
            {user?.email && <p className="text-slate-600 text-[9px] truncate">{user.email}</p>}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3">
        <NavItem to="/"            icon={LayoutDashboard} label="Dashboard"      onClick={close} badge={unread}/>
        <NavItem to="/submissions" icon={FileText}
          label={user?.role==='Operasional'?'Pengajuan Saya':'Semua Pengajuan'} onClick={close}/>
        {['Operasional','Admin'].includes(user?.role) && (
          <NavItem to="/new" icon={Plus} label="Buat Pengajuan" onClick={close}/>
        )}
        {/* Draft hanya untuk Admin, Verifikator, Approval */}
        {DRAFT_ROLES.includes(user?.role) && (
          <NavItem to="/draft" icon={Archive} label="Draft / Arsip" onClick={close}/>
        )}
        {/* Analitik — manajemen & Kepala Operasional */}
        {(['Admin','Verifikator','Approval'].includes(user?.role) || user?.jabatan === 'Kepala Operasional') && (
          <NavItem to="/analytics" icon={BarChart3} label="Analitik" onClick={close}/>
        )}
        {(['Admin','Verifikator','Approval'].includes(user?.role) || user?.jabatan === 'Kepala Operasional') && (
          <NavItem to="/vehicles" icon={Truck} label="Master Kendaraan" onClick={close}/>
        )}
        {user?.role === 'Admin' && (
          <NavItem to="/users" icon={Users} label="Kelola User" onClick={close}/>
        )}
      </nav>

      {/* Logout */}
      <div className="px-2.5 py-3 border-t border-slate-800">
        <button onClick={doLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all font-[inherit]">
          <LogOut size={15}/> Keluar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      <div className="hidden md:block w-52 flex-shrink-0">{sidebar}</div>
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={close}/>
          <div className="absolute top-0 left-0 bottom-0 w-56 z-50">{sidebar}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile topbar */}
        <header className="md:hidden bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg border border-slate-200">
            <Menu size={18} className="text-slate-600"/>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center">
              <img src="/Logo.jpg" alt="BAWDI" className="h-6 w-auto"/>
            </div>
            <span className="font-extrabold text-slate-800 text-sm">BAWDI</span>
          </div>
          <div className="relative">
            <div className={`w-7 h-7 rounded-full ${ROLE_COLOR[user?.role]||'bg-amber-500'} flex items-center justify-center`}>
              <span className="text-white text-[10px] font-bold">{user?.avatar_initials||'?'}</span>
            </div>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6"><Outlet/></main>
      </div>
    </div>
  );
}
