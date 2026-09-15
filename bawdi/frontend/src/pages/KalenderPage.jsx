// src/pages/KalenderPage.jsx — Kalender Jatuh Tempo Pembayaran
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, Trash2, StickyNote, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { kalenderAPI } from '../utils/api';
import { Card, Spinner, fmtCurrency, fmtDate, fmtDateTime } from '../components/ui';
import useAuthStore from '../context/authStore';

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI  = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayStr = () => { const n = new Date(); return ymd(n.getFullYear(), n.getMonth(), n.getDate()); };

// Sudah lunas / selesai?
const isPaid = (s) => s.status === 'Selesai' || ((Number(s.jumlah_bayar) || 0) > 0 && (Number(s.jumlah_bayar) || 0) >= (Number(s.total_harga) || 0));

export default function KalenderPage() {
  const { user } = useAuthStore();
  const canNotes = ['Admin', 'Verifikator', 'Approval'].includes(user?.role);

  const now = new Date();
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() }); // m: 0-based
  const [subs, setSubs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // 'YYYY-MM-DD'
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const from = ymd(cur.y, cur.m, 1);
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const to = ymd(cur.y, cur.m, daysInMonth);
  const firstWeekday = new Date(cur.y, cur.m, 1).getDay();

  const load = async () => {
    setLoading(true);
    try {
      const reqs = [kalenderAPI.calendar(from, to)];
      if (canNotes) reqs.push(kalenderAPI.notes(from, to));
      const [subRes, noteRes] = await Promise.all(reqs);
      setSubs(subRes.data?.data || []);
      setNotes(canNotes ? (noteRes?.data?.data || []) : []);
    } catch { toast.error('Gagal memuat kalender'); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cur.y, cur.m]);

  // Kelompokkan per tanggal
  const subsByDate = useMemo(() => {
    const map = {};
    for (const s of subs) {
      const k = (s.batas_akhir_pembayaran || '').slice(0, 10);
      if (!k) continue;
      (map[k] = map[k] || []).push(s);
    }
    return map;
  }, [subs]);

  const notesByDate = useMemo(() => {
    const map = {};
    for (const n of notes) {
      const k = (n.tanggal || '').slice(0, 10);
      (map[k] = map[k] || []).push(n);
    }
    return map;
  }, [notes]);

  const today = todayStr();
  const overdue = useMemo(() => subs.filter(s => (s.batas_akhir_pembayaran || '').slice(0, 10) < today && !isPaid(s)), [subs, today]);

  const dotColor = (k) => {
    const list = subsByDate[k];
    if (!list?.length) return null;
    if (list.some(s => k < today && !isPaid(s))) return 'bg-red-500';       // lewat & belum tuntas
    if (list.some(s => !isPaid(s))) {
      if (k === today) return 'bg-yellow-400';                              // jatuh tempo hari ini
      if (k > today)   return 'bg-blue-500';                                // akan datang
    }
    return 'bg-emerald-500';                                               // semua sudah lunas
  };

  const gotoMonth = (delta) => { setSelected(null); setCur(c => { const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; }); };
  const gotoToday = () => { const n = new Date(); setSelected(null); setCur({ y: n.getFullYear(), m: n.getMonth() }); };

  const addNote = async () => {
    if (!noteText.trim() || !selected) return;
    setSavingNote(true);
    try {
      await kalenderAPI.addNote(selected, noteText.trim());
      setNoteText('');
      const { data } = await kalenderAPI.notes(from, to);
      setNotes(data?.data || []);
    } catch (err) { toast.error(err.response?.data?.error || 'Gagal menambah catatan'); }
    setSavingNote(false);
  };
  const delNote = async (id) => {
    if (!window.confirm('Hapus catatan ini?')) return;
    try {
      await kalenderAPI.delNote(id);
      setNotes(notes.filter(n => n.id !== id));
    } catch (err) { toast.error(err.response?.data?.error || 'Gagal menghapus catatan'); }
  };

  const selList = selected ? (subsByDate[selected] || []) : [];
  const selNotes = selected ? (notesByDate[selected] || []) : [];
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays size={20} className="text-slate-500 dark:text-slate-400"/>
        <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Kalender Bayar</h1>
      </div>

      {/* Banner lewat tempo */}
      {overdue.length > 0 && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-2xl p-4">
          <div className="flex gap-3">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5"/>
            <div className="min-w-0">
              <p className="text-sm font-bold text-red-700 dark:text-red-300 mb-1">
                {overdue.length} pembayaran lewat tempo & belum tuntas (bulan ini)
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {overdue.slice(0, 6).map(s => (
                  <Link key={s.id} to={`/submissions/${s.id}`} className="text-xs font-semibold text-red-600 dark:text-red-400 underline">
                    {s.nomor_pengajuan} · {fmtDate(s.batas_akhir_pembayaran)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Kalender */}
        <Card className="w-full lg:flex-1 !p-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => gotoMonth(-1)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60"><ChevronLeft size={16}/></button>
            <div className="text-center">
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{BULAN[cur.m]} {cur.y}</p>
              <button onClick={gotoToday} className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline">Hari ini</button>
            </div>
            <button onClick={() => gotoMonth(1)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60"><ChevronRight size={16}/></button>
          </div>

          {loading ? <div className="py-16"><Spinner size={26}/></div> : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {HARI.map(h => <div key={h} className="text-center text-[10px] font-bold text-slate-400 dark:text-slate-500 py-1">{h}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  if (d === null) return <div key={`e${i}`}/>;
                  const k = ymd(cur.y, cur.m, d);
                  const dot = dotColor(k);
                  const hasNote = canNotes && notesByDate[k]?.length > 0;
                  const isToday = k === today;
                  const isSel = k === selected;
                  return (
                    <button key={k} onClick={() => { setSelected(k); setNoteText(''); }}
                      className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-colors border ${
                        isSel ? 'border-amber-400 bg-amber-50 dark:bg-amber-500/10'
                        : isToday ? 'border-amber-300 dark:border-amber-500/40'
                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                      {hasNote && <StickyNote size={10} className="absolute top-1 right-1 text-yellow-500"/>}
                      <span className={`font-semibold ${isToday ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>{d}</span>
                      {dot && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${dot}`}/>}
                    </button>
                  );
                })}
              </div>
              {/* Legenda */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>Lewat tempo</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400"/>Hari ini</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>Akan datang</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Lunas</span>
                {canNotes && <span className="flex items-center gap-1"><StickyNote size={10} className="text-yellow-500"/>Ada catatan</span>}
              </div>
            </>
          )}
        </Card>

        {/* Panel tanggal terpilih */}
        <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
          {!selected ? (
            <Card className="!p-4 text-center text-sm text-slate-400 dark:text-slate-500">
              Pilih tanggal untuk melihat jatuh tempo{canNotes ? ' & catatan' : ''}.
            </Card>
          ) : (
            <>
              <Card padding={false}>
                <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Jatuh Tempo · {fmtDate(selected)}</p>
                </div>
                {selList.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-slate-400 dark:text-slate-500">Tidak ada jatuh tempo pada tanggal ini.</p>
                ) : selList.map((s, i) => {
                  const paid = isPaid(s);
                  const late = selected < today && !paid;
                  return (
                    <Link key={s.id} to={`/submissions/${s.id}`}
                      className={`block px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${i < selList.length - 1 ? 'border-b border-slate-50 dark:border-slate-800' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${paid ? 'bg-emerald-500' : late ? 'bg-red-500' : selected === today ? 'bg-yellow-400' : 'bg-blue-500'}`}/>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{s.nomor_pengajuan}</span>
                        <span className="ml-auto text-xs font-bold text-slate-600 dark:text-slate-300 flex-shrink-0">{fmtCurrency(s.total_harga)}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {[s.kendaraan, s.vendor].filter(Boolean).join(' · ')} · {paid ? 'Lunas' : late ? 'Lewat tempo' : 'Belum dibayar'}
                      </p>
                    </Link>
                  );
                })}
              </Card>

              {/* Catatan bersama — Admin/Verifikator/Approval */}
              {canNotes && (
                <Card padding={false}>
                  <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800 flex items-center gap-2">
                    <StickyNote size={14} className="text-yellow-500"/>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Catatan</p>
                  </div>
                  {selNotes.length > 0 && (
                    <div className="p-3 space-y-2">
                      {selNotes.map(n => (
                        <div key={n.id} className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-xl p-2.5">
                          <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-line">{n.catatan}</p>
                          <div className="flex items-center justify-between mt-1.5">
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">{n.dibuat_nama || '—'} · {fmtDateTime(n.created_at)}</p>
                            {(user?.role === 'Admin' || n.dibuat_oleh === user?.id) && (
                              <button onClick={() => delNote(n.id)} className="text-slate-300 dark:text-slate-600 hover:text-red-500"><Trash2 size={12}/></button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-3 border-t border-slate-50 dark:border-slate-800">
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2}
                      placeholder="Catatan untuk tanggal ini"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 text-sm outline-none resize-none focus:border-amber-400 mb-2"/>
                    <button onClick={addNote} disabled={savingNote || !noteText.trim()}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                      {savingNote ? <Loader size={13} className="animate-spin"/> : <StickyNote size={13}/>} Tambah Catatan
                    </button>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 text-center">Catatan bersama — terlihat oleh Verifikator & Approval.</p>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
