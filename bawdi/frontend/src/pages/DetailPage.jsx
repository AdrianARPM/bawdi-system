// src/pages/DetailPage.jsx  — v6 FIXED
// - RevisiEditor diimport dari komponen terpisah (bukan inline)
// - Bug fix: item form tidak kehilangan fokus
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Send, Check, User, Download, Eye,
  X, ZoomIn, Upload, FileText, CreditCard, Lock,
  RefreshCw, Loader, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { submissionAPI, messageAPI, revisionAPI, photoAPI } from '../utils/api';
import { exportSinglePDF } from '../utils/exportHelper';
import { Card, Button, Spinner, fmtDate, fmtDateTime, fmtCurrency, daysSince, RevisiBadge } from '../components/ui';
import RevisiEditor from '../components/RevisiEditor';  // ← import dari file terpisah
import useAuthStore from '../context/authStore';

/* ── STATUS CONFIG ───────────────────────────────────────────── */
const STATUS_COLOR = {
  'Menunggu Verifikasi': 'bg-amber-100 text-amber-700',
  'Terverifikasi':       'bg-blue-100 text-blue-700',
  'Disetujui':           'bg-emerald-100 text-emerald-700',
  'Ditolak':             'bg-red-100 text-red-700',
  'Perlu Revisi':        'bg-purple-100 text-purple-700',
  'Selesai':             'bg-slate-100 text-slate-500',
};
const SNAP_STATUS_COLOR = {
  draft:         'bg-slate-100 text-slate-500',
  submitted:     'bg-amber-100 text-amber-700',
  terverifikasi: 'bg-blue-100 text-blue-700',
  disetujui:     'bg-emerald-100 text-emerald-700',
  ditolak:       'bg-red-100 text-red-700',
};
const SNAP_STATUS_LABEL = {
  draft:         'Draft',
  submitted:     'Menunggu Verifikasi',
  terverifikasi: 'Terverifikasi',
  disetujui:     'Disetujui',
  ditolak:       'Ditolak',
};

/* ── LIGHTBOX ────────────────────────────────────────────────── */
function Lightbox({ photo, onClose }) {
  if (!photo) return null;
  const isImg = photo.file_url?.match(/\.(jpg|jpeg|png|webp)/i);
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white p-2 rounded-full bg-white/10">
        <X size={20}/>
      </button>
      <div className="max-w-3xl max-h-full" onClick={e => e.stopPropagation()}>
        <p className="text-white text-sm font-semibold mb-3 text-center">{photo.file_name}</p>
        {isImg
          ? <img src={photo.file_url} alt={photo.file_name} className="max-w-full max-h-[75vh] object-contain rounded-2xl"/>
          : (
            <div className="bg-white rounded-2xl p-8 text-center">
              <p className="mb-4">📄 {photo.file_name}</p>
              <a href={photo.file_url} target="_blank" rel="noreferrer"
                className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold">
                Buka PDF
              </a>
            </div>
          )
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

/* ── PANEL SATU REVISI (tampilan snapshot) ───────────────────── */
function RevisiPanel({ snapshot, sub, user, onAction }) {
  const sc = SNAP_STATUS_COLOR[snapshot.status] || 'bg-slate-100 text-slate-500';

  const items1 = (snapshot.items || []).filter(i => i.vendor_num !== 2);
  const items2 = (snapshot.items || []).filter(i => i.vendor_num === 2);
  const total1 = items1.reduce((s, i) => s + (Number(i.total || i.harga) || 0), 0);

  const [rejectReason, setRejectReason] = useState('');
  const [showReject,   setShowReject]   = useState(false);
  const [actLoading,   setActLoading]   = useState('');

  const act = async (type, arg) => {
    setActLoading(type);
    try {
      if (type === 'verify')  await revisionAPI.verifySnapshot(snapshot.id);
      if (type === 'approve') await revisionAPI.approveSnapshot(snapshot.id);
      if (type === 'reject')  await revisionAPI.rejectSnapshot(snapshot.id, { alasan_tolak: arg });
      toast.success(
        type === 'approve' ? 'Revisi disetujui!' :
        type === 'verify'  ? 'Revisi diverifikasi' : 'Revisi ditolak'
      );
      onAction();
      setShowReject(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Terjadi kesalahan');
    }
    setActLoading('');
  };

  const canVerify  = user.role === 'Verifikator' && snapshot.status === 'submitted';
  const canApprove = user.role === 'Approval'    && snapshot.status === 'terverifikasi';

  return (
    <div className="space-y-4">
      {/* Reject Modal */}
      {showReject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-3">Alasan Penolakan</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              rows={4} placeholder="Tuliskan alasan penolakan..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-red-400 mb-4"/>
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={() => setShowReject(false)}>Batal</Button>
              <Button variant="danger" className="flex-1" onClick={() => act('reject', rejectReason)}
                loading={actLoading === 'reject'}>Tolak</Button>
            </div>
          </div>
        </div>
      )}

      {/* Status badge */}
      <div className={`rounded-2xl p-3 border flex items-center gap-2 ${
        snapshot.status === 'draft'         ? 'bg-slate-50 border-slate-200' :
        snapshot.status === 'submitted'     ? 'bg-amber-50 border-amber-200' :
        snapshot.status === 'terverifikasi' ? 'bg-blue-50 border-blue-200' :
        snapshot.status === 'disetujui'     ? 'bg-emerald-50 border-emerald-200' :
        'bg-red-50 border-red-200'
      }`}>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sc}`}>
          {SNAP_STATUS_LABEL[snapshot.status]}
        </span>
        {snapshot.diminta_oleh_user && (
          <p className="text-xs text-slate-500">
            Diminta: {snapshot.diminta_oleh_user.name} · {fmtDate(snapshot.diminta_at)}
          </p>
        )}
      </div>

      {/* Catatan revisi */}
      {snapshot.alasan_revisi && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">Catatan Permintaan Revisi</p>
          <p className="text-sm text-purple-700">{snapshot.alasan_revisi}</p>
        </div>
      )}

      {/* Action: Verifikator */}
      {canVerify && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-800">Perlu Verifikasi Anda</p>
            <p className="text-xs text-blue-400 mt-0.5">Periksa perubahan data revisi ini</p>
          </div>
          <Button variant="info" onClick={() => act('verify')} loading={actLoading === 'verify'}>
            Verifikasi
          </Button>
        </div>
      )}

      {/* Action: Approval */}
      {canApprove && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-amber-800 mb-3">Menunggu Keputusan Anda</p>
          <div className="flex gap-2.5">
            <Button variant="danger"  className="flex-1" onClick={() => setShowReject(true)}>✗ Tolak</Button>
            <Button variant="success" className="flex-1" onClick={() => act('approve')}
              loading={actLoading === 'approve'}>✓ Setujui</Button>
          </div>
        </div>
      )}

      {/* Alasan tolak */}
      {snapshot.status === 'ditolak' && snapshot.alasan_tolak && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
          <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Alasan Penolakan</p>
          <p className="text-sm text-red-700">{snapshot.alasan_tolak}</p>
        </div>
      )}

      {/* Data vendor */}
      <Card padding={false}>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">
          Data Revisi ke-{snapshot.revision_number}
        </p>
        {[
          ['Alasan',    snapshot.alasan],
          ['Vendor 1',  snapshot.vendor],
          ...(snapshot.npwp            ? [['NPWP Vendor 1',  snapshot.npwp]]            : []),
          ...(snapshot.rekening_tujuan ? [['Rekening',        snapshot.rekening_tujuan]] : []),
          ...(snapshot.vendor2         ? [['Vendor 2',        snapshot.vendor2]]         : []),
          ...(snapshot.npwp2           ? [['NPWP Vendor 2',   snapshot.npwp2]]           : []),
        ].map(([k, v], i) => (
          <div key={k} className={`flex justify-between gap-4 px-4 py-2.5 ${i > 0 ? 'border-t border-slate-50' : ''}`}>
            <span className="text-xs text-slate-400 flex-shrink-0">{k}</span>
            <span className="text-xs font-semibold text-slate-700 text-right whitespace-pre-line">{v || '—'}</span>
          </div>
        ))}
      </Card>

      {/* Riwayat */}
      {snapshot.riwayat && (
        <Card>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Riwayat</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{snapshot.riwayat}</p>
        </Card>
      )}

      {/* Items */}
      {items1.length > 0 && (
        <Card padding={false}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">
            Rincian Item
          </p>
          {[
            ...items1.map(i => ({ ...i, _v: 1 })),
            ...items2.map(i => ({ ...i, _v: 2 })),
          ].map((item, i, arr) => (
            <div key={item.id || i} className={`px-4 py-3 ${i < arr.length - 1 ? 'border-b border-slate-50' : ''}`}>
              <div className="flex items-start gap-2 mb-1">
                {items2.length > 0 && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${
                    item._v === 1 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
                  }`}>V{item._v}</span>
                )}
                <p className="text-sm font-medium text-slate-700 leading-relaxed">{item.penjelasan}</p>
              </div>
              {Number(item.diskon) > 0 && (
                <div className="flex justify-between text-[11px] text-rose-500 mb-0.5">
                  <span>Diskon (dari {fmtCurrency((Number(item.total)||0) + (Number(item.diskon)||0))})</span>
                  <span>− {fmtCurrency(item.diskon)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-xs text-slate-400">{item.satuan}</span>
                <span className="text-xs font-bold text-slate-600">{fmtCurrency(item.total || item.harga)}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-between px-4 py-3 bg-amber-50 border-t border-amber-100">
            <span className="text-sm font-extrabold text-amber-800">TOTAL</span>
            <span className="text-base font-black text-amber-500">{fmtCurrency(snapshot.total_harga)}</span>
          </div>
        </Card>
      )}

      {/* Tanda tangan revisi */}
      <Card>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
          Tanda Tangan Revisi ke-{snapshot.revision_number}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Pemohon',     name: sub?.pemohon?.name,              done: snapshot.status !== 'draft' },
            { label: 'Verifikator', name: snapshot.verifikator_user?.name, done: ['terverifikasi', 'disetujui'].includes(snapshot.status) },
            { label: 'Approval',    name: snapshot.approver_user?.name,    done: ['disetujui', 'ditolak'].includes(snapshot.status), isReject: snapshot.status === 'ditolak' },
          ].map((sig, i) => (
            <div key={i} className={`text-center p-2.5 rounded-xl border ${
              sig.done ? sig.isReject ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'
                       : 'bg-slate-50 border-slate-100'
            }`}>
              <p className="text-[9px] text-slate-400 mb-1.5">{sig.label}</p>
              <div className={`w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center ${
                sig.done ? sig.isReject ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-200'
              }`}>
                {sig.done
                  ? <Check size={12} className="text-white"/>
                  : <User size={10} className="text-slate-400"/>
                }
              </div>
              <p className={`text-[10px] font-bold ${
                sig.done ? sig.isReject ? 'text-red-700' : 'text-emerald-700' : 'text-slate-400'
              }`}>{sig.name || 'Menunggu...'}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── PANEL NOTA + BAYAR + TUTUP ──────────────────────────────── */
function PaymentPanel({ sub, user, onRefresh }) {
  const [notas,     setNotas]    = useState([]);
  const [lightbox,  setLightbox] = useState(null);
  const [saving,    setSaving]   = useState('');
  const [notaKet,   setNotaKet]  = useState('');
  const [payDate,   setPayDate]  = useState('');
  const [payTime,   setPayTime]  = useState('');
  const [payJumlah, setPayJumlah]= useState('');
  const [payCat,    setPayCat]   = useState('');
  const [dpDate,    setDpDate]   = useState('');
  const [dpTime,    setDpTime]   = useState('');
  const [dpJumlah,  setDpJumlah] = useState('');
  const [dpCat,     setDpCat]    = useState('');
  const [closeCat,  setCloseCat] = useState('');
  const notaRef = useRef();

  useEffect(() => { loadNotas(); }, [sub.id]);

  const loadNotas = async () => {
    try {
      const { data } = await revisionAPI.listNota(sub.id);
      setNotas(data.data || []);
    } catch {}
  };

  const handleNota = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Maks 10MB'); return; }
    setSaving('nota');
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise(res => { reader.onload = res; });
      await revisionAPI.uploadNota(sub.id, {
        fileName: file.name, fileData: reader.result,
        fileType: file.type, keterangan: notaKet,
      });
      await loadNotas();
      await onRefresh();
      toast.success('Nota berhasil diupload!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal upload nota');
    }
    setSaving('');
    e.target.value = '';
  };

  const handleDP = async () => {
    if (!dpDate || !dpJumlah) { toast.error('Tanggal dan jumlah DP wajib diisi'); return; }
    setSaving('dp');
    try {
      const tgl = new Date(`${dpDate}T${dpTime || '00:00'}:00+07:00`).toISOString();
      await revisionAPI.recordDP(sub.id, {
        tanggal_dp: tgl, jumlah_dp: dpJumlah, catatan_dp: dpCat,
      });
      await onRefresh();
      toast.success('DP dicatat!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mencatat DP');
    }
    setSaving('');
  };

  const handlePay = async () => {
    if (!payDate || !payJumlah) { toast.error('Tanggal dan jumlah wajib diisi'); return; }
    setSaving('pay');
    try {
     const tgl = new Date(`${payDate}T${payTime || '00:00'}:00+07:00`).toISOString();
      await revisionAPI.recordPayment(sub.id, {
        tanggal_bayar: tgl, jumlah_bayar: payJumlah, catatan_bayar: payCat,
      });
      await onRefresh();
      toast.success('Pembayaran dicatat!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal mencatat pembayaran');
    }
    setSaving('');
  };

  const handleClose = async () => {
    setSaving('close');
    try {
      await revisionAPI.close(sub.id, { catatan_tutup: closeCat });
      await onRefresh();
      toast.success('Pengajuan ditutup ke Draft!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menutup pengajuan');
    }
    setSaving('');
  };

  const canClose    = sub.nota_url && sub.tanggal_bayar && sub.jumlah_bayar > 0;
  const isAA        = ['Approval', 'Admin'].includes(user.role);
// v20: yang boleh hapus nota = Approval/Admin atau Operasional pemohon asli
  const canManageNota = isAA || (user.role === 'Operasional' && sub.pemohon_id === user.id);

  const handleDeleteNota = async (n) => {
    if (!window.confirm(`Hapus nota "${n.file_name}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setSaving('delnota-' + n.id);
    try {
      await revisionAPI.deleteNota(n.id);
      await loadNotas();
      await onRefresh();
      toast.success('Nota dihapus');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal menghapus nota');
    }
    setSaving('');
  };
  
  const isDiSetujui = sub.status === 'Disetujui';
  const isSelesai   = sub.status === 'Selesai';

  return (
    <div className="space-y-4">
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)}/>}

      {/* Nota */}
      <Card padding={false}>
        <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
          <FileText size={14} className="text-amber-500"/>
          <p className="text-sm font-bold text-slate-700">Nota Pembayaran</p>
          {sub.nota_url
            ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-auto">✓ Ada</span>
            : isDiSetujui
              ? <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full ml-auto">Wajib</span>
              : null
          }
        </div>

        {notas.length > 0 && (
          <div className="p-3 space-y-2">
            {notas.map(n => (
              <div key={n.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <FileText size={16} className="text-amber-400 flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{n.file_name}</p>
                  {n.keterangan && <p className="text-[10px] text-slate-400">{n.keterangan}</p>}
                  <p className="text-[10px] text-slate-300">{fmtDateTime(n.created_at)}</p>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setLightbox(n)}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
                    <Eye size={12} className="text-slate-500"/>
                  </button>
                  <a href={n.file_url} download={n.file_name} target="_blank" rel="noreferrer"
                    className="p-1.5 rounded-lg bg-amber-500 hover:bg-amber-600">
                    <Download size={12} className="text-white"/>
                  </a>
                  {canManageNota && (
                    <button onClick={() => handleDeleteNota(n)} disabled={saving === 'delnota-' + n.id}
                      className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 size={12} className="text-red-500"/>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {isDiSetujui && !isSelesai && (
          <div className="p-3 border-t border-slate-50">
            <input type="text" value={notaKet} onChange={e => setNotaKet(e.target.value)}
              placeholder="Keterangan nota (opsional)..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400 mb-2"/>
            <input ref={notaRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleNota}/>
            <button onClick={() => notaRef.current?.click()} disabled={saving === 'nota'}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-amber-300 hover:border-amber-500 text-amber-600 text-sm font-semibold transition-colors disabled:opacity-50">
              {saving === 'nota'
                ? <Loader size={14} className="animate-spin"/>
                : <Upload size={14}/>
              }
              Upload Nota Pembayaran
            </button>
          </div>
        )}
      </Card>

      {/* Catat DP (opsional) */}
      {isDiSetujui && !isSelesai && isAA && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={15} className="text-amber-500"/>
            <p className="text-sm font-bold text-slate-700">Catat DP (Uang Muka)</p>
            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">opsional</span>
            {sub.tanggal_dp && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-auto">✓ Tercatat</span>
            )}
          </div>

          {sub.tanggal_dp ? (
            <div className="bg-amber-50 rounded-xl p-3 space-y-1">
              <p className="text-xs text-amber-600">Tanggal DP: <strong>{fmtDateTime(sub.tanggal_dp)}</strong></p>
              <p className="text-xs text-amber-600">Jumlah DP: <strong>{fmtCurrency(sub.jumlah_dp)}</strong></p>
              {sub.catatan_dp && <p className="text-xs text-amber-600">Catatan: {sub.catatan_dp}</p>}
              {sub.total_harga > 0 && (
                <p className="text-xs text-slate-500 pt-1 border-t border-amber-100">
                  Sisa dari total {fmtCurrency(sub.total_harga)}: <strong>{fmtCurrency(Math.max(0, (sub.total_harga||0) - (sub.jumlah_dp||0)))}</strong>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tanggal DP *</label>
                  <input type="date" value={dpDate} onChange={e => setDpDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jam DP</label>
                  <input type="time" value={dpTime} onChange={e => setDpTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jumlah DP (Rp) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                  <input type="number" value={dpJumlah} onChange={e => setDpJumlah(e.target.value)}
                    placeholder="0"
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-amber-400"/>
                </div>
              </div>
              <textarea value={dpCat} onChange={e => setDpCat(e.target.value)} rows={2}
                placeholder="Catatan DP (opsional)..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-amber-400"/>
              <Button variant="secondary" className="w-full" onClick={handleDP}
                loading={saving === 'dp'} disabled={!dpDate || !dpJumlah}>
                💵 Simpan DP
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Catat Pembayaran */}
      {isDiSetujui && !isSelesai && isAA && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={15} className="text-emerald-500"/>
            <p className="text-sm font-bold text-slate-700">Catat Pembayaran</p>
            {sub.tanggal_bayar && (
              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-auto">
                ✓ Tercatat
              </span>
            )}
          </div>

          {sub.tanggal_bayar ? (
            <div className="bg-emerald-50 rounded-xl p-3 space-y-1">
              <p className="text-xs text-emerald-600">Tanggal: <strong>{fmtDateTime(sub.tanggal_bayar)}</strong></p>
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
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jam Bayar</label>
                  <input type="time" value={payTime} onChange={e => setPayTime(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-400"/>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Jumlah Dibayar (Rp) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Rp</span>
                  <input type="number" value={payJumlah} onChange={e => setPayJumlah(e.target.value)}
                    placeholder={String(sub.total_harga || 0)}
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-emerald-400"/>
                </div>
              </div>
              <textarea value={payCat} onChange={e => setPayCat(e.target.value)} rows={2}
                placeholder="Catatan pembayaran (opsional)..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-emerald-400"/>
              <Button variant="success" className="w-full" onClick={handlePay}
                loading={saving === 'pay'} disabled={!payDate || !payJumlah}>
                💰 Simpan Data Pembayaran
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Tutup Pengajuan */}
      {isDiSetujui && !isSelesai && isAA && (
        <Card className={canClose ? 'border-emerald-200' : 'border-slate-200 opacity-75'}>
          <div className="flex items-center gap-2 mb-2">
            <Lock size={14} className={canClose ? 'text-emerald-500' : 'text-slate-400'}/>
            <p className="text-sm font-bold text-slate-700">Tutup & Simpan ke Draft</p>
          </div>
          {!canClose ? (
            <div className="bg-slate-50 rounded-xl p-3 mb-3 space-y-1">
              {[
                !sub.nota_url      && 'Upload nota pembayaran',
                !sub.tanggal_bayar && 'Catat tanggal pembayaran',
                !sub.jumlah_bayar  && 'Catat jumlah pembayaran',
              ].filter(Boolean).map(m => (
                <p key={m} className="text-xs text-red-500 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center text-[9px] font-bold flex-shrink-0">✗</span>
                  {m}
                </p>
              ))}
            </div>
          ) : (
            <div className="bg-emerald-50 rounded-xl p-2.5 mb-3">
              <p className="text-xs text-emerald-600">✅ Semua data lengkap. Siap ditutup.</p>
            </div>
          )}
          <textarea value={closeCat} onChange={e => setCloseCat(e.target.value)} rows={2}
            placeholder="Catatan penutupan (opsional)..."
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-emerald-400 mb-3 disabled:opacity-50"
            disabled={!canClose}/>
          <Button variant="success" className="w-full" onClick={handleClose}
            loading={saving === 'close'} disabled={!canClose}>
            🏁 Tutup & Simpan ke Draft
          </Button>
        </Card>
      )}

      {/* Status Selesai */}
      {isSelesai && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
          <p className="text-2xl mb-1">🏁</p>
          <p className="text-sm font-black text-slate-700">Pengajuan Selesai</p>
          <p className="text-xs text-slate-400 mt-1">Ditutup {fmtDateTime(sub.ditutup_at)}</p>
          {sub.catatan_tutup && <p className="text-xs text-slate-500 mt-1">{sub.catatan_tutup}</p>}
          <p className="text-xs font-bold text-emerald-600 mt-1.5">💰 {fmtCurrency(sub.jumlah_bayar)}</p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN DETAIL PAGE
══════════════════════════════════════════════════════════════ */
export default function DetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [sub,       setSub]       = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [msgs,      setMsgs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('asli');
  const [lightbox,  setLightbox]  = useState(null);
  const [msg,       setMsg]       = useState('');

  // Modals
  const [showReject,    setShowReject]    = useState(false);
  const [rejectReason,  setRejectReason]  = useState('');
  const [actLoading,    setActLoading]    = useState('');
  const [reqRevModal,   setReqRevModal]   = useState(false);
  const [reqRevCat,     setReqRevCat]     = useState('');
  const [editSnap,      setEditSnap]      = useState(null); // snapshot yang sedang diedit
  const [exporting,     setExporting]     = useState(false);

  const chatRef = useRef(null);
  const fotoRef = useRef(null);
  const [savingFoto, setSavingFoto] = useState(false);

  const load = async () => {
    try {
      const [subRes, revRes] = await Promise.all([
        submissionAPI.getOne(id),
        revisionAPI.list(id),
      ]);
      setSub(subRes.data.data);
      setMsgs(subRes.data.data.messages || []);
      setRevisions(revRes.data.data || []);
    } catch {
      toast.error('Gagal memuat pengajuan');
    } finally {
      setLoading(false);
    }
  };

  // Tambah lampiran ke pengajuan yang sudah tersubmit (foto/PDF)
  const handleUploadFoto = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Ukuran file maksimal 10MB'); e.target.value = ''; return; }
    setSavingFoto(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      await new Promise(res => { reader.onload = res; });
      await photoAPI.upload(sub.id, {
        fileName: file.name, fileData: reader.result, fileType: file.type,
      });
      await load();
      toast.success('Lampiran berhasil ditambahkan!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal upload lampiran');
    }
    setSavingFoto(false);
    e.target.value = '';
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs, activeTab]);

  useEffect(() => {
    if (activeTab !== 'chat') return;
    const t = setInterval(async () => {
      try { const { data } = await messageAPI.list(id); setMsgs(data.data); } catch {}
    }, 10000);
    return () => clearInterval(t);
  }, [activeTab, id]);

  const doAction = async (action, arg) => {
    setActLoading(action);
    try {
      if (action === 'verify')  await submissionAPI.verify(id);
      if (action === 'approve') await submissionAPI.approve(id);
      if (action === 'reject')  await submissionAPI.reject(id, arg);
      toast.success(
        action === 'approve' ? '✅ Disetujui!' :
        action === 'verify'  ? '✅ Diverifikasi' : '❌ Ditolak'
      );
      await load();
      setShowReject(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Terjadi kesalahan');
    }
    setActLoading('');
  };

  const doRequestRevision = async () => {
    if (!reqRevCat.trim()) { toast.error('Alasan revisi wajib diisi'); return; }
    setActLoading('req');
    try {
      await revisionAPI.request(id, { alasan_revisi: reqRevCat });
      toast.success('Permintaan revisi berhasil dikirim');
      setReqRevModal(false);
      setReqRevCat('');
      await load();
      // Pindah ke tab revisi terbaru
      setActiveTab(`revisi-${revisions.length + 1}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Gagal meminta revisi');
    }
    setActLoading('');
  };

  const sendMsg = async () => {
    if (!msg.trim()) return;
    try {
      const { data } = await messageAPI.send(id, msg.trim());
      setMsgs(prev => [...prev, data.data]);
      setMsg('');
    } catch { toast.error('Gagal mengirim pesan'); }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      toast.loading('Membuat PDF...', { id: 'pdf' });
      // Gunakan revisi terakhir yang sudah dikirim (submitted/terverifikasi/disetujui)
      // Items HARUS dari snapshot revisi karena submission_items baru disync saat approve
      const lastRevision = [...revisions].reverse().find(r =>
        ['submitted', 'terverifikasi', 'disetujui'].includes(r.status)
      );
      const exportData = lastRevision ? {
        ...sub,
        alasan:           lastRevision.alasan,
        riwayat:          lastRevision.riwayat,
        vendor:           lastRevision.vendor,
        npwp:             lastRevision.npwp,
        vendor2:          lastRevision.vendor2,
        rekening_tujuan:  lastRevision.rekening_tujuan,
        total_harga:      lastRevision.total_harga,
        items:            lastRevision.items,   // ← items dari snapshot, bukan submission_items
        _isRevision:      true,
        _revisionNumber:  lastRevision.revision_number,
      } : sub;
      await exportSinglePDF(exportData);
      toast.success('PDF berhasil dibuat!', { id: 'pdf' });
    } catch (err) {
      toast.error('Gagal: ' + err.message, { id: 'pdf' });
    }
    setExporting(false);
  };

  if (loading) return <Spinner size={32}/>;
  if (!sub)    return <div className="text-center py-20 text-slate-400">Pengajuan tidak ditemukan</div>;

  const isAlert      = ['Menunggu Verifikasi', 'Terverifikasi', 'Perlu Revisi'].includes(sub.status) && daysSince(sub.tanggal) > 2;
  const photos       = sub.photos || [];
  const items1       = (sub.items || []).filter(i => i.vendor_num !== 2);
  const items2       = (sub.items || []).filter(i => i.vendor_num === 2);
  const statusCls    = STATUS_COLOR[sub.status] || 'bg-slate-100 text-slate-500';
  const draftRevision = revisions.find(r => r.status === 'draft');

  // Cek apakah user adalah Kepala Operasional (berdasarkan jabatan)
  const isKepalaOp = user.jabatan === 'Kepala Operasional';
  const isPAR      = sub.type === 'PAR';

  // Permission request revisi — beda untuk PR vs PAR
  const canRequestRevision = isPAR
    ? (isKepalaOp || user.role === 'Admin') && ['Disetujui', 'Menunggu Verifikasi'].includes(sub.status)
    : ['Verifikator', 'Approval', 'Admin'].includes(user.role) &&
      ['Disetujui', 'Terverifikasi', 'Menunggu Verifikasi'].includes(sub.status) &&
      sub.status !== 'Selesai';

  const tabs = [
    { key: 'asli', label: 'Pengajuan Asli' },
    ...revisions.map(r => ({
      key:    `revisi-${r.revision_number}`,
      label:  `Revisi-${r.revision_number}`,
      status: r.status,
    })),
    { key: 'nota', label: 'Nota & Bayar' },
    { key: 'chat', label: `Chat (${msgs.length})` },
  ];

  const activeRevision = revisions.find(r => `revisi-${r.revision_number}` === activeTab);

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* ── MODALS ────────────────────────────────────────────── */}
      {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)}/>}

      {/* RevisiEditor — dari komponen terpisah */}
      {editSnap && (
        <RevisiEditor
          snapshot={editSnap}
          onClose={() => setEditSnap(null)}
          onSubmitted={() => { setEditSnap(null); load(); }}
        />
      )}

      {/* Reject pengajuan asli */}
      {showReject && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-3">Alasan Penolakan</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              rows={4} placeholder="Tuliskan alasan penolakan..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-red-400 mb-4"/>
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={() => setShowReject(false)}>Batal</Button>
              <Button variant="danger" className="flex-1"
                onClick={() => doAction('reject', rejectReason)}
                loading={actLoading === 'reject'}>Tolak</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal minta revisi */}
      {reqRevModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-1">Minta Revisi ke Pemohon</h3>
            <p className="text-xs text-slate-400 mb-4">
              Pemohon akan mendapat notifikasi dan bisa mengedit pengajuan ini.
            </p>
            <textarea value={reqRevCat} onChange={e => setReqRevCat(e.target.value)}
              rows={4} placeholder="Tuliskan apa yang perlu direvisi secara jelas..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none resize-none focus:border-purple-400 mb-4"/>
            <div className="flex gap-2.5">
              <Button variant="secondary" className="flex-1" onClick={() => { setReqRevModal(false); setReqRevCat(''); }}>
                Batal
              </Button>
              <Button className="flex-1 bg-purple-500 hover:bg-purple-600 text-white font-bold"
                onClick={doRequestRevision} loading={actLoading === 'req'} disabled={!reqRevCat.trim()}>
                Kirim Permintaan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex-shrink-0">
          <ChevronLeft size={18} className="text-slate-600"/>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400">Detail Pengajuan</p>
          <h1 className="text-base font-black text-slate-800 truncate">{sub.nomor_pengajuan}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-500">{sub.type}</span>
            {sub.is_umum && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-violet-100 text-violet-600">UMUM</span>}
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${statusCls}`}>{sub.status}</span>
            {sub.revisi_count > 0 && <RevisiBadge count={sub.revisi_count} />}
            {sub.jumlah_dp > 0 && sub.status !== 'Selesai' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">DP</span>}
            {isAlert && (
              <span className="text-[10px] font-bold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                ⚠ {daysSince(sub.tanggal)}h
              </span>
            )}
            {revisions.length > 0 && (
              <span className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">
                🔄 {revisions.length}x revisi
              </span>
            )}
          </div>
        </div>
        {/* Export PDF */}
        <button onClick={handleExportPDF} disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-bold transition-all flex-shrink-0">
          {exporting ? <Loader size={12} className="animate-spin"/> : <FileText size={12}/>}
          PDF
        </button>
      </div>

      {/* ── ACTION BANNERS — berbeda untuk PR vs PAR ─────────── */}

      {/* PR — Verifikator: verifikasi */}
      {!isPAR && user.role === 'Verifikator' && sub.status === 'Menunggu Verifikasi' && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-800">Perlu Verifikasi Anda</p>
            <p className="text-xs text-blue-400 mt-0.5">
              Periksa data {revisions.length > 0 ? 'revisi terakhir' : 'pengajuan'}
            </p>
          </div>
          <Button variant="info" onClick={() => doAction('verify')} loading={actLoading === 'verify'}>
            Verifikasi
          </Button>
        </div>
      )}

      {/* PR — Approval: setujui/tolak */}
      {!isPAR && user.role === 'Approval' && sub.status === 'Terverifikasi' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-amber-800 mb-3">Menunggu Keputusan Anda</p>
          <div className="flex gap-2.5">
            <Button variant="danger"  className="flex-1" onClick={() => setShowReject(true)}>✗ Tolak</Button>
            <Button variant="success" className="flex-1" onClick={() => doAction('approve')}
              loading={actLoading === 'approve'}>✓ Setujui</Button>
          </div>
        </div>
      )}

      {/* PAR — Kepala Operasional: langsung setujui/tolak dari status Menunggu Verifikasi */}
      {isPAR && isKepalaOp && sub.status === 'Menunggu Verifikasi' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-emerald-800 mb-1">Menunggu Keputusan Anda (PAR)</p>
          <p className="text-xs text-emerald-600 mb-3">Sebagai Kepala Operasional, Anda dapat langsung menyetujui atau menolak pengajuan PAR ini.</p>
          <div className="flex gap-2.5">
            <Button variant="danger"  className="flex-1" onClick={() => setShowReject(true)}>✗ Tolak</Button>
            <Button variant="success" className="flex-1" onClick={() => doAction('approve')}
              loading={actLoading === 'approve'}>✓ Setujui</Button>
          </div>
        </div>
      )}

      {/* PAR — info untuk Verifikator/Approval (mereka hanya bisa LIHAT) */}
      {isPAR && !isKepalaOp && user.role !== 'Admin' && user.role !== 'Operasional' &&
       ['Menunggu Verifikasi', 'Perlu Revisi'].includes(sub.status) && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center gap-2">
          <span className="text-base">👁</span>
          <p className="text-xs text-slate-500">
            Pengajuan PAR ini menunggu persetujuan <strong>Kepala Operasional</strong>.
            Anda dapat melihat detailnya tetapi tidak perlu melakukan verifikasi/approval.
          </p>
        </div>
      )}

      {/* Pemohon: perlu revisi */}
      {sub.status === 'Perlu Revisi' && user.role === 'Operasional' && draftRevision && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-purple-800">
              📝 Perlu Revisi ke-{draftRevision.revision_number}
            </p>
            <p className="text-xs text-purple-500 mt-0.5">{draftRevision.alasan_revisi}</p>
          </div>
          <button
            onClick={() => { setEditSnap(draftRevision); setActiveTab(`revisi-${draftRevision.revision_number}`); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold transition-all flex-shrink-0">
            <RefreshCw size={12}/> Edit Revisi
          </button>
        </div>
      )}

      {/* Tombol minta revisi (Verifikator/Approval) */}
      {canRequestRevision && (
        <button onClick={() => setReqRevModal(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-purple-300 hover:border-purple-500 text-purple-600 text-sm font-semibold transition-colors">
          <RefreshCw size={14}/> Minta Revisi ke Pemohon
        </button>
      )}

      {/* ── TABS ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-max min-w-full">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}>
              {t.label}
              {t.status && (
                <span className={`w-2 h-2 rounded-full ${
                  t.status === 'disetujui'                                        ? 'bg-emerald-500' :
                  t.status === 'submitted' || t.status === 'terverifikasi'        ? 'bg-amber-400'   :
                  t.status === 'ditolak'                                          ? 'bg-red-500'     :
                  'bg-slate-300'
                }`}/>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: PENGAJUAN ASLI ───────────────────────────────── */}
      {activeTab === 'asli' && (
        <div className="space-y-4">
          {/* Timeline */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Status Alur</p>
            {[
              { label: 'Dibuat',              info: `${sub.pemohon?.name} · ${fmtDateTime(sub.tanggal)}`,                     done: true },
              { label: 'Menunggu Verifikasi', info: sub.verifikasi_at ? `Diterima ${fmtDate(sub.verifikasi_at)}` : 'Menunggu...', done: !!sub.verifikasi_at },
              { label: 'Diverifikasi',        info: sub.verifikator?.name || '—',                                              done: !!sub.verifikator_id },
              ...(revisions.length > 0 ? [{ label: `${revisions.length}x Revisi`, info: sub.revisi_selesai_at ? `Selesai ${fmtDate(sub.revisi_selesai_at)}` : 'Ada revisi', done: !!sub.revisi_selesai_at, isRevisi: true }] : []),
              { label: 'Keputusan Approval',  info: sub.approval_at ? `${sub.status} · ${fmtDate(sub.approval_at)}` : 'Menunggu...', done: !!sub.approval_at, isReject: sub.status === 'Ditolak' },
              ...(['Disetujui', 'Selesai'].includes(sub.status) ? [
                { label: 'Pembayaran', info: sub.tanggal_bayar ? `${fmtCurrency(sub.jumlah_bayar)} · ${fmtDate(sub.tanggal_bayar)}` : 'Belum dicatat', done: !!sub.tanggal_bayar },
                { label: 'Selesai',    info: sub.ditutup_at ? `Ditutup ${fmtDate(sub.ditutup_at)}` : 'Menunggu...', done: sub.status === 'Selesai' },
              ] : []),
            ].map((t, i, arr) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center w-5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    t.done ? t.isReject ? 'bg-red-500' : t.isRevisi ? 'bg-purple-500' : 'bg-emerald-500' : 'bg-slate-200'
                  }`}>
                    {t.done && <Check size={10} className="text-white"/>}
                  </div>
                  {i < arr.length - 1 && (
                    <div className={`w-0.5 flex-1 min-h-[14px] mt-1 mb-1 ${t.done ? 'bg-emerald-200' : 'bg-slate-200'}`}/>
                  )}
                </div>
                <div className={`pb-3 ${i === arr.length - 1 ? 'pb-0' : ''}`}>
                  <p className={`text-sm font-semibold ${t.done ? 'text-slate-800' : 'text-slate-400'}`}>{t.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.info}</p>
                </div>
              </div>
            ))}
          </Card>

          {/* Info Pengajuan */}
          <Card padding={false}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">Informasi Pengajuan</p>
            {[
              ['Pemohon',          sub.pemohon?.name],
              ['Cabang',           sub.cabang_manual || sub.cabang],
              ...(sub.is_umum ? [] : [['Kendaraan', sub.kendaraan]]),
              ['Jenis Pembelian',  sub.jenis_pembelian],
              ['Vendor 1',         sub.vendor],
              ...(sub.npwp              ? [['NPWP',           sub.npwp]]             : []),
              ...(sub.rekening_tujuan   ? [['Rekening',        sub.rekening_tujuan]]  : []),
              ...(sub.vendor2           ? [['Vendor 2',        sub.vendor2]]          : []),
              ['Tgl Pengajuan',    fmtDate(sub.tanggal)],
              ['Batas Waktu Dana', sub.batas_waktu_dana],
              ['Batas Akhir Bayar',sub.batas_akhir_pembayaran ? fmtDate(sub.batas_akhir_pembayaran) : '—'],
              ['Total',            fmtCurrency(sub.total_harga)],
              ...(sub.jumlah_bayar > 0 ? [['Dibayar', fmtCurrency(sub.jumlah_bayar)]] : []),
            ].map(([k, v], i, arr) => (
              <div key={k} className={`flex justify-between gap-4 px-4 py-2.5 ${i < arr.length - 1 ? 'border-b border-slate-50' : ''}`}>
                <span className="text-xs text-slate-400 flex-shrink-0">{k}</span>
                <span className="text-xs font-semibold text-slate-700 text-right whitespace-pre-line">{v || '—'}</span>
              </div>
            ))}
          </Card>

          {/* Items */}
          <Card padding={false}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 pt-3 pb-2">Rincian Item</p>
            {[
              ...items1.map(i => ({ ...i, _v: 1 })),
              ...items2.map(i => ({ ...i, _v: 2 })),
            ].map((item, i, arr) => (
              <div key={item.id || i} className={`px-4 py-3 ${i < arr.length - 1 ? 'border-b border-slate-50' : ''}`}>
                <div className="flex items-start gap-2 mb-1">
                  {items2.length > 0 && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${
                      item._v === 1 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'
                    }`}>V{item._v}</span>
                  )}
                  <p className="text-sm font-medium text-slate-700 leading-relaxed">{item.penjelasan}</p>
                </div>
                {Number(item.diskon) > 0 && (
                  <div className="flex justify-between text-[11px] text-rose-500 mb-0.5">
                    <span>Diskon (dari {fmtCurrency((Number(item.total)||0) + (Number(item.diskon)||0))})</span>
                    <span>− {fmtCurrency(item.diskon)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400">{item.satuan}</span>
                  <span className="text-xs font-bold text-slate-600">{fmtCurrency(item.total || item.harga)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between px-4 py-3 bg-amber-50 border-t border-amber-100">
              <span className="text-sm font-extrabold text-amber-800">TOTAL</span>
              <span className="text-base font-black text-amber-500">{fmtCurrency(sub.total_harga)}</span>
            </div>
          </Card>

          {/* Keterangan */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Keterangan</p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Alasan</p>
                <p className="text-sm text-slate-700 leading-relaxed">{sub.alasan || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Riwayat</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{sub.riwayat || '—'}</p>
              </div>
              {sub.alasan_tolak && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-red-500 uppercase mb-1">Alasan Penolakan</p>
                  <p className="text-sm text-red-700">{sub.alasan_tolak}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Foto */}
          <Card padding={false}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Foto Lampiran ({photos.length})
              </p>
              {(user && (sub.pemohon_id === user.id || ['Admin', 'Verifikator', 'Approval'].includes(user.role))) && (
                <>
                  <input ref={fotoRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleUploadFoto}/>
                  <button onClick={() => fotoRef.current?.click()} disabled={savingFoto}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[10px] font-bold">
                    <Upload size={10}/> {savingFoto ? 'Mengunggah…' : 'Tambah'}
                  </button>
                </>
              )}
            </div>
            {photos.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-slate-400">Belum ada lampiran. Klik "Tambah" untuk mengunggah foto atau PDF.</p>
            ) : (
              <div className="p-3 grid grid-cols-2 gap-3">
                {photos.map(p => {
                  const isImg = p.file_url?.match(/\.(jpg|jpeg|png|webp)/i);
                  return (
                    <div key={p.id} className="rounded-xl overflow-hidden border border-slate-200">
                      <div className="relative aspect-square bg-slate-100 cursor-pointer group" onClick={() => setLightbox(p)}>
                        {isImg
                          ? <img src={p.file_url} alt={p.file_name} className="w-full h-full object-cover"/>
                          : <div className="w-full h-full flex items-center justify-center"><p className="text-3xl">📄</p></div>
                        }
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                          <ZoomIn size={20} className="text-white"/>
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-[10px] text-slate-600 truncate mb-1.5">{p.file_name}</p>
                        <div className="flex gap-1.5">
                          <button onClick={() => setLightbox(p)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-semibold">
                            <Eye size={10}/> Lihat
                          </button>
                          <a href={p.file_url} download={p.file_name} target="_blank" rel="noreferrer"
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-amber-500 text-white text-[10px] font-semibold">
                            <Download size={10}/> Download
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Tanda tangan */}
          <Card>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Tanda Tangan</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Dibuat',      name: sub.pemohon?.name,    jabatan: sub.pemohon?.jabatan,    done: true },
                { label: 'Verifikator', name: sub.verifikator?.name,jabatan: sub.verifikator?.jabatan,done: !!sub.verifikator_id },
                { label: 'Approval',    name: sub.approver?.name,   jabatan: sub.approver?.jabatan,   done: !!sub.approver_id, isReject: sub.status === 'Ditolak' },
              ].map((sig, i) => (
                <div key={i} className={`text-center p-2.5 rounded-xl border ${
                  sig.done ? sig.isReject ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'
                           : 'bg-slate-50 border-slate-100'
                }`}>
                  <p className="text-[9px] text-slate-400 mb-1.5 leading-tight">{sig.label}</p>
                  <div className={`w-8 h-8 rounded-full mx-auto mb-1.5 flex items-center justify-center ${
                    sig.done ? sig.isReject ? 'bg-red-500' : 'bg-emerald-500' : 'bg-slate-200'
                  }`}>
                    {sig.done ? <Check size={12} className="text-white"/> : <User size={10} className="text-slate-400"/>}
                  </div>
                  <p className={`text-[10px] font-bold ${
                    sig.done ? sig.isReject ? 'text-red-700' : 'text-emerald-700' : 'text-slate-400'
                  }`}>{sig.name || 'Menunggu...'}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{sig.jabatan || ''}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB: REVISI-N ─────────────────────────────────────── */}
      {activeRevision && (
        <RevisiPanel
          snapshot={activeRevision}
          sub={sub}
          user={user}
          onAction={load}
        />
      )}

      {/* ── TAB: NOTA & BAYAR ─────────────────────────────────── */}
      {activeTab === 'nota' && (
        <PaymentPanel sub={sub} user={user} onRefresh={load}/>
      )}

      {/* ── TAB: CHAT ─────────────────────────────────────────── */}
      {activeTab === 'chat' && (
        <Card padding={false} className="flex flex-col">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-sm font-bold text-slate-700">Diskusi Pengajuan</p>
            <p className="text-xs text-slate-400 mt-0.5">Antara Pemohon, Verifikator & Approval</p>
          </div>
          <div ref={chatRef} className="px-4 py-3 space-y-3 min-h-[240px] max-h-[400px] overflow-y-auto">
            {msgs.length === 0 && (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                Belum ada pesan
              </div>
            )}
            {msgs.map((m, i) => {
              const isMe = m.user?.id === user.id;
              if (m.is_system) return (
                <div key={i} className="text-center">
                  <span className="text-[11px] text-slate-500 bg-slate-100 px-3 py-1 rounded-full inline-block">
                    {m.message}
                  </span>
                </div>
              );
              const colors = {
                Operasional: 'bg-amber-400', Verifikator: 'bg-blue-500',
                Approval: 'bg-emerald-500', Admin: 'bg-violet-500',
              };
              return (
                <div key={i} className={`flex gap-2 items-end ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full ${colors[m.user?.role] || 'bg-slate-400'} flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white`}>
                    {m.user?.avatar_initials || '?'}
                  </div>
                  <div className={`max-w-[72%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <p className="text-[10px] text-slate-400 mb-1">{m.user?.name}</p>
                    <div className={`px-3 py-2 text-sm rounded-2xl leading-relaxed ${
                      isMe ? 'bg-amber-500 text-white rounded-br-sm' : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                    }`}>{m.message}</div>
                    <p className="text-[9px] text-slate-300 mt-1">{fmtDateTime(m.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-slate-50 flex gap-2">
            <textarea value={msg} onChange={e => setMsg(e.target.value)}
              onKeyDown={e => { 
                if (e.key === 'Enter' && !e.shiftKey) { 
                  e.preventDefault(); 
                  sendMsg(); 
              } }}
              placeholder="Ketik pesan... (Enter untuk kirim)"
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 outline-none focus:border-amber-400"/>
            <button onClick={sendMsg} disabled={!msg.trim()}
              className="w-10 h-10 rounded-xl bg-amber-500 disabled:bg-slate-200 flex items-center justify-center transition-colors flex-shrink-0">
              <Send size={15} className={msg.trim() ? 'text-white' : 'text-slate-400'}/>
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
