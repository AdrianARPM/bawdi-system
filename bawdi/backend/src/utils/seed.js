// src/utils/seed.js
// Jalankan: node src/utils/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../../config/supabase');

const USERS = [
  { nik: '10000', name: 'Admin BAWDI',       role: 'Admin',       jabatan: 'System Administrator', cabang: 'Head Office'   },
  { nik: '10001', name: 'Fathiyyah Amanina', role: 'Operasional', jabatan: 'Distribution Staff',   cabang: 'APL BDO'      },
  { nik: '10002', name: 'Yuni Fitriani',     role: 'Verifikator', jabatan: 'Accounting Staff',     cabang: 'Head Office'  },
  { nik: '10003', name: 'Rahmat Yuli',       role: 'Approval',    jabatan: 'Administration Manager',cabang: 'Head Office' },
  { nik: '10004', name: 'Budi Santoso',      role: 'Operasional', jabatan: 'Driver Coordinator',   cabang: 'APL BDO'      },
];

async function seed() {
  console.log('🌱  Memulai seeding data...\n');

  for (const u of USERS) {
    const hash = await bcrypt.hash(u.nik, 12); // default password = NIK
    const initials = u.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();

    const { error } = await supabase.from('users').upsert({
      id: uuidv4(), nik: u.nik, name: u.name, role: u.role,
      jabatan: u.jabatan, cabang: u.cabang,
      password_hash: hash, avatar_initials: initials,
      is_active: true, must_change_password: true,
    }, { onConflict: 'nik' });

    if (error) {
      console.error(`❌  Gagal seed user ${u.name}:`, error.message);
    } else {
      console.log(`✅  User seeded: ${u.name} (${u.role}) — NIK: ${u.nik}`);
    }
  }

  console.log('\n🎉  Seeding selesai!');
  console.log('📝  Default password = NIK masing-masing user');
  console.log('⚠   Ingatkan setiap user untuk ganti password setelah login pertama.\n');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
