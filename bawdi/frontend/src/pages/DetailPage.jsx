// src/pages/DetailPage.jsx  — v3
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Send, Check, User, Download, Eye, X, ZoomIn,
  Upload, FileText, CreditCard, Lock, RefreshCw, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, messageAPI, revisionAPI } from '../utils/api';
import { Pill, Card, Button, Spinner, fmtDate, fmtDateTime, fmtCurrency, daysSince } from '../components/ui';
import useAuthStore from '../context/authStore';

/* ── STATUS CONFIG ─────────────────────────────────────────────── */
const STATUS_COLOR = {
  'Menunggu Verifikasi': 'bg-amber-100 text-amber-700',
  'Terverifikasi':       'bg-blue-100 text-blue-700',
  'Disetujui':           'bg-emerald-100 text-emerald-700',
  'Ditolak':             'bg-red-100 text-red-700',
  'Perlu Revisi':        'bg-purple-100 text-purple-700',
  'Selesai':             'bg-slate-100 text-slate-600',
};

/* ── PHOTO LIGHTBOX ────────────────────────────────────────────── */
function Lightbox({ photo, onClose }) {
  if (!photo) return null;
  const isImg = photo.file_url?.match(/\.(jpg|jpeg|png|webp)/i);
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10" onClick={onClose}><X size={20}/></button>
      <div className="max-w-3xl max-h-full" onClick={e => e.stopPropagation()}>
        <p className="text-white text-sm font-semibold mb-3 text-center">{photo.file_name}</p>
        {isImg
          ? <img src={photo.file_url} alt={photo.file_name} className="max-w-full max-h-[75vh] object-contain rounded-2xl"/>
          : <div className="bg-white rounded-2xl p-8 text-center"><p className="mb-4">📄 {photo.file_name}</p><a href={photo.file_url} target="_blank" rel="noreferrer" className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold">Buka PDF</a></div>
        }
        <div className="flex justify-center mt-4">
          <a href={photo.file_url} download={photo.file_name} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 bg-white/20 text-white px-4 py-2 rounded-xl text-sm font-semibold">
            <Download size={15}/> Download
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── FILE UPLOAD HELPER ────────────────────────────────────────── */
function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* ── TAB: REVISI ───────────────────────────────────────────────── */
function RevisiTab({ sub, user, onRefresh }) {
  const [revisions,    setRevisions]    = useState([]);
  const [notas,        setNotas]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [lightbox,     setLightbox]     = useState(null);

  // Form states
  const [reqCatatan,   setReqCatatan]   = useState('');
  const [submitPerubahan, setSubmitPerubahan] = useState('');
  const [submitTotal,  setSubmitTotal]  = useState('');
  const [notaKet,      setNotaKet]      = useState('');
  const [payDate,      setPayDate]      = useState('');
  const [payTime,      setPayTime]      = useState('');
  const [payJumlah,    setPayJumlah]    = useState('');
  const [payCatatan,   setPayCatatan]   = useState('');
  const [closeCatatan, setCloseCatatan] = useState('');
  const [saving,       setSaving]       = useState('');

  const notaRef   = useRef();

  useEffect(() => { loadAll(); }, [sub.id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [rRes, nRes] = await Promise.all([
        revisionAPI.list(sub.id),
        revisionAPI.listNota(sub.id),
      ]);
      setRevisions(rRes.data.data || []);
      setNotas(nRes.data.data || []);
    } catch {}
    setLoading(false);
  };

  const act = async (key, fn) => {
    setSaving(key);
    try {
      await fn();
      await loadAll();
      await onRefresh();
      toast.success('Berhasil!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Terjadi kesalahan');
    }
    setSaving('');
  };

  // Upload nota
  const handleNotaUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Maks 10MB'); return; }
    setSaving('nota');
    try {
      const data64 = await toBase64(file);
      await revisionAPI.uploadNota(sub.id, {
        fileName: file.name, fileData: data64, fileType: file.type, keterangan: notaKet
      });
      await loadAll();
      await onRefresh();
      toast.success('Nota berhasil diupload!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal upload nota');
    }
    setSaving('');
    e.target.value = '';
  };

  // Cek kelengkapan untuk tutup
  const canClose = sub.nota_url && sub.tanggal_bayar && sub.jumlah_bayar > 0;

  const isApprovalOrAdmin  = ['Approval','Admin'].includes(user.role);
  const isOperasional      = user.role === 'Operasional';
  const isVerifOrApproval  = ['Verifikator','Approval','Admin'].includes(user.role);
  const isDiSetujui        = sub.status === 'Disetujui';
  const isPerluRevisi      = sub.status === 'Perlu Revisi';
  const isSelesai          = sub.status === 'Selesai';

  if (loading) return <div className="flex justify-center p-8"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-4">

      {/* ── RIWAYAT REVISI ─────────────────────────────── */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="text-purple-500"/>
            <p className="text-sm font-bold text-slate-700">Riwayat Revisi</p>
          </div>
          <span className="text-xs font-bold text-slate-400">{sub.revisi_count || 0}x revisi</span>
        </div>

        {revisions.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">Belum ada revisi</p>
        )}
        {revisions.map(r => (
          <div key={r.id} className={`px-4 py-3 border-b border-slate-50 last:border-0 ${!r.selesai_at ? 'bg-purple-50' : ''}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-black text-purple-600">Revisi ke-{r.revisi_ke}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.selesai_at ? 'bg-emerald-100 text-emerald-700' : 'bg-purple-100 text-purple-700'}`}>
                {r.selesai_at ? '✓ Selesai' : '⏳ Menunggu'}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-600 mb-0.5">Diminta oleh: {r.diminta_oleh_user?.name}</p>
            <p className="text-xs text-slate-500 mb-1">📋 {r.catatan}</p>
            {r.perubahan && (
              <p className="text-xs text-emerald-600 mt-1">✅ Perubahan: {r.perubahan}</p>
            )}
            {r.total_sesudah > 0 && r.total_sesudah !== r.total_sebelum && (
              <div className="mt-1 flex gap-3 text-[10px]">
                <span className="text-slate-400 line-through">Sebelum: {fmtCurrency(r.total_sebelum)}</span>
                <span className="text-amber-600 font-bold">Sesudah: {fmtCurrency(r.total_sesudah)}</span>
              </div>
            )}
            <p className="text-[10px] text-slate-300 mt-1">{fmtDateTime(r.diminta_at)}</p>
          </div>
        ))}
      </Card>

      {/* ── MINTA REVISI (Verifikator/Approval, status bisa direvisi) ── */}
      {isVerifOrApproval && ['Menunggu Verifikasi','Terverifikasi','Disetujui'].includes(sub.status) && !isSelesai && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-purple-500"/>
            <p className="text-sm font-bold text-slate-700">Minta Revisi ke Pemohon</p>
          </div>
          <textarea value={reqCatatan} onChange={e => setReqCatatan(e.target.value)} rows={3}
            placeholder="Tuliskan apa yang perlu direvisi secara jelas..."
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-purple-400 focus:ring-2 focus:ring-purple-50 mb-3"/>
          <Button className="w-full bg-purple-500 hover:bg-purple-600 text-white"
            onClick={() => act('req', () => { const r = revisionAPI.request(sub.id, { catatan: reqCatatan }); setReqCatatan(''); return r; })}
            loading={saving === 'req'} disabled={!reqCatatan.trim()}>
            Kirim Permintaan Revisi
          </Button>
        </Card>
      )}

      {/* ── SUBMIT REVISI (Operasional, status Perlu Revisi) ─────────── */}
      {(isOperasional || user.role === 'Admin') && isPerluRevisi && (
        <Card className="border-purple-200">
          <div className="bg-purple-50 rounded-xl p-3 mb-3">
            <p className="text-xs font-bold text-purple-700 mb-1">📝 Catatan Revisi dari Approval:</p>
            <p className="text-xs text-purple-600">{sub.revisi_catatan}</p>
          </div>
          <p className="text-sm font-bold text-slate-700 mb-3">Kirim Hasil Revisi</p>
          <textarea value={submitPerubahan} onChange={e => setSubmitPerubahan(e.target.value)} rows={3}
            placeholder="Jelaskan perubahan yang sudah dilakukan..."
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 mb-3"/>
          <div className="mb-3">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Update Total Harga (isi jika ada perubahan harga)</label>
            <input type="number" value={submitTotal} onChange={e => setSubmitTotal(e.target.value)}
              placeholder={`Harga saat ini: ${fmtCurrency(sub.total_harga)}`}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400"/>
          </div>
          <Button variant="success" className="w-full"
            onClick={() => act('sub', () => { const r = revisionAPI.submit(sub.id, { perubahan: submitPerubahan, total_baru: submitTotal || null }); setSubmitPerubahan(''); setSubmitTotal(''); return r; })}
            loading={saving === 'sub'} disabled={!submitPerubahan.trim()}>
            ✓ Kirim Hasil Revisi
          </Button>
        </Card>
      )}

      {/* ── NOTA PEMBAYARAN ────────────────────────────────────────── */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-amber-500"/>
            <p className="text-sm font-bold text-slate-700">Nota Pembayaran</p>
            {sub.nota_url
              ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ Sudah Upload</span>
              : isDiSetujui ? <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Wajib</span> : null
            }
          </div>
        </div>

        {/* List nota yang sudah ada */}
        {notas.length > 0 && (
          <div className="p-3 space-y-2">
            {notas.map(n => (
              <div key={n.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={16} className="text-amber-500"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{n.file_name}</p>
                  {n.keterangan && <p className="text-[10px] text-slate-400">{n.keterangan}</p>}
                  <p className="text-[10px] text-slate-300">{fmtDateTime(n.created_at)}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => setLightbox(n)} className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50">
                    <Eye size={13} className="text-slate-500"/>
                  </button>
                  <a href={n.file_url} download={n.file_name} target="_blank" rel="noreferrer"
                    className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-600">
                    <Download size={13} className="text-white"/>
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload nota */}
        {isDiSetujui && !isSelesai && (
          <div className="p-3 border-t border-slate-50">
            <input type="text" value={notaKet} onChange={e => setNotaKet(e.target.value)}
              placeholder="Keterangan nota (opsional)..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400 mb-2"/>
            <input ref={notaRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleNotaUpload}/>
            <button onClick={() => notaRef.current?.click()} disabled={saving === 'nota'}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-amber-300 hover:border-amber-500 text-amber-600 text-sm font-semibold transition-colors">
              {saving === 'nota'
                ? <><div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"/> Mengupload...</>
                : <><Upload size={15}/> Upload Nota Pembayaran</>
              }
            </button>
          </div>
        )}
      </Card>

      {/* ── INPUT PEMBAYARAN ───────────────────────────────────────── */}
      {isDiSetujui && !isSelesai && isApprovalOrAdmin && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={15} className="text-emerald-500"/>
            <p className="text-sm font-bold text-slate-700">Catat Pembayaran</p>
            {sub.tanggal_bayar && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ Sudah dicatat</span>}
          </div>

          {sub.tanggal_bayar ? (
            <div className="bg-emerald-50 rounded-xl p-3 space-y-1">
              <p className="text-xs font-bold text-emerald-700">Data Pembayaran Tersimpan</p>
              <p className="text-xs text-emerald-600">Tanggal: {fmtDateTime(sub.tanggal_bayar)}</p>
              <p className="text-xs text-emerald-600">Jumlah: <strong>{fmtCurrency(sub.jumlah_bayar)}</strong></p>
              {sub.catatan_bayar && <p className="text-xs text-emerald-600">Catatan: {sub.catatan_bayar}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal Bayar *</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-400"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jam Bayar *</label>
                  <input type="time" value={payTime} onChange={e => setPayTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-400"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jumlah Dibayarkan (Rp) *</label>
                <input type="number" value={payJumlah} onChange={e => setPayJumlah(e.target.value)}
                  placeholder={`Total disetujui: ${fmtCurrency(sub.total_harga)}`}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-400"/>
              </div>
              <textarea value={payCatatan} onChange={e => setPayCatatan(e.target.value)} rows={2}
                placeholder="Catatan pembayaran (opsional)..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-emerald-400"/>
              <Button variant="success" className="w-full"
                onClick={() => act('pay', () => {
                  const tgl = payDate && payTime ? `${payDate}T${payTime}:00` : payDate;
                  return revisionAPI.recordPayment(sub.id, { tanggal_bayar: tgl, jumlah_bayar: payJumlah, catatan_bayar: payCatatan });
                })}
                loading={saving === 'pay'} disabled={!payDate || !payJumlah}>
                💰 Simpan Data Pembayaran
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ── TUTUP PENGAJUAN ────────────────────────────────────────── */}
      {isDiSetujui && !isSelesai && isApprovalOrAdmin && (
        <Card className={canClose ? 'border-emerald-200' : 'border-slate-200 opacity-70'}>
          <div className="flex items-center gap-2 mb-2">
            <Lock size={15} className={canClose ? 'text-emerald-500' : 'text-slate-400'}/>
            <p className="text-sm font-bold text-slate-700">Tutup & Simpan ke Draft</p>
          </div>
          {!canClose ? (
            <div className="bg-slate-50 rounded-xl p-3 mb-3">
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Lengkapi dulu sebelum menutup:</p>
              <div className="space-y-1">
                {[
                  [!sub.nota_url, 'Upload nota pembayaran'],
                  [!sub.tanggal_bayar, 'Catat tanggal pembayaran'],
                  [!sub.jumlah_bayar, 'Catat jumlah pembayaran'],
                ].filter(([cond]) => cond).map(([,label]) => (
                  <p key={label} className="text-xs text-red-500 flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center text-[9px] font-bold flex-shrink-0">✗</span>
                    {label}
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 rounded-xl p-3 mb-3">
              <p className="text-xs text-emerald-600">✅ Semua data lengkap. Pengajuan siap ditutup dan disimpan ke arsip draft.</p>
            </div>
          )}
          <textarea value={closeCatatan} onChange={e => setCloseCatatan(e.target.value)} rows={2}
            placeholder="Catatan penutupan (opsional)..."
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-emerald-400 mb-3"
            disabled={!canClose}/>
          <Button variant="success" className="w-full"
            onClick={() => act('close', () => revisionAPI.close(sub.id, { catatan_tutup: closeCatatan }))}
            loading={saving === 'close'} disabled={!canClose}>
            🏁 Tutup & Simpan ke Draft
          </Button>
        </Card>
      )}

      {/* ── STATUS SELESAI ─────────────────────────────────────────── */}
      {isSelesai && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
          <p className="text-2xl mb-2">🏁</p>
          <p className="text-sm font-black text-slate-700">Pengajuan Selesai</p>
          <p className="text-xs text-slate-400 mt-1">Ditutup pada {fmtDateTime(sub.ditutup_at)}</p>
          {sub.catatan_tutup && <p className="text-xs text-slate-500 mt-1">{sub.catatan_tutup}</p>}
          <p className="text-xs font-bold text-emerald-600 mt-2">💰 Dibayar: {fmtCurrency(sub.jumlah_bayar)}</p>
        </div>
      )}

      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)}/>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN DETAIL PAGE
══════════════════════════════════════════════════════════════════ */
export default function DetailPage() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuthStore();
  const [sub,      setSub]      = useState(null);
  const [msgs,     setMsgs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('detail');
  const [msg,      setMsg]      = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionLoading,   setActionLoading]   = useState(false);
  const [lightbox, setLightbox] = useState(null);
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
      toast.success(action === 'approve' ? '✅ Disetujui!' : action === 'verify' ? '✅ Diverifikasi' : '❌ Ditolak');
      await load();
      setShowRejectModal(false);
    } catch (err) { toast.error(err.response?.data?.error || 'Terjadi kesalahan'); }
    setActionLoading(false);
  };

  const doSelectVendor = async (vendorNum, alasan) => {
    await submissionAPI.selectVendor(id, vendorNum, alasan);
    await load();
  };

  const sendMsg = async () => {
    if (!msg.trim()) return;
    try { const { data } = await messageAPI.send(id, msg.trim()); setMsgs(prev => [...prev, data.data]); setMsg(''); }
    catch { toast.error('Gagal mengirim pesan'); }
  };

  if (loading) return <Spinner size={32}/>;
  if (!sub)    return <div className="text-center py-20 text-slate-400">Pengajuan tidak ditemukan</div>;

  const isAlert  = ['Menunggu Verifikasi','Terverifikasi','Perlu Revisi'].includes(sub.status) && daysSince(sub.tanggal) > 2;
  const photos   = sub.photos || [];
  const items1   = (sub.items || []).filter(i => i.vendor_num !== 2);
  const items2   = (sub.items || []).filter(i => i.vendor_num === 2);
  const total1   = items1.reduce((s, i) => s + Number(i.total||0), 0);
  const total2   = items2.reduce((s, i) => s + Number(i.total||0), 0);
  const statusCls = STATUS_COLOR[sub.status] || 'bg-slate-100 text-slate-600';

  const timeline = [
    { label: 'Dibuat',               info: `${sub.pemohon?.name} · ${fmtDateTime(sub.tanggal)}`,                     done: true },
    { label: 'Menunggu Verifikasi',   info: sub.verifikasi_at ? `Diterima ${fmtDate(sub.verifikasi_at)}` : 'Menunggu...', done: !!sub.verifikasi_at },
    { label: 'Diverifikasi',          info: sub.verifikator?.name || '—',                                            done: !!sub.verifikator_id },
    ...(sub.revisi_count > 0 ? [{ label: `Revisi (${sub.revisi_count}x)`, info: sub.revisi_selesai_at ? `Selesai ${fmtDate(sub.revisi_selesai_at)}` : 'Dalam proses...', done: !!sub.revisi_selesai_at, isRevisi: true }] : []),
    { label: 'Keputusan Approval',    info: sub.approval_at ? `${sub.status} · ${fmtDate(sub.approval_at)}` : 'Menunggu...', done: !!sub.approval_at, isReject: sub.status === 'Ditolak' },
    ...(sub.status === 'Disetujui' || sub.status === 'Selesai' ? [
      { label: 'Pembayaran',          info: sub.tanggal_bayar ? `${fmtCurrency(sub.jumlah_bayar)} · ${fmtDate(sub.tanggal_bayar)}` : 'Belum dicatat', done: !!sub.tanggal_bayar },
      { label: 'Selesai',             info: sub.ditutup_at ? `Ditutup ${fmtDate(sub.ditutup_at)}` : 'Menunggu...', done: sub.status === 'Selesai' },
    ] : []),
  ];

  const TABS = [
    { key: 'detail', label: 'Detail' },
    { key: 'revisi', label: `Revisi${sub.revisi_count > 0 ? ` (${sub.revisi_count})` : ''}` },
    { key: 'foto',   label: `Foto (${photos.length})` },
    { key: 'chat',   label: `Diskusi (${msgs.length})` },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)}/>}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-3">Alasan Penolakan</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4}
              placeholder="Tuliskan alasan penolakan..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-red-400 mb-4"/>
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
          <ChevronLeft size={18} className="text-slate-600"/>
        </button>
        <div>
          <p className="text-xs text-slate-400">Detail Pengajuan</p>
          <h1 className="text-base font-black text-slate-800">{sub.nomor_pengajuan}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{sub.type}</span>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${statusCls}`}>{sub.status}</span>
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
          <p className="text-sm font-bold text-amber-800 mb-3">Menunggu Keputusan Anda</p>
          <div className="flex gap-2.5">
            <Button variant="danger"  className="flex-1" onClick={() => setShowRejectModal(true)}>✗ Tolak</Button>
            <Button variant="success" className="flex-1" onClick={() => doAction('approve')} loading={actionLoading}>✓ Setujui</Button>
          </div>
        </div>
      )}
      {sub.status === 'Perlu Revisi' && user.role === 'Operasional' && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-purple-800">📝 Pengajuan Anda Perlu Direvisi</p>
          <p className="text-xs text-purple-500 mt-1">Buka tab <strong>Revisi</strong> untuk melihat catatan dan mengirim hasil revisi.</p>
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-shrink-0 flex-1 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap px-2 ${tab===t.key?'bg-white text-slate-800 shadow-sm':'text-slate-400 hover:text-slate-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── DETAIL TAB ─────────────────────────────────── */}
      {tab === 'detail' && (
        <div className="space-y-4">
          {/* Timeline */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Alur Status</p>
            {timeline.map((t, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center w-5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    t.done ? t.isReject ? 'bg-red-500' : t.isRevisi ? 'bg-purple-500' : 'bg-emerald-500' : 'bg-slate-200'
                  }`}>
                    {t.done && <Check size={10} className="text-white"/>}
                  </div>
                  {i < timeline.length-1 && <div className={`w-0.5 flex-1 min-h-[14px] mt-1 mb-1 ${t.done ? 'bg-emerald-200' : 'bg-slate-200'}`}/>}
                </div>
                <div className={`pb-3 ${i===timeline.length-1?'pb-0':''}`}>
                  <p className={`text-sm font-semibold ${t.done?'text-slate-800':'text-slate-400'}`}>{t.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.info}</p>
                </div>
              </div>
            ))}
          </Card>

          {/* Vendor comparison */}
          <Card padding={false}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">Perbandingan Vendor</p>
            <div className={`grid ${sub.vendor2_selected ? 'grid-cols-2' : 'grid-cols-1'} divide-x divide-slate-100`}>
              {[
                { num: 1, vendor: sub.vendor, npwp: sub.npwp, items: items1, total: total1, color: 'bg-blue-500' },
                ...(sub.vendor2_selected ? [{ num: 2, vendor: sub.vendor2, npwp: sub.npwp2, items: items2, total: total2, color: 'bg-orange-500' }] : [])
              ].map(v => (
                <div key={v.num} className={`p-3 ${sub.vendor_pilihan === v.num ? 'bg-emerald-50' : ''}`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className={`w-5 h-5 rounded-full ${v.color} flex items-center justify-center`}>
                      <span className="text-white text-[9px] font-black">{v.num}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-700 truncate">{v.vendor}</p>
                    {sub.vendor_pilihan === v.num && <span className="ml-auto text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full flex-shrink-0">✓ Dipilih</span>}
                  </div>
                  {v.items.map((item, j) => (
                    <div key={j} className="text-[10px] text-slate-500 py-0.5 border-b border-slate-50 last:border-0">
                      <p className="font-medium text-slate-600 truncate">{item.penjelasan}</p>
                      <div className="flex justify-between"><span>{item.satuan}</span><span className="font-bold">{fmtCurrency(item.total)}</span></div>
                    </div>
                  ))}
                  <p className="text-xs font-black text-right mt-2 pt-1.5 border-t border-slate-200">{fmtCurrency(v.total)}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Info */}
          <Card padding={false}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">Informasi Pengajuan</p>
            {[
              ['Pemohon', sub.pemohon?.name], ['Cabang', sub.cabang], ['Kendaraan', sub.kendaraan],
              ['Jenis Pembelian', sub.jenis_pembelian], ['Tgl Pengajuan', fmtDate(sub.tanggal)],
              ['Batas Waktu Dana', sub.batas_waktu_dana],
              ['Batas Akhir Bayar', sub.batas_akhir_pembayaran ? fmtDate(sub.batas_akhir_pembayaran) : '—'],
              ['Total Disetujui', fmtCurrency(sub.total_harga)],
              ...(sub.jumlah_bayar > 0 ? [['Jumlah Dibayar', fmtCurrency(sub.jumlah_bayar)]] : []),
            ].map(([k,v], i, arr) => (
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
              <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Alasan</p><p className="text-sm text-slate-700 leading-relaxed">{sub.alasan||'—'}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Riwayat</p><p className="text-sm text-slate-700 leading-relaxed">{sub.riwayat||'—'}</p></div>
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
                { label: 'Dibuat', name: sub.pemohon?.name,      jabatan: sub.pemohon?.jabatan,      done: true },
                { label: 'Verifikator', name: sub.verifikator?.name, jabatan: sub.verifikator?.jabatan, done: !!sub.verifikator_id },
                { label: 'Approval', name: sub.approver?.name,     jabatan: sub.approver?.jabatan,   done: !!sub.approver_id, isReject: sub.status==='Ditolak' },
              ].map((sig, i) => (
                <div key={i} className={`text-center p-2.5 rounded-xl border ${sig.done ? sig.isReject ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                  <p className="text-[9px] text-slate-400 mb-1.5 leading-tight">{sig.label}</p>
                  <div className={`w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center ${sig.done ? sig.isReject ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-200'}`}>
                    {sig.done ? <Check size={12} className="text-white"/> : <User size={10} className="text-slate-400"/>}
                  </div>
                  <p className={`text-[10px] font-bold ${sig.done ? sig.isReject ? 'text-red-700':'text-emerald-700':'text-slate-400'}`}>{sig.name||'Menunggu...'}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{sig.jabatan||''}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── REVISI TAB ─────────────────────────────────── */}
      {tab === 'revisi' && <RevisiTab sub={sub} user={user} onRefresh={load}/>}

      {/* ── FOTO TAB ───────────────────────────────────── */}
      {tab === 'foto' && (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-bold text-slate-700">Foto Lampiran</p>
            <p className="text-xs text-slate-400 mt-0.5">Klik untuk memperbesar · Download untuk menyimpan</p>
          </div>
          {photos.length === 0
            ? <div className="py-14 text-center"><p className="text-3xl mb-2">📷</p><p className="text-sm text-slate-400">Belum ada foto</p></div>
            : <div className="p-4 grid grid-cols-2 gap-3">
                {photos.map(photo => {
                  const isImg = photo.file_url?.match(/\.(jpg|jpeg|png|webp)/i);
                  return (
                    <div key={photo.id} className="rounded-xl overflow-hidden border border-slate-200">
                      <div className="relative aspect-square bg-slate-100 cursor-pointer group" onClick={() => setLightbox(photo)}>
                        {isImg ? <img src={photo.file_url} alt={photo.file_name} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center flex-col"><p className="text-3xl">📄</p><p className="text-[10px] text-slate-400 px-2 text-center truncate">{photo.file_name}</p></div>}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center"><ZoomIn size={24} className="text-white"/></div>
                      </div>
                      <div className="p-2.5">
                        <p className="text-[10px] font-semibold text-slate-600 truncate mb-2">{photo.file_name}</p>
                        <div className="flex gap-1.5">
                          <button onClick={() => setLightbox(photo)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-semibold"><Eye size={11}/> Lihat</button>
                          <a href={photo.file_url} download={photo.file_name} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500 text-white text-[10px] font-semibold"><Download size={11}/> Download</a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </Card>
      )}

      {/* ── CHAT TAB ───────────────────────────────────── */}
      {tab === 'chat' && (
        <Card padding={false} className="flex flex-col">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-bold text-slate-700">Diskusi Pengajuan</p>
          </div>
          <div ref={chatRef} className="px-4 py-3 space-y-3 min-h-[240px] max-h-[400px] overflow-y-auto">
            {msgs.length === 0 && <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Belum ada diskusi</div>}
            {msgs.map((m, i) => {
              const isMe = m.user?.id === user.id;
              if (m.is_system) return <div key={i} className="text-center"><span className="text-[11px] text-slate-500 bg-slate-100 px-3 py-1 rounded-full inline-block">{m.message}</span></div>;
              const colors = { Operasional:'bg-amber-400', Verifikator:'bg-blue-500', Approval:'bg-emerald-500', Admin:'bg-violet-500' };
              return (
                <div key={i} className={`flex gap-2 items-end ${isMe?'flex-row-reverse':''}`}>
                  <div className={`w-7 h-7 rounded-full ${colors[m.user?.role]||'bg-slate-400'} flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white`}>{m.user?.avatar_initials||'?'}</div>
                  <div className={`max-w-[72%] flex flex-col ${isMe?'items-end':'items-start'}`}>
                    <p className="text-[10px] text-slate-400 mb-1">{m.user?.name}</p>
                    <div className={`px-3 py-2 text-sm rounded-2xl leading-relaxed ${isMe?'bg-amber-500 text-white rounded-br-sm':'bg-slate-100 text-slate-700 rounded-bl-sm'}`}>{m.message}</div>
                    <p className="text-[9px] text-slate-300 mt-1">{fmtDateTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-slate-50 flex gap-2">
            <input value={msg} onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
              placeholder="Ketik pesan..." className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400"/>
            <button onClick={sendMsg} disabled={!msg.trim()} className="w-10 h-10 rounded-xl bg-amber-500 disabled:bg-slate-200 flex items-center justify-center">
              <Send size={15} className={msg.trim()?'text-white':'text-slate-400'}/>
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
