// src/utils/exportHelper.js
// Desain PDF: Logo kanan atas, Tanpa teks "BAWDI", Tabel Keterangan di bawah Rincian Item.
// Update: Tabel Informasi Utama dibuat menjadi 2 kolom (side-by-side).

const LOGO_PATH = "/Logo.jpg"; // Path file di folder public/

const fmtCurrencyExport = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDateExport = (iso) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const fmtDateTimeExport = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export { fmtCurrencyExport, fmtDateExport, fmtDateTimeExport };

/* ═══════════════════════════════════════════════════════════════
   EXPORT PDF — Laporan semua draft (landscape A4)
═══════════════════════════════════════════════════════════════ */
export async function exportToPDF(drafts, filterInfo = {}, fileName = 'Draft_Pengajuan_BAWDI') {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Header Line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(0, 22, pageW, 22);

  // Logo di kanan atas
  try {
    doc.addImage(LOGO_PATH, 'JPEG', pageW - 50, 5, 40, 14);
  } catch (e) {
    console.warn("Logo tidak ditemukan");
  }

  doc.setTextColor(30, 41, 59); 
  doc.setFontSize(12); 
  doc.setFont('helvetica', 'bold');
  doc.text('PT. Bantu Kawal Distribusi', 14, 12);
  
  doc.setFontSize(9); 
  doc.setFont('helvetica', 'normal'); 
  doc.setTextColor(100, 116, 139);
  doc.text('Laporan Rekapitulasi Pengajuan Maintenance', 14, 18);

  autoTable(doc, {
    startY: 30,
    head: [['No', 'Nomor Pengajuan', 'Plat', 'Pemohon', 'Vendor', 'Jenis', 'Total', 'Dibayar', 'Tgl Bayar', 'Rev', 'Nota', 'Tgl Tutup']],
    body: drafts.map((d, i) => [
      i + 1, d.nomor_pengajuan||'', d.kendaraan||'', d.pemohon_name||'',
      d.vendor_pilihan===2?(d.vendor2||''):(d.vendor||''),
      d.jenis_pembelian||'',
      fmtCurrencyExport(d.total_harga), fmtCurrencyExport(d.jumlah_bayar),
      d.tanggal_bayar?fmtDateExport(d.tanggal_bayar):'—',
      d.revisi_count||0, d.nota_url?'✓':'✗',
      d.ditutup_at?fmtDateExport(d.ditutup_at):'—',
    ]),
    styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [226, 232, 240], lineWidth: 0.3, textColor: [51, 65, 85] },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${fileName}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT PDF SINGLE — 1 pengajuan (portrait A4)
═══════════════════════════════════════════════════════════════ */
export async function exportSinglePDF(sub) {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── 1. Header (Logo Kanan, Hapus Tulisan BAWDI) ─────────────
  doc.setDrawColor(226, 232, 240); 
  doc.setLineWidth(0.5);
  doc.line(0, 26, pageW, 26);

  try {
    doc.addImage(LOGO_PATH, 'JPEG', pageW - margin - 40, 6, 40, 16);
  } catch (e) {
    console.warn("Logo tidak ditemukan");
  }

  doc.setTextColor(30, 41, 59); 
  doc.setFontSize(11); 
  doc.setFont('helvetica', 'bold');
  doc.text('PT. Bantu Kawal Distribusi', margin, 12);
  
  doc.setFontSize(8); 
  doc.setFont('helvetica', 'normal'); 
  doc.setTextColor(100, 116, 139);
  doc.text('Jl. Rajawali Sakti, Ruko Komplek Royal Regency', margin, 17);
  doc.text('Kota Pekanbaru, Riau', margin, 21);

  // ── 2. Judul Dokumen ─────────────────────────────────────────
  const typeLabel = sub.type === 'PAR' ? 'PURCHASE AUTHORIZATION REQUEST' : 'PURCHASE REQUISITION';
  doc.setTextColor(30, 41, 59); 
  doc.setFontSize(14); 
  doc.setFont('helvetica', 'bold');
  doc.text(typeLabel, pageW / 2, 36, { align: 'center' });

  doc.setFontSize(9); 
  doc.setFont('helvetica', 'normal'); 
  doc.setTextColor(100, 116, 139);
  doc.text(`Nomor: ${sub.nomor_pengajuan || '—'}`, pageW / 2, 42, { align: 'center' });

  // Status Badge
  const statusLabel = sub.status || 'Menunggu Verifikasi';
  const isOk = statusLabel.includes('Selesai') || statusLabel.includes('Setuju');
  const isBad = statusLabel.includes('Tolak');
  const badgeColor = isOk ? [16, 185, 129] : (isBad ? [239, 68, 68] : [245, 158, 11]);
  
  const labelWidth = doc.getTextWidth(statusLabel) + 10;
  doc.setDrawColor(...badgeColor); 
  doc.setLineWidth(0.4);
  doc.roundedRect(pageW/2 - labelWidth/2, 45, labelWidth, 6, 1, 1, 'S');
  
  doc.setTextColor(...badgeColor); 
  doc.setFontSize(8); 
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, pageW/2, 49.5, { align: 'center' });

  // ── 3. Tabel Informasi Utama (REVISI: 2 Kolom Sejajar) ──────────
  // Kita bagi data menjadi pasangan kiri dan kanan
  const infoRows = [
    [
      { content: 'Pemohon', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      sub.pemohon?.name || sub.pemohon_name || '—',
      { content: 'Vendor / Bengkel', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      sub.vendor_pilihan === 2 ? (sub.vendor2 || '—') : (sub.vendor || '—')
    ],
    [
      { content: 'Jabatan', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      sub.pemohon?.jabatan || '—',
      { content: 'Rekening Tujuan', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      sub.rekening_tujuan || '—'
    ],
    [
      { content: 'Cabang / Project', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      sub.cabang || sub.pemohon_cabang || '—',
      { content: 'Jenis Pembelian', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      sub.jenis_pembelian || '—'
    ],
    [
      { content: 'Kendaraan / Plat', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      sub.kendaraan || '—',
      { content: 'Tanggal Pengajuan', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      fmtDateExport(sub.tanggal)
    ],
    [
      { content: 'Batas Akhir Bayar', styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 58, 138] } },
      fmtDateExport(sub.batas_akhir_pembayaran),
      '', '' // Kolom kosong untuk menyeimbangkan baris terakhir jika diperlukan
    ]
  ];

  autoTable(doc, {
    startY: 56,
    body: infoRows,
    styles: { fontSize: 8, cellPadding: 2, textColor: [51,65,85], lineColor: [226,232,240], lineWidth: 0.2 },
    columnStyles: { 
      0: { cellWidth: 35 }, 
      1: { cellWidth: 58 }, 
      2: { cellWidth: 35 }, 
      3: { cellWidth: 54 } 
    },
    theme: 'grid',
  });

  // ── 4. Tabel Rincian Item ─────────────────────────────────────
  const items = sub.items || [];
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['No', 'Penjelasan Item', 'Vendor', 'Satuan', 'Harga (Rp)']],
    body: [
      ...items.map((item, i) => [
        i + 1, 
        item.penjelasan || '',
        item.vendor_num === 2 ? 'Vendor 2' : 'Vendor 1',
        item.satuan || '1', 
        fmtCurrencyExport(item.total || item.harga),
      ]),
      [{ content: 'TOTAL HARGA', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [241, 245, 249] } }, 
       { content: fmtCurrencyExport(sub.total_harga), styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } }],
    ],
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [51,65,85], lineColor: [200,200,200], lineWidth: 0.2 },
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 4: { halign: 'right', cellWidth: 40 } },
    theme: 'grid',
  });

  // ── 5. Tabel Keterangan ───────────────────────────────────────
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['INFORMASI TAMBAHAN / KETERANGAN', '']],
    body: [
      ['Alasan Pengajuan',   sub.alasan  || '—'],
      ['Riwayat Sebelumnya', sub.riwayat || '—'],
      ...(sub.alasan_tolak ? [['Alasan Penolakan', sub.alasan_tolak]] : []),
    ],
    styles: { fontSize: 8.5, cellPadding: 3, textColor: [51,65,85], lineColor: [226,232,240], lineWidth: 0.2 },
    headStyles: { fillColor: [255, 247, 237], textColor: [154, 52, 18], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold', fillColor: [255, 253, 250] } },
    theme: 'grid',
  });

  // ── 6. Tanda Tangan Digital ───────────────────────────────────
  let sigY = doc.lastAutoTable.finalY + 12;
  if (sigY + 40 > pageH) { doc.addPage(); sigY = 20; }
  
  const sigW = (pageW - margin * 2) / 3;
  const sigs = [
    { label: 'Dibuat Oleh', name: sub.pemohon?.name || sub.pemohon_name, time: sub.tanggal, role: sub.pemohon?.jabatan },
    { label: 'Diketahui (Verifikator)', name: sub.verifikator?.name || sub.verifikator_name, time: sub.verified_at, role: 'Finance/Admin' },
    { label: 'Disetujui (Approval)', name: sub.approver?.name || sub.approver_name, time: sub.approved_at, role: 'Manager/Direktur' },
  ];

  sigs.forEach((sig, i) => {
    const x = margin + i * sigW;
    const xCenter = x + sigW/2;

    doc.setFontSize(8); 
    doc.setTextColor(100, 116, 139); 
    doc.setFont('helvetica', 'bold');
    doc.text(sig.label, xCenter, sigY, { align: 'center' });
    
    if (sig.name) {
      doc.setFontSize(9); 
      doc.setTextColor(30, 41, 59);
      doc.text(sig.name.toUpperCase(), xCenter, sigY + 22, { align: 'center' });
      
      doc.setDrawColor(30, 41, 59); 
      doc.setLineWidth(0.3);
      const nameWidth = doc.getTextWidth(sig.name);
      doc.line(xCenter - (nameWidth/2), sigY + 23, xCenter + (nameWidth/2), sigY + 23);

      if (sig.role) {
        doc.setFontSize(7); 
        doc.setFont('helvetica', 'normal'); 
        doc.setTextColor(100, 116, 139);
        doc.text(sig.role, xCenter, sigY + 27, { align: 'center' });
      }

      if (sig.time) {
        doc.setFontSize(6); 
        doc.setFont('helvetica', 'italic'); 
        doc.setTextColor(148, 163, 184);
        doc.text(`Digital Sign: ${fmtDateTimeExport(sig.time)}`, xCenter, sigY + 31, { align: 'center' });
      }
    } else {
      doc.setDrawColor(226, 232, 240);
      doc.line(x + 10, sigY + 23, x + sigW - 10, sigY + 23);
      doc.setFontSize(7); 
      doc.setTextColor(200, 200, 200);
      doc.text('(Belum Verifikasi)', xCenter, sigY + 22, { align: 'center' });
    }
  });

  const totalPages = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFontSize(7); 
    doc.setTextColor(148, 163, 184);
    doc.text(`BAWD Maintenance System — Halaman ${pg} dari ${totalPages}`, pageW/2, pageH - 8, { align: 'center' });
    doc.text(`Dicetak pada: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  doc.save(`PR_${(sub.nomor_pengajuan||'pengajuan').replace(/\//g,'-')}.pdf`);
}
