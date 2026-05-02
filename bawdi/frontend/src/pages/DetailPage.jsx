// src/pages/DetailPage.jsx  — v2 (Vendor Comparison + Photos + Vendor Selection)
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Send, Check, User, Download, Eye, X, ZoomIn } from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, messageAPI } from '../utils/api';
import { Pill, Card, Button, Spinner, fmtDate, fmtDateTime, fmtCurrency, daysSince } from '../components/ui';
import useAuthStore from '../context/authStore';

// ── Lightbox viewer foto ──────────────────────────────────────────
function PhotoLightbox({ photo, onClose }) {
  if (!photo) return null;
  const isImage = photo.file_url.match(/\.(jpg|jpeg|png|webp|heic)/i);
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10 hover:bg-white/20" onClick={onClose}>
        <X size={20} />
      </button>
      <div className="max-w-3xl max-h-full" onClick={e => e.stopPropagation()}>
        <p className="text-white text-sm font-semibold mb-3 text-center">{photo.file_name}</p>
        {isImage ? (
          <img src={photo.file_url} alt={photo.file_name}
            className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl" />
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-slate-600 mb-4">📄 {photo.file_name}</p>
            <a href={photo.file_url} target="_blank" rel="noreferrer"
              className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
              Buka PDF
            </a>
          </div>
        )}
        <div className="flex justify-center mt-4">
          <a href={photo.file_url} download={photo.file_name} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Download size={15} /> Download Foto
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Vendor Comparison Card ────────────────────────────────────────
function VendorCompare({ sub, user, onSelectVendor }) {
  const [showModal,  setShowModal]  = useState(false);
  const [selectedV,  setSelectedV]  = useState(null);
  const [alasan,     setAlasan]     = useState('');
  const [saving,     setSaving]     = useState(false);

  const items1 = (sub.items || []).filter(i => i.vendor_num !== 2);
  const items2 = (sub.items || []).filter(i => i.vendor_num === 2);
  const total1 = items1.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const total2 = items2.reduce((s, i) => s + (Number(i.total) || 0), 0);
  const hasVendor2 = sub.vendor2_selected && items2.length > 0;
  const canSelect = user.role === 'Approval' && !sub.vendor_pilihan && ['Terverifikasi'].includes(sub.status);

  const doSelect = async () => {
    if (!alasan.trim()) { toast.error('Alasan wajib diisi'); return; }
    setSaving(true);
    try {
      await onSelectVendor(selectedV, alasan);
      setShowModal(false);
    } catch {}
    setSaving(false);
  };

  return (
    <>
      {/* Modal pilih vendor */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-1">
              Pilih Vendor {selectedV}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {selectedV === 1 ? sub.vendor : sub.vendor2}
            </p>
            <textarea value={alasan} onChange={e => setAlasan(e.target.value)} rows={3}
              placeholder="Alasan memilih vendor ini (kualitas, harga, rekanan, dll)..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none resize-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 mb-4" />
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Batal</Button>
              <Button className="flex-1" onClick={doSelect} loading={saving}>Konfirmasi Pilihan</Button>
            </div>
          </div>
        </div>
      )}

      <Card padding={false}>
        <div className="px-4 pt-3 pb-2 border-b border-slate-50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Perbandingan Vendor</p>
        </div>

        <div className={`grid ${hasVendor2 ? 'grid-cols-2' : 'grid-cols-1'} divide-x divide-slate-100`}>
          {/* Vendor 1 */}
          <div className={`p-4 ${sub.vendor_pilihan === 1 ? 'bg-emerald-50' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-[10px] font-black">1</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700 truncate">{sub.vendor}</p>
                {sub.npwp && <p className="text-[9px] text-slate-400">NPWP: {sub.npwp}</p>}
              </div>
              {sub.vendor_pilihan === 1 && (
                <span className="ml-auto flex-shrink-0 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">✓ Dipilih</span>
              )}
            </div>
            {items1.map((item, i) => (
              <div key={i} className="text-xs text-slate-600 py-1 border-b border-slate-50 last:border-0">
                <p className="font-medium">{item.penjelasan}</p>
                <div className="flex justify-between text-slate-400 mt-0.5">
                  <span>{item.satuan}</span>
                  <span className="font-semibold text-slate-600">{fmtCurrency(item.total)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200">
              <span className="text-xs font-bold text-slate-600">Total</span>
              <span className="text-sm font-black text-blue-600">{fmtCurrency(total1)}</span>
            </div>
            {canSelect && (
              <button onClick={() => { setSelectedV(1); setShowModal(true); }}
                className="w-full mt-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold transition-colors">
                Pilih Vendor 1
              </button>
            )}
          </div>

          {/* Vendor 2 */}
          {hasVendor2 && (
            <div className={`p-4 ${sub.vendor_pilihan === 2 ? 'bg-emerald-50' : ''}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-black">2</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate">{sub.vendor2}</p>
                  {sub.npwp2 && <p className="text-[9px] text-slate-400">NPWP: {sub.npwp2}</p>}
                </div>
                {sub.vendor_pilihan === 2 && (
                  <span className="ml-auto flex-shrink-0 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">✓ Dipilih</span>
                )}
              </div>
              {items2.map((item, i) => (
                <div key={i} className="text-xs text-slate-600 py-1 border-b border-slate-50 last:border-0">
                  <p className="font-medium">{item.penjelasan}</p>
                  <div className="flex justify-between text-slate-400 mt-0.5">
                    <span>{item.satuan}</span>
                    <span className="font-semibold text-slate-600">{fmtCurrency(item.total)}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-600">Total</span>
                <span className="text-sm font-black text-orange-500">{fmtCurrency(total2)}</span>
              </div>
              {canSelect && (
                <button onClick={() => { setSelectedV(2); setShowModal(true); }}
                  className="w-full mt-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-colors">
                  Pilih Vendor 2
                </button>
              )}
            </div>
          )}
        </div>

        {/* Selisih harga */}
        {hasVendor2 && total1 > 0 && total2 > 0 && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
            <p className="text-xs text-slate-500 text-center">
              Selisih harga: <strong className={total1 < total2 ? 'text-blue-600' : 'text-orange-500'}>{fmtCurrency(Math.abs(total1 - total2))}</strong>
              {' '}— Vendor {total1 <= total2 ? '1' : '2'} lebih hemat
            </p>
          </div>
        )}

        {/* Alasan pilihan vendor */}
        {sub.vendor_pilihan && sub.vendor_pilihan_alasan && (
          <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-600 mb-1">ALASAN PEMILIHAN VENDOR</p>
            <p className="text-xs text-emerald-700">{sub.vendor_pilihan_alasan}</p>
          </div>
        )}
      </Card>
    </>
  );
}

// ── Main Detail Page ──────────────────────────────────────────────
export default function DetailPage() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuthStore();
  const [sub,        setSub]        = useState(null);
  const [msgs,       setMsgs]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('detail');
  const [msg,        setMsg]        = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading, setActionLoading]     = useState(false);
  const [lightboxPhoto, setLightboxPhoto]     = useState(null);
  const chatRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await submissionAPI.getOne(id);
      setSub(data.data);
      setMsgs(data.data.messages || []);
    } catch { toast.error('Gagal memuat pengajuan'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [msgs, tab]);

  useEffect(() => {
    if (tab !== 'chat') return;
    const t = setInterval(async () => {
      try { const { data } = await messageAPI.list(id); setMsgs(data.data); } catch {}
    }, 10000);
    return () => clearInterval(t);
  }, [tab, id]);

  const doAction = async (action, extraArg) => {
    setActionLoading(true);
    try {
      if (action === 'verify')  await submissionAPI.verify(id);
      if (action === 'approve') await submissionAPI.approve(id);
      if (action === 'reject')  await submissionAPI.reject(id, extraArg);
      toast.success(action === 'approve' ? '✅ Pengajuan disetujui!' : action === 'verify' ? '✅ Pengajuan diverifikasi' : '❌ Pengajuan ditolak');
      await load();
      setShowRejectModal(false);
    } catch (err) { toast.error(err.response?.data?.error || 'Terjadi kesalahan'); }
    setActionLoading(false);
  };

  const doSelectVendor = async (vendorNum, alasan) => {
    try {
      await submissionAPI.selectVendor(id, vendorNum, alasan);
      toast.success(`✅ Vendor ${vendorNum} berhasil dipilih`);
      await load();
    } catch (err) { toast.error(err.response?.data?.error || 'Gagal memilih vendor'); throw err; }
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
  if (!sub)    return <div className="text-center py-20 text-slate-400">Pengajuan tidak ditemukan</div>;

  const isAlert   = ['Menunggu Verifikasi','Terverifikasi'].includes(sub.status) && daysSince(sub.tanggal) > 2;
  const photos    = sub.photos || [];
  const timeline  = [
    { label: 'Dibuat',         info: `${sub.pemohon?.name} · ${fmtDateTime(sub.tanggal)}`,                      done: true },
    { label: 'Menunggu Verifikasi', info: sub.verifikasi_at ? `Diterima ${fmtDate(sub.verifikasi_at)}` : 'Menunggu...', done: !!sub.verifikasi_at },
    { label: 'Diverifikasi',   info: sub.verifikator?.name || '—',                                              done: !!sub.verifikator_id },
    { label: 'Keputusan Final',info: sub.approval_at ? `${sub.status} · ${fmtDate(sub.approval_at)}` : 'Menunggu...', done: !!sub.approval_at, isReject: sub.status === 'Ditolak' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Lightbox */}
      {lightboxPhoto && <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-3">Alasan Penolakan</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4}
              placeholder="Tuliskan alasan penolakan secara jelas..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-red-400 focus:ring-2 focus:ring-red-50 mb-4" />
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={() => setShowRejectModal(false)}>Batal</Button>
              <Button variant="danger"    className="flex-1" onClick={() => doAction('reject', rejectReason)} loading={actionLoading}>Tolak</Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50">
          <ChevronLeft size={18} className="text-slate-600" />
        </button>
        <div>
          <p className="text-xs text-slate-400">Detail Pengajuan</p>
          <h1 className="text-base font-black text-slate-800">{sub.nomor_pengajuan}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{sub.type}</span>
            <Pill status={sub.status} />
            {isAlert && <span className="text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">⚠ {daysSince(sub.tanggal)} hari</span>}
          </div>
        </div>
      </div>

      {/* Action Banners */}
      {user.role === 'Verifikator' && sub.status === 'Menunggu Verifikasi' && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-800">Perlu Verifikasi Anda</p>
            <p className="text-xs text-blue-400 mt-0.5">Periksa foto dan kelengkapan dokumen</p>
          </div>
          <Button variant="info" onClick={() => doAction('verify')} loading={actionLoading}>Verifikasi</Button>
        </div>
      )}
      {user.role === 'Approval' && sub.status === 'Terverifikasi' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-amber-800 mb-1">Menunggu Keputusan Anda</p>
          <p className="text-xs text-amber-500 mb-3">
            {sub.vendor2_selected ? '👆 Pilih vendor terlebih dahulu sebelum menyetujui.' : 'Setujui atau tolak pengajuan ini.'}
          </p>
          <div className="flex gap-2.5">
            <Button variant="danger"   className="flex-1" onClick={() => setShowRejectModal(true)}>✗ Tolak</Button>
            <Button variant="success"  className="flex-1" onClick={() => doAction('approve')} loading={actionLoading}>✓ Setujui</Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 bg-slate-100 p-1 rounded-2xl">
        {[['detail','Detail'], ['foto',`Foto (${photos.length})`], ['chat',`Diskusi (${msgs.length})`]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${tab===t?'bg-white text-slate-800 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>{l}
          </button>
        ))}
      </div>

      {/* ─── DETAIL ─────────────────────────────────────── */}
      {tab === 'detail' && (
        <div className="space-y-4">
          {/* Timeline */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Alur Status</p>
            {timeline.map((t, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center w-5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${t.done ? t.isReject ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-200'}`}>
                    {t.done && <Check size={10} className="text-white" />}
                  </div>
                  {i < timeline.length-1 && <div className={`w-0.5 flex-1 min-h-[14px] mt-1 mb-1 ${t.done ? 'bg-emerald-200' : 'bg-slate-200'}`} />}
                </div>
                <div className={`pb-3 ${i===timeline.length-1?'pb-0':''}`}>
                  <p className={`text-sm font-semibold ${t.done?'text-slate-800':'text-slate-400'}`}>{t.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.info}</p>
                </div>
              </div>
            ))}
          </Card>

          {/* Vendor comparison */}
          <VendorCompare sub={sub} user={user} onSelectVendor={doSelectVendor} />

          {/* Info pemohon */}
          <Card padding={false}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">Informasi Pemohon</p>
            {[
              ['Pemohon', sub.pemohon?.name], ['Jabatan', sub.pemohon?.jabatan],
              ['Cabang', sub.cabang], ['Kendaraan', sub.kendaraan],
              ['Jenis Pembelian', sub.jenis_pembelian],
              ['Tgl Pengajuan', fmtDate(sub.tanggal)],
              ['Batas Waktu Dana', sub.batas_waktu_dana],
              ['Batas Akhir Bayar', sub.batas_akhir_pembayaran ? fmtDate(sub.batas_akhir_pembayaran) : '—'],
              ['Total Disetujui', sub.vendor_pilihan ? fmtCurrency(sub.total_harga) : '(belum dipilih)'],
            ].map(([k,v],i,arr) => (
              <div key={k} className={`flex justify-between gap-4 px-4 py-2.5 ${i<arr.length-1?'border-b border-slate-50':''}`}>
                <span className="text-xs text-slate-400 flex-shrink-0">{k}</span>
                <span className="text-xs font-semibold text-slate-700 text-right">{v||'—'}</span>
              </div>
            ))}
          </Card>

          {/* Keterangan */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Keterangan</p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Alasan Pengajuan</p>
                <p className="text-sm text-slate-700 leading-relaxed">{sub.alasan || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Riwayat Sebelumnya</p>
                <p className="text-sm text-slate-700 leading-relaxed">{sub.riwayat || '—'}</p>
              </div>
              {sub.alasan_tolak && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Alasan Penolakan</p>
                  <p className="text-sm text-red-700 leading-relaxed">{sub.alasan_tolak}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Tanda tangan */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Tanda Tangan</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Dibuat', name: sub.pemohon?.name,    jabatan: sub.pemohon?.jabatan, done: true },
                { label: 'Verifikator', name: sub.verifikator?.name, jabatan: sub.verifikator?.jabatan, done: !!sub.verifikator_id },
                { label: 'Approval',    name: sub.approver?.name,    jabatan: sub.approver?.jabatan, done: !!sub.approver_id, isReject: sub.status==='Ditolak' },
              ].map((sig, i) => (
                <div key={i} className={`text-center p-2.5 rounded-xl border ${sig.done ? sig.isReject ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                  <p className="text-[9px] text-slate-400 mb-1.5 leading-tight">{sig.label}</p>
                  <div className={`w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center ${sig.done ? sig.isReject ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-200'}`}>
                    {sig.done ? <Check size={12} className="text-white" /> : <User size={10} className="text-slate-400" />}
                  </div>
                  <p className={`text-[10px] font-bold ${sig.done ? sig.isReject ? 'text-red-700':'text-emerald-700' : 'text-slate-400'}`}>{sig.name||'Menunggu...'}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{sig.jabatan||''}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── FOTO ───────────────────────────────────────── */}
      {tab === 'foto' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-bold text-slate-700">Foto Lampiran</p>
            <p className="text-xs text-slate-400 mt-0.5">Klik foto untuk memperbesar · Klik Download untuk menyimpan</p>
          </div>
          {photos.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-3xl mb-2">📷</p>
              <p className="text-sm text-slate-400">Belum ada foto terlampir</p>
            </div>
          ) : (
            <div className="p-4 grid grid-cols-2 gap-3">
              {photos.map(photo => {
                const isImage = photo.file_url?.match(/\.(jpg|jpeg|png|webp|heic)/i);
                return (
                  <div key={photo.id} className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    {/* Thumbnail */}
                    <div className="relative aspect-square bg-slate-100 cursor-pointer group"
                      onClick={() => setLightboxPhoto(photo)}>
                      {isImage ? (
                        <img src={photo.file_url} alt={photo.file_name}
                          className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                          <p className="text-3xl mb-1">📄</p>
                          <p className="text-[10px] text-slate-400 px-2 text-center truncate">{photo.file_name}</p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ZoomIn size={24} className="text-white" />
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="p-2.5">
                      <p className="text-[10px] font-semibold text-slate-600 truncate mb-2">{photo.file_name}</p>
                      <div className="flex gap-1.5">
                        <button onClick={() => setLightboxPhoto(photo)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-semibold transition-colors">
                          <Eye size={11} /> Lihat
                        </button>
                        <a href={photo.file_url} download={photo.file_name} target="_blank" rel="noreferrer"
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-semibold transition-colors">
                          <Download size={11} /> Download
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ─── CHAT ───────────────────────────────────────── */}
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
              const colors = { Operasional:'bg-amber-400', Verifikator:'bg-blue-500', Approval:'bg-emerald-500', Admin:'bg-violet-500' };
              return (
                <div key={i} className={`flex gap-2 items-end ${isMe?'flex-row-reverse':''}`}>
                  <div className={`w-7 h-7 rounded-full ${colors[m.user?.role]||'bg-slate-400'} flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white`}>
                    {m.user?.avatar_initials||'?'}
                  </div>
                  <div className={`max-w-[72%] flex flex-col ${isMe?'items-end':'items-start'}`}>
                    <p className="text-[10px] text-slate-400 mb-1">{m.user?.name}</p>
                    <div className={`px-3 py-2 text-sm rounded-2xl leading-relaxed ${isMe?'bg-amber-500 text-white rounded-br-sm':'bg-slate-100 text-slate-700 rounded-bl-sm'}`}>
                      {m.message}
                    </div>
                    <p className="text-[9px] text-slate-300 mt-1">{fmtDateTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-slate-50 flex gap-2">
            <input value={msg} onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              placeholder="Ketik pesan... (Enter untuk kirim)"
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
            <button onClick={sendMsg} disabled={!msg.trim()}
              className="w-10 h-10 rounded-xl bg-amber-500 disabled:bg-slate-200 flex items-center justify-center transition-colors flex-shrink-0">
              <Send size={15} className={msg.trim()?'text-white':'text-slate-400'} />
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
