// src/utils/workflow.js — v2 (model per-langkah)
// Sumber kebenaran tunggal untuk alur verifikasi/persetujuan PR & PAR.
// Tiap (cabang, type) punya dua langkah bebas: verifikasi & persetujuan.
// Aktor NULL = langkah dilewati. Minimal satu langkah terisi.
// Dipakai submissionController (alur asli) & revisionController (alur revisi).
const supabase = require('../../config/supabase');

const DANA_SOSIAL = 'Beban Dana Sosial';

// Aktor: 'Verifikator'/'Approval' dicek dari role; 'Kepala Operasional'/'HRGA'
// dicek dari jabatan.
const AKTOR = ['Verifikator', 'Approval', 'Kepala Operasional', 'HRGA'];

// Alur default saat cabang belum dikonfigurasi.
const DEFAULT_FLOW = {
  PR:  { verifikasi: 'Verifikator', approval: 'Approval' },
  PAR: { verifikasi: null,          approval: 'Kepala Operasional' },
};

const normType   = (t) => (t === 'PAR' ? 'PAR' : 'PR');
const normCabang = (c) => (c || '').trim();

function actorMatches(user, actor) {
  if (!actor || !user) return false;
  if (actor === 'Verifikator' || actor === 'Approval') return user.role === actor;
  return user.jabatan === actor; // Kepala Operasional / HRGA
}

// Alur efektif untuk (cabang, type). Baca config; fallback ke default.
async function resolveFlow(cabang, type) {
  const t = normType(type);
  try {
    const { data } = await supabase.from('approval_workflow')
      .select('verifikasi_aktor, approval_aktor')
      .eq('cabang', normCabang(cabang)).eq('type', t).maybeSingle();
    if (data && (data.verifikasi_aktor || data.approval_aktor))
      return { verifikasi: data.verifikasi_aktor || null, approval: data.approval_aktor || null };
  } catch { /* tabel belum dibuat → default */ }
  return { ...DEFAULT_FLOW[t] };
}

// HRGA selalu boleh menangani jenis Beban Dana Sosial (lintas alur).
const hrgaDanaSosial = (user, jenis) => jenis === DANA_SOSIAL && user?.jabatan === 'HRGA';

// Alur asli — tiap langkah hanya aktif bila aktornya terisi.
function canVerify(user, flow, jenis) {
  if (!flow.verifikasi) return false;
  return user.role === 'Admin' || actorMatches(user, flow.verifikasi) || hrgaDanaSosial(user, jenis);
}
function canApprove(user, flow, jenis) {
  if (!flow.approval) return false;
  return user.role === 'Admin' || actorMatches(user, flow.approval) || hrgaDanaSosial(user, jenis);
}

// Alur revisi — snapshot selalu 2 langkah; bila satu langkah kosong, aktor yang
// ada merangkap langkah tersebut.
function canVerifySnapshot(user, flow, jenis) {
  const actor = flow.verifikasi || flow.approval;
  return user.role === 'Admin' || actorMatches(user, actor) || hrgaDanaSosial(user, jenis);
}
function canApproveSnapshot(user, flow, jenis) {
  const actor = flow.approval || flow.verifikasi;
  return user.role === 'Admin' || actorMatches(user, actor) || hrgaDanaSosial(user, jenis);
}

// Aktor yang dinotifikasi pertama kali saat pengajuan dibuat.
const firstActor = (flow) => flow.verifikasi || flow.approval;

module.exports = {
  DANA_SOSIAL, AKTOR, DEFAULT_FLOW,
  actorMatches, resolveFlow, canVerify, canApprove, canVerifySnapshot, canApproveSnapshot,
  firstActor, normType, normCabang,
};
