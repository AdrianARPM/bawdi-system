// src/utils/exportHelper.js
// Desain PDF: Logo kanan atas (local file), Tabel Item lalu Tabel Keterangan, Digital Timestamp Signature.

const LOGO_PATH = "/Logo.jpg"; // Mengambil langsung dari folder public/

const fmtCurrencyExport = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);
const fmtDateExport = (iso) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const fmtDateTimeExport = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export { fmtCurrencyExport, fmtDateExport, fmtDateTimeExport };

/* ═══════════════════════════════════════════════════════════════
   EXPORT PDF — Laporan rekap (landscape A4)
═══════════════════════════════════════════════════════════════ */
export async function exportToPDF(drafts, filterInfo = {}, fileName = 'Draft_Pengajuan_BAWDI') {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(0, 22, pageW, 22);

  // Load Logo dari public folder
  try {
    doc.addImage(LOGO_PATH, 'JPEG', pageW - 50, 5, 40, 14);
  } catch (e) {
    console.warn("Logo tidak ditemukan di /public/Logo.jpg");
  }

  doc.setTextColor(30, 41, 59); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('PT. Bantu Kawal Distribusi', 14, 12);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
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

  // ── Header (Logo dari file lokal) ───────────────────────────
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.5);
  doc.line(0, 26, pageW, 26);

  try {
    doc.addImage(LOGO_PATH, 'JPEG', pageW - margin - 40, 7, 40, 15);
  } catch (e) {
    console.warn("Logo tidak ditemukan di /public/Logo.jpg");
  }

  doc.setTextColor(30, 41, 59); doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('PT. Bantu Kawal Distribusi', margin, 12);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text('Jl. Rajawali Sakti, Ruko Komplek Royal Regency', margin, 17);
  doc.text('Kota Pekanbaru, Riau', margin, 21);

  // ── Judul Dokumen ─────────────────────────────────────────────
  const typeLabel = sub.type === 'PAR' ? 'PURCHASE AUTHORIZATION REQUEST' : 'PURCHASE REQUISITION';
  doc.setTextColor(30, 41, 59); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(typeLabel, pageW / 2, 36, { align: 'center' });

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text(`Nomor: ${sub.nomor_pengajuan || '—'}`, pageW / 2, 42, { align: 'center' });

  // Status Badge
  const sl = sub.status || 'Menunggu Verifikasi';
  const sc = sl.includes('Selesai') || sl.includes('Setuju') ? [16,185,129] : (sl.includes('Tolak') ? [239,68,68] : [245,158,11]);
  const sw = doc.getTextWidth(sl) + 10;
  doc.setDrawColor(...sc); doc.setLineWidth(0.4);
  doc.roundedRect(pageW/2 - sw/2, 45, sw, 5.5, 1, 1, 'S');
  doc.setTextColor(...sc); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text(sl, pageW/2, 49.2, { align: 'center' });

  // ── 1. Tabel Info Pemohon & Kendaraan ──────────────────────────
  const infoRows = [
    ['Pemohon',           sub.pemohon?.name    || sub.pemohon_name || '—'],
    ['Jabatan',           sub.pemohon?.jabatan || '—'],
    ['Cabang / Project',  sub.cabang           || sub.pemohon_cabang || '—'],
    ['Kendaraan / Plat',  sub.kendaraan        || '—'],
    ['Vendor / Bengkel',  sub.vendor_pilihan===2 ? (sub.vendor2||'—') : (sub.vendor||'—')],
    ['Rekening Tujuan',   sub.rekening_tujuan  || '—'],
    ['Jenis Pembelian',   sub.jenis_pembelian  || '—'],
    ['Tanggal Pengajuan', fmtDateExport(sub.tanggal)],
    ['Batas Waktu Dana',  sub.batas_waktu_dana ? `${sub.batas_waktu_dana} Hari` : '—'],
    ['Batas Akhir Bayar', fmtDateExport(sub.batas_akhir_pembayaran)],
  ];

  autoTable(doc, {
    startY: 55,
    body: infoRows,
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [51,65,85], lineColor: [226,232,240], lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold', textColor: [30, 58, 138] } },
    theme: 'grid',
  });

  // ── 2. Tabel Rincian Item ─────────────────────────────────────
  const items = sub.items || [];
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['No', 'Penjelasan Item', 'Vendor', 'Satuan', 'Harga (Rp)']],
    body: [
      ...items.map((item, i) => [
        i + 1, item.penjelasan||'',
        item.vendor_num===2?'Vendor 2':'Vendor 1',
        item.satuan||'1', fmtCurrencyExport(item.total||item.harga),
      ]),
      [{ content: 'TOTAL', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }, { content: fmtCurrencyExport(sub.total_harga), styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }],
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [51,65,85], lineColor: [200,200,200], lineWidth: 0.2 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
    columnStyles: { 0:{halign:'center',cellWidth:10}, 4:{halign:'right',cellWidth:35} },
    theme: 'grid',
  });

  // ── 3. Tabel Keterangan ───────────────────────────────────────
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [['INFORMASI TAMBAHAN / KETERANGAN', '']],
    body: [
      ['Alasan Pengajuan',   sub.alasan  || '—'],
      ['Riwayat Sebelumnya', sub.riwayat || '—'],
      ...(sub.alasan_tolak ? [['Alasan Penolakan', sub.alasan_tolak]] : []),
    ],
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [51,65,85], lineColor: [226,232,240], lineWidth: 0.2 },
    headStyles: { fillColor: [255, 247, 237], textColor: [154, 52, 18], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } },
    theme: 'grid',
  });

  // ── 4. Tanda Tangan Digital ───────────────────────────────────
  let sigY = doc.lastAutoTable.finalY + 12;
  if (sigY + 35 > pageH) { doc.addPage(); sigY = 20; }
  
  const sigW = (pageW - margin * 2) / 3;
  const sigs = [
    { label: 'Dibuat Oleh', name: sub.pemohon?.name || sub.pemohon_name, time: sub.tanggal },
    { label: 'Diketahui (Verifikator)', name: sub.verifikator?.name || sub.verifikator_name, time: sub.verified_at },
    { label: 'Disetujui (Approval)', name: sub.approver?.name || sub.approver_name, time: sub.approved_at },
  ];

  sigs.forEach((sig, i) => {
    const x = margin + i * sigW;
    doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'bold');
    doc.text(sig.label, x + sigW/2, sigY, { align: 'center' });
    
    if (sig.name) {
      doc.setFontSize(8.5); doc.setTextColor(30, 41, 59);
      doc.text(sig.name.toUpperCase(), x + sigW/2, sigY + 22, { align: 'center' });
      doc.setDrawColor(200, 200, 200); doc.line(x + 10, sigY + 23, x + sigW - 10, sigY + 23);
      
      if (sig.time) {
        doc.setFontSize(6.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(148, 163, 184);
        doc.text(`Tgl: ${fmtDateTimeExport(sig.time)}`, x + sigW/2, sigY + 26, { align: 'center' });
      }
    } else {
      doc.setDrawColor(200, 200, 200); doc.line(x + 10, sigY + 23, x + sigW - 10, sigY + 23);
      doc.setFontSize(7); doc.setTextColor(200, 200, 200);
      doc.text('(Belum Tersedia)', x + sigW/2, sigY + 22, { align: 'center' });
    }
  });

  // Footer Hal
  const totalPages = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text(`BAWD Maintenance Management System — Hal. ${pg}/${totalPages}`, pageW/2, pageH - 8, { align: 'center' });
    doc.text(`Dicetak: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  doc.save(`PR_${(sub.nomor_pengajuan||'pengajuan').replace(/\//g,'-')}.pdf`);
}
