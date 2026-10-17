// src/utils/plat.js — resolusi plat sadar-alias + sadar-garis-miring
// Satu kendaraan bisa ditulis beragam: plat baru, plat lama, atau GABUNGAN
// "BARU/LAMA". Supaya riwayat tetap nyambung, sistem belajar alias dari:
//   (a) master kendaraan: vehicles.plat + vehicles.plat_sebelumnya
//   (b) pengajuan ber-garis-miring: bagian-bagiannya dianggap plat yang sama
// Lalu pencocokan memeriksa TIAP bagian plat sebuah record.

const normUp    = (p) => String(p || '').trim().toUpperCase().replace(/\s+/g, ' ');
const digitsOf  = (p) => String(p || '').replace(/\D+/g, '');

// Pemisah plat gabungan di satu field.
const SEP = /[/,;]+/;
// Pecah string plat jadi bagian-bagian (ternormalisasi, buang kosong).
const splitPlates = (s) => String(s || '').split(SEP).map(normUp).filter(Boolean);
// Plat sebelumnya (daftar) di master — pemisah lebih longgar (termasuk baris baru).
const parsePrevPlat = (s) => String(s || '').split(/[,/;\n]+/).map(x => x.trim()).filter(Boolean);

// true bila SALAH SATU bagian plat `kendaraan` ada di `set` (berisi normUp plates).
function anyPlatInSet(kendaraan, set) {
  for (const p of splitPlates(kendaraan)) if (set.has(p)) return true;
  return false;
}

// Bangun index alias dari master kendaraan + pengajuan ber-garis-miring.
// Mengelompokkan semua plat yang setara (union-find).
async function buildAliasIndex(supabase) {
  const parent = new Map();
  const add   = (x) => { if (x && !parent.has(x)) parent.set(x, x); };
  const find  = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const n = parent.get(x); parent.set(x, r); x = n; } return r; };
  const union = (a, b) => { if (!a || !b) return; add(a); add(b); parent.set(find(a), find(b)); };

  const vehCurrent = new Set(); // plat SEKARANG tiap kendaraan master

  // (a) master kendaraan
  try {
    const { data } = await supabase.from('vehicles').select('plat, plat_sebelumnya');
    for (const v of data || []) {
      const curParts = splitPlates(v.plat);
      curParts.forEach(c => { vehCurrent.add(c); add(c); });
      // satukan antar bagian plat sekarang (kalau master terlanjur berisi gabungan)
      for (let i = 1; i < curParts.length; i++) union(curParts[0], curParts[i]);
      // satukan dengan plat sebelumnya
      for (const prev of parsePrevPlat(v.plat_sebelumnya))
        for (const p of splitPlates(prev)) union(curParts[0] || p, p);
    }
  } catch { /* kolom plat_sebelumnya belum ada → lewati master */ }

  // (b) pengajuan ber-garis-miring → bagian-bagiannya = plat yang sama
  try {
    const { data } = await supabase.from('submissions').select('kendaraan').like('kendaraan', '%/%').limit(5000);
    for (const s of data || []) {
      const parts = splitPlates(s.kendaraan);
      for (let i = 1; i < parts.length; i++) union(parts[0], parts[i]);
    }
  } catch { /* abaikan */ }

  // Kelompokkan + tentukan plat "sekarang" per grup.
  const groups = new Map();        // root → Set plates
  for (const p of parent.keys()) {
    const r = find(p);
    if (!groups.has(r)) groups.set(r, new Set());
    groups.get(r).add(p);
  }
  const groupCurrent = new Map();  // root → plat sekarang
  for (const [r, set] of groups) {
    let cur = null;
    for (const p of set) if (vehCurrent.has(p)) { cur = p; break; }
    groupCurrent.set(r, cur || [...set][0]);
  }

  // Semua plat setara dengan `kendaraan` (gabungan grup tiap bagian + bagian itu sendiri).
  const setOf = (kendaraan) => {
    const out = new Set();
    for (const p of splitPlates(kendaraan)) {
      out.add(p);
      if (parent.has(p)) for (const q of groups.get(find(p))) out.add(q);
    }
    if (!out.size) { const n = normUp(kendaraan); if (n) out.add(n); }
    return out;
  };
  // Plat "sekarang" untuk sebuah record (utk tampilan daftar).
  const currentOf = (kendaraan) => {
    for (const p of splitPlates(kendaraan)) if (parent.has(p)) return groupCurrent.get(find(p));
    return normUp(kendaraan);
  };

  return { setOf, currentOf };
}

// Daftar plat (individual, canonical) yang setara dengan `inputPlat`.
// Split-aware (input boleh gabungan) + alias-expand. Fallback: bagian input.
async function resolveVehiclePlates(supabase, inputPlat) {
  const idx = await buildAliasIndex(supabase);
  return [...idx.setOf(inputPlat)];
}

module.exports = {
  normUp, digitsOf, splitPlates, parsePrevPlat, anyPlatInSet,
  buildAliasIndex, resolveVehiclePlates,
};
