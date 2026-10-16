// src/utils/plat.js — resolusi plat sadar-alias (plat ganti)
// Satu kendaraan bisa berganti plat. Plat lama disimpan di vehicles.plat_sebelumnya
// (daftar dipisah koma/garis miring). Fungsi ini mengembalikan SEMUA plat milik
// satu kendaraan (plat sekarang + semua plat sebelumnya) agar riwayat tersambung.

// Pecah daftar plat sebelumnya: toleran pemisah koma, garis miring, titik koma, baris baru.
function parsePrevPlat(s) {
  return String(s || '').split(/[,/;\n]+/).map(x => x.trim()).filter(Boolean);
}

const normUp = (p) => String(p || '').trim().toUpperCase().replace(/\s+/g, ' ');
const digitsOf = (p) => String(p || '').replace(/\D+/g, '');

// Kembalikan daftar plat (string mentah, dinormalisasi uppercase) untuk kendaraan
// yang memuat `inputPlat` — baik sebagai plat sekarang maupun plat sebelumnya.
// Fallback (tabel/kolom belum ada, atau tak ketemu): [inputPlat] saja.
async function resolveVehiclePlates(supabase, inputPlat) {
  const raw = String(inputPlat || '').trim();
  if (!raw) return [];
  const up = normUp(raw);
  const d  = digitsOf(raw);
  try {
    const pat = d.length >= 2 ? `%${d}%` : `%${raw}%`;
    const { data } = await supabase.from('vehicles')
      .select('plat, plat_sebelumnya')
      .or(`plat.ilike.${pat},plat_sebelumnya.ilike.${pat}`);
    for (const v of data || []) {
      const plates = [v.plat, ...parsePrevPlat(v.plat_sebelumnya)].map(normUp).filter(Boolean);
      if (plates.includes(up)) return [...new Set(plates)];
    }
  } catch { /* kolom plat_sebelumnya belum ada → fallback single */ }
  return [up];
}

module.exports = { parsePrevPlat, resolveVehiclePlates, normUp, digitsOf };
