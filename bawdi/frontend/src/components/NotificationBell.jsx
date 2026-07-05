// src/components/NotificationBell.jsx — bell + dropdown daftar notifikasi
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, Check, X } from 'lucide-react';
import { notifAPI, pushAPI } from '../utils/api';

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)  return 'baru saja';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} hari lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

const PUSH_SUPPORTED = typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// variant: 'light' (topbar terang) | 'dark' (sidebar gelap)
export default function NotificationBell({ variant = 'light' }) {
  const navigate = useNavigate();
  const [open,  setOpen]  = useState(false);
  const [items, setItems] = useState([]);
  const [push,  setPush]  = useState('hidden'); // hidden | off | on | busy

  useEffect(() => {
    if (!PUSH_SUPPORTED) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPush(sub ? 'on' : 'off');
      } catch { /* SW belum siap → sembunyikan */ }
    })();
  }, []);

  const togglePush = async () => {
    if (push === 'busy') return;
    setPush('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await pushAPI.unsubscribe(existing.endpoint).catch(() => {});
        await existing.unsubscribe();
        setPush('off'); return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPush('off'); return; }
      const { data } = await pushAPI.vapidKey();
      if (!data?.key) { alert('Notifikasi perangkat belum dikonfigurasi di server.'); setPush('off'); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key),
      });
      await pushAPI.subscribe(sub.toJSON());
      setPush('on');
    } catch (e) {
      console.error('[push]', e);
      setPush('off');
    }
  };

  const load = async () => {
    try { const { data } = await notifAPI.list(); setItems(data.data || []); } catch {}
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const unread = items.filter(n => !n.is_read).length;

  const openNotif = async (n) => {
    setOpen(false);
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    try { if (!n.is_read) await notifAPI.readOne(n.id); } catch {}
    if (n.submission_id) navigate(`/submissions/${n.submission_id}`);
  };

  const markAll = async () => {
    setItems(prev => prev.map(x => ({ ...x, is_read: true })));
    try { await notifAPI.readAll(); } catch {}
  };

  const btnCls = variant === 'dark'
    ? 'text-slate-300 hover:bg-slate-800'
    : 'text-slate-600 hover:bg-slate-100';
  const panelPos = variant === 'dark'
    ? 'top-20 left-[13.5rem]'
    : 'top-14 right-3';

  return (
    <>
      <button onClick={() => setOpen(o => !o)} aria-label="Notifikasi"
        className={`relative p-1.5 rounded-lg transition-colors ${btnCls}`}>
        <Bell size={18}/>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className={`fixed z-50 ${panelPos} w-[min(360px,calc(100vw-1.5rem))] max-h-[70vh] bg-white rounded-2xl border border-slate-200 shadow-xl flex flex-col overflow-hidden`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <p className="text-sm font-black text-slate-800">Notifikasi{unread > 0 ? ` (${unread})` : ''}</p>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAll} className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700">
                    <Check size={12}/> Tandai semua
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Tutup"><X size={14}/></button>
              </div>
            </div>
            <div className="overflow-y-auto">
              {items.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell size={26} className="text-slate-300 mx-auto mb-2"/>
                  <p className="text-xs text-slate-400">Belum ada notifikasi</p>
                </div>
              ) : items.map(n => (
                <button key={n.id} onClick={() => openNotif(n)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-2.5 ${n.is_read ? '' : 'bg-amber-50/40'}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? 'bg-transparent' : 'bg-amber-500'}`}/>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs leading-snug ${n.is_read ? 'text-slate-500' : 'text-slate-700 font-medium'}`}>{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {n.submission?.nomor_pengajuan ? `${n.submission.nomor_pengajuan} · ` : ''}{timeAgo(n.created_at)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {push !== 'hidden' && (
              <div className="px-4 py-2.5 border-t border-slate-100 flex-shrink-0 bg-slate-50/60">
                <button onClick={togglePush} disabled={push === 'busy'}
                  className={`w-full flex items-center justify-center gap-1.5 text-[11px] font-bold rounded-lg py-2 transition-colors ${
                    push === 'on'
                      ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-100'
                  }`}>
                  <BellRing size={12}/>
                  {push === 'on' ? 'Notifikasi perangkat aktif — ketuk untuk matikan'
                    : push === 'busy' ? 'Memproses...'
                    : 'Aktifkan notifikasi perangkat (HP/desktop)'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
