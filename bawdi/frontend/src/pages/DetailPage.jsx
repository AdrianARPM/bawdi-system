// src/pages/DetailPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Send, Check, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, messageAPI } from '../utils/api';
import { Pill, Card, Button, Spinner, fmtDate, fmtDateTime, fmtCurrency, daysSince } from '../components/ui';
import useAuthStore from '../context/authStore';

export default function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [sub, setSub] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('detail');
  const [msg, setMsg] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const chatRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await submissionAPI.getOne(id);
      setSub(data.data);
      setMsgs(data.data.messages || []);
    } catch { toast.error('Gagal memuat data pengajuan'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [msgs, tab]);

  // Poll chat tiap 10 detik saat tab chat aktif
  useEffect(() => {
    if (tab !== 'chat') return;
    const t = setInterval(async () => {
      try {
        const { data } = await messageAPI.list(id);
        setMsgs(data.data);
      } catch {}
    }, 10000);
    return () => clearInterval(t);
  }, [tab, id]);

  const doAction = async (action, extraArg) => {
    setActionLoading(true);
    try {
      if (action === 'verify')  await submissionAPI.verify(id);
      if (action === 'approve') await submissionAPI.approve(id);
      if (action === 'reject')  await submissionAPI.reject(id, extraArg);
      toast.success(action === 'reject' ? 'Pengajuan berhasil ditolak' : action === 'approve' ? 'Pengajuan disetujui!' : 'Pengajuan diverifikasi');
      await load();
      setShowRejectModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Terjadi kesalahan');
    }
    setActionLoading(false);
  };

  const sendMsg = async () => {
    if (!msg.trim()) return;
    try {
      const { data } = await messageAPI.send(id, msg.trim());
      setMsgs(prev => [...prev, data.data]);
      setMsg('');
    } catch { toast.error('Gagal mengirim pesan'); }
  };

  if (loading) return <Spinner size={32} />;
  if (!sub) return <div className="text-center py-20 text-slate-400">Pengajuan tidak ditemukan</div>;

  const isAlert = ['Menunggu Verifikasi','Terverifikasi'].includes(sub.status) && daysSince(sub.tanggal) > 3;

  const timeline = [
    { label: 'Pengajuan Dibuat',       info: `${sub.pemohon?.name} · ${fmtDateTime(sub.tanggal)}`,             done: true },
    { label: 'Menunggu Verifikasi',    info: sub.verifikasi_at ? `Diterima ${fmtDate(sub.verifikasi_at)}` : 'Menunggu Verifikator...', done: !!sub.verifikasi_at },
    { label: 'Diverifikasi',           info: sub.verifikator?.name || '—',                                     done: !!sub.verifikator_id },
    { label: 'Keputusan Final',        info: sub.approval_at ? `${sub.status} · ${fmtDate(sub.approval_at)}` : 'Menunggu Approval...', done: !!sub.approval_at, isReject: sub.status === 'Ditolak' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-3">Alasan Penolakan</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4}
              placeholder="Tuliskan alasan penolakan secara jelas..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none resize-none focus:border-red-400 focus:ring-2 focus:ring-red-50" />
            <div className="flex gap-3 mt-4">
              <Button variant="secondary" className="flex-1" onClick={() => setShowRejectModal(false)}>Batal</Button>
              <Button variant="danger" className="flex-1" onClick={() => doAction('reject', rejectReason)} loading={actionLoading}>Tolak</Button>
            </div>
          </div>
        </div>
      )}

      {/* Back */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
          <ChevronLeft size={18} className="text-slate-600" />
        </button>
        <div>
          <p className="text-xs text-slate-400">Detail Pengajuan</p>
          <h1 className="text-base font-black text-slate-800">{sub.nomor_pengajuan}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">{sub.type}</span>
            <Pill status={sub.status} />
            {isAlert && <span className="text-[10px] font-bold text-orange-500">⚠ {daysSince(sub.tanggal)} hari</span>}
          </div>
        </div>
      </div>

      {/* Action Banners */}
      {user.role === 'Verifikator' && sub.status === 'Menunggu Verifikasi' && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-800">Memerlukan Verifikasi Anda</p>
            <p className="text-xs text-blue-500 mt-0.5">Periksa kelengkapan dokumen dan data</p>
          </div>
          <Button variant="info" onClick={() => doAction('verify')} loading={actionLoading}>Verifikasi</Button>
        </div>
      )}
      {user.role === 'Approval' && sub.status === 'Terverifikasi' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-amber-800 mb-3">Menunggu Keputusan Anda</p>
          <div className="flex gap-2.5">
            <Button variant="danger" className="flex-1" onClick={() => setShowRejectModal(true)}>✗ Tolak</Button>
            <Button variant="success" className="flex-1" onClick={() => doAction('approve')} loading={actionLoading}>✓ Setujui</Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 bg-slate-100 p-1 rounded-2xl">
        {[['detail','Detail'],['chat',`Diskusi (${msgs.length})`]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}>{l}
          </button>
        ))}
      </div>

      {/* ─── DETAIL TAB ─────────────────────────────────────────────── */}
      {tab === 'detail' && (
        <div className="space-y-4">
          {/* Timeline */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Alur Status Pengajuan</p>
            {timeline.map((t, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center w-5">
                  <div className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center ${
                    t.done ? t.isReject ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-200'
                  }`}>
                    {t.done && <Check size={10} className="text-white" />}
                  </div>
                  {i < timeline.length-1 && (
                    <div className={`w-0.5 flex-1 min-h-[16px] mt-1 mb-1 ${t.done ? t.isReject ? 'bg-red-200' : 'bg-emerald-200' : 'bg-slate-200'}`} />
                  )}
                </div>
                <div className={`pb-3 ${i === timeline.length-1 ? 'pb-0' : ''}`}>
                  <p className={`text-sm font-semibold ${t.done ? 'text-slate-800' : 'text-slate-400'}`}>{t.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.info}</p>
                </div>
              </div>
            ))}
          </Card>

          {/* Info pemohon */}
          <Card padding={false}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">Informasi Pemohon</p>
            {[
              ['Pemohon', sub.pemohon?.name], ['Jabatan', sub.pemohon?.jabatan],
              ['Cabang / Project', sub.cabang], ['Kendaraan / Plat', sub.kendaraan],
              ['Vendor / Bengkel', sub.vendor], ['Jenis Pembelian', sub.jenis_pembelian],
              ...(sub.npwp ? [['NPWP Vendor', sub.npwp]] : []),
              ['Tanggal Pengajuan', fmtDate(sub.tanggal)],
              ['Batas Waktu Dana', sub.batas_waktu_dana],
              ['Batas Akhir Bayar', sub.batas_akhir_pembayaran ? fmtDate(sub.batas_akhir_pembayaran) : '—'],
            ].map(([k,v],i,arr) => (
              <div key={k} className={`flex justify-between gap-4 px-4 py-2.5 ${i < arr.length-1 ? 'border-b border-slate-50' : ''}`}>
                <span className="text-xs text-slate-400 flex-shrink-0">{k}</span>
                <span className="text-xs font-semibold text-slate-700 text-right">{v || '—'}</span>
              </div>
            ))}
          </Card>

          {/* Items */}
          <Card padding={false}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">Rincian Item</p>
            {(sub.items || []).map((item, i) => (
              <div key={i} className="px-4 py-3 border-b border-slate-50">
                <p className="text-sm font-medium text-slate-700 mb-1.5 leading-relaxed">{item.penjelasan}</p>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400">{item.satuan}</span>
                  <span className="text-xs font-bold text-slate-600">{fmtCurrency(item.total)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center px-4 py-3 bg-amber-50">
              <span className="text-sm font-extrabold text-amber-800">TOTAL PENGAJUAN</span>
              <span className="text-base font-black text-brand-500">{fmtCurrency(sub.total_harga)}</span>
            </div>
          </Card>

          {/* Keterangan */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Keterangan</p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Alasan Pengajuan</p>
                <p className="text-sm text-slate-700 leading-relaxed">{sub.alasan || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Riwayat Sebelumnya</p>
                <p className="text-sm text-slate-700 leading-relaxed">{sub.riwayat || '—'}</p>
              </div>
              {sub.alasan_tolak && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1">Alasan Penolakan</p>
                  <p className="text-sm text-red-700 leading-relaxed">{sub.alasan_tolak}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Tanda tangan */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Tanda Tangan & Persetujuan</p>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: 'Dibuat Oleh', name: sub.pemohon?.name, jabatan: sub.pemohon?.jabatan, done: true },
                { label: 'Diketahui (Verifikator)', name: sub.verifikator?.name, jabatan: sub.verifikator?.jabatan, done: !!sub.verifikator_id },
                { label: 'Disetujui (Approval)', name: sub.approver?.name, jabatan: sub.approver?.jabatan, done: !!sub.approver_id, isReject: sub.status === 'Ditolak' },
              ].map((sig, i) => (
                <div key={i} className={`text-center p-2.5 rounded-xl border ${
                  sig.done ? sig.isReject ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'
                }`}>
                  <p className="text-[9px] text-slate-400 mb-2 leading-tight">{sig.label}</p>
                  <div className={`w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center ${
                    sig.done ? sig.isReject ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-200'
                  }`}>
                    {sig.done ? <Check size={12} className="text-white" /> : <User size={10} className="text-slate-400" />}
                  </div>
                  <p className={`text-[10px] font-bold ${sig.done ? sig.isReject ? 'text-red-700' : 'text-emerald-700' : 'text-slate-400'}`}>
                    {sig.name || 'Menunggu...'}
                  </p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{sig.jabatan || ''}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── CHAT TAB ───────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <Card padding={false} className="flex flex-col">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-bold text-slate-700">Diskusi Pengajuan</p>
            <p className="text-xs text-slate-400 mt-0.5">Antara Pemohon, Verifikator & Approval</p>
          </div>
          <div ref={chatRef} className="px-4 py-3 space-y-3 min-h-[240px] max-h-[400px] overflow-y-auto">
            {msgs.length === 0 && (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Belum ada diskusi</div>
            )}
            {msgs.map((m, i) => {
              const isMe = m.user?.id === user.id;
              if (m.is_system) return (
                <div key={i} className="text-center">
                  <span className="text-[11px] text-slate-500 bg-slate-100 px-3 py-1 rounded-full inline-block">{m.message}</span>
                </div>
              );
              const avatarColors = { Operasional: 'bg-amber-400', Verifikator: 'bg-blue-500', Approval: 'bg-emerald-500', Admin: 'bg-violet-500' };
              const avatarBg = avatarColors[m.user?.role] || 'bg-slate-400';
              return (
                <div key={i} className={`flex gap-2 items-end ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full ${avatarBg} flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white`}>
                    {m.user?.avatar_initials || '?'}
                  </div>
                  <div className={`max-w-[72%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                    <p className="text-[10px] text-slate-400 mb-1">{m.user?.name}</p>
                    <div className={`px-3 py-2 text-sm rounded-2xl leading-relaxed ${
                      isMe ? 'bg-brand-500 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                    }`}>{m.message}</div>
                    <p className="text-[9px] text-slate-300 mt-1">{fmtDateTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-slate-50 flex gap-2">
            <input value={msg} onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              placeholder="Ketik pesan... (Enter untuk kirim)"
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
            <button onClick={sendMsg} disabled={!msg.trim()}
              className="w-10 h-10 rounded-xl bg-brand-500 disabled:bg-slate-200 flex items-center justify-center transition-colors flex-shrink-0">
              <Send size={15} className={msg.trim() ? 'text-white' : 'text-slate-400'} />
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
