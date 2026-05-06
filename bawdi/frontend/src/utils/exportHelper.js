// src/utils/exportHelper.js  — PDF only (v4.1)

/* ═══════════════════════════════════════════════════════════
   HELPER FORMAT
═══════════════════════════════════════════════════════════ */
export const fmtCurrencyExport = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0);

export const fmtDateExport = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
};

export const fmtDateTimeExport = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

/* ═══════════════════════════════════════════════════════════
   EXPORT PDF — menggunakan jsPDF + autoTable
═══════════════════════════════════════════════════════════ */
export async function exportToPDF(drafts, filterInfo = {}, fileName = 'Draft_Pengajuan_BAWDI') {
  // Dynamic import jsPDF
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header ────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageW, 22, 'F');

  doc.setTextColor(245, 158, 11); // amber-500
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('BAWDI', 14, 10);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('PT. Bantu Kawal Distribusi — Sistem Pengajuan Maintenance', 14, 16);

  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFontSize(8);
  doc.text(`Dicetak: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - 14, 16, { align: 'right' });

  // ── Judul ─────────────────────────────────────────────────
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN DRAFT / ARSIP PENGAJUAN', 14, 32);

  // ── Filter info ───────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  let filterText = 'Filter: Semua pengajuan';
  if (filterInfo.kendaraan) filterText = `Plat Kendaraan: ${filterInfo.kendaraan}`;
  if (filterInfo.bulanLabel) filterText += (filterInfo.kendaraan ? ' · ' : 'Filter: ') + `Bulan: ${filterInfo.bulanLabel}`;
  doc.text(filterText, 14, 38);

  // ── Summary boxes ─────────────────────────────────────────
  const totalBayar  = drafts.reduce((s, d) => s + (Number(d.jumlah_bayar) || 0), 0);
  const totalNilai  = drafts.reduce((s, d) => s + (Number(d.total_harga) || 0), 0);

  const boxes = [
    { label: 'Total Arsip', value: `${drafts.length} pengajuan`, color: [59, 130, 246] },
    { label: 'Total Nilai', value: fmtCurrencyExport(totalNilai), color: [245, 158, 11] },
    { label: 'Total Dibayar', value: fmtCurrencyExport(totalBayar), color: [16, 185, 129] },
  ];

  const boxW = (pageW - 28 - 8) / 3;
  boxes.forEach((box, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(...box.color);
    doc.roundedRect(x, 42, boxW, 16, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(box.label.toUpperCase(), x + 4, 48);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(box.value, x + 4, 54);
  });

  // ── Tabel utama ───────────────────────────────────────────
  autoTable(doc, {
    startY: 64,
    head: [[
      'No', 'Nomor Pengajuan', 'Plat', 'Pemohon',
      'Vendor', 'Jenis Pembelian',
      'Total Disetujui', 'Dibayar', 'Tgl Bayar',
      'Revisi', 'Nota', 'Tgl Tutup',
    ]],
    body: drafts.map((d, i) => [
      i + 1,
      d.nomor_pengajuan || '',
      d.kendaraan || '',
      d.pemohon_name || '',
      d.vendor_pilihan === 2 ? (d.vendor2 || '') : (d.vendor || ''),
      d.jenis_pembelian || '',
      fmtCurrencyExport(d.total_harga),
      fmtCurrencyExport(d.jumlah_bayar),
      d.tanggal_bayar ? fmtDateExport(d.tanggal_bayar) : '—',
      d.revisi_count || 0,
      d.nota_url ? '✓' : '✗',
      d.ditutup_at ? fmtDateExport(d.ditutup_at) : '—',
    ]),
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      overflow: 'linebreak',
      lineColor: [241, 245, 249],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [245, 158, 11],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0:  { halign: 'center', cellWidth: 8 },
      1:  { cellWidth: 38 },
      2:  { halign: 'center', cellWidth: 18 },
      3:  { cellWidth: 25 },
      4:  { cellWidth: 30 },
      5:  { cellWidth: 28 },
      6:  { halign: 'right', cellWidth: 28 },
      7:  { halign: 'right', cellWidth: 28 },
      8:  { halign: 'center', cellWidth: 22 },
      9:  { halign: 'center', cellWidth: 10 },
      10: { halign: 'center', cellWidth: 10 },
      11: { halign: 'center', cellWidth: 22 },
    },
    didParseCell(data) {
      // Warna merah jika nota belum ada
      if (data.column.index === 10 && data.cell.raw === '✗') {
        data.cell.styles.textColor = [239, 68, 68];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 10 && data.cell.raw === '✓') {
        data.cell.styles.textColor = [16, 185, 129];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    // Footer setiap halaman
    didDrawPage(data) {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `BAWDI Maintenance System — PT. Bantu Kawal Distribusi — Halaman ${data.pageNumber} dari ${pageCount}`,
        pageW / 2, doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      );
    },
  });

  // ── Ringkasan per kendaraan (halaman baru) ────────────────
  doc.addPage();

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(245, 158, 11);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('RINGKASAN PER KENDARAAN', 14, 14);

  const byKendaraan = drafts.reduce((acc, d) => {
    const k = d.kendaraan || '—';
    if (!acc[k]) acc[k] = { count: 0, totalNilai: 0, totalBayar: 0, revisiTotal: 0 };
    acc[k].count++;
    acc[k].totalNilai += Number(d.total_harga) || 0;
    acc[k].totalBayar += Number(d.jumlah_bayar) || 0;
    acc[k].revisiTotal += Number(d.revisi_count) || 0;
    return acc;
  }, {});

  autoTable(doc, {
    startY: 28,
    head: [['Plat Kendaraan', 'Jml Pengajuan', 'Total Nilai', 'Total Dibayar', 'Selisih', 'Total Revisi']],
    body: Object.entries(byKendaraan).map(([plat, v]) => [
      plat,
      v.count,
      fmtCurrencyExport(v.totalNilai),
      fmtCurrencyExport(v.totalBayar),
      fmtCurrencyExport(v.totalNilai - v.totalBayar),
      v.revisiTotal,
    ]),
    foot: [[
      'TOTAL',
      drafts.length,
      fmtCurrencyExport(totalNilai),
      fmtCurrencyExport(totalBayar),
      fmtCurrencyExport(totalNilai - totalBayar),
      drafts.reduce((s, d) => s + (Number(d.revisi_count) || 0), 0),
    ]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [245, 158, 11], fontStyle: 'bold' },
    footStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { halign: 'center', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 50 },
      3: { halign: 'right', cellWidth: 50 },
      4: { halign: 'right', cellWidth: 50 },
      5: { halign: 'center', cellWidth: 25 },
    },
  });

  // Download
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  doc.save(`${fileName}_${dateStr}.pdf`);
}

/* ═══════════════════════════════════════════════════════════
   EXPORT PDF SINGLE — untuk 1 pengajuan detail
═══════════════════════════════════════════════════════════ */
export async function exportSinglePDF(sub) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ── Kop surat ─────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(245, 158, 11);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('BAWDI', 14, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('PT. Bantu Kawal Distribusi', 14, 18);
  doc.text('Jl. Rajawali Sakti, Ruko Komplek Royal Regency, Kota Pekanbaru', 14, 23);

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.text(`Dicetak: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - 14, 23, { align: 'right' });

  // ── Judul dokumen ──────────────────────────────────────────
  const typeLabel = sub.type === 'PAR' ? 'PURCHASE AUTHORIZATION REQUEST' : 'PURCHASE REQUISITION';
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(typeLabel, pageW / 2, 38, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Nomor: ${sub.nomor_pengajuan}`, pageW / 2, 44, { align: 'center' });

  // Status badge
  const statusColors = {
    'Selesai': [16, 185, 129],
    'Disetujui': [16, 185, 129],
    'Ditolak': [239, 68, 68],
    'Perlu Revisi': [124, 58, 237],
  };
  const sc = statusColors[sub.status] || [100, 116, 139];
  doc.setFillColor(...sc);
  const statusLabel = sub.status || 'Selesai';
  const statusW = doc.getTextWidth(statusLabel) + 8;
  doc.roundedRect(pageW / 2 - statusW / 2, 46, statusW, 6, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text(statusLabel, pageW / 2, 50.5, { align: 'center' });

  // ── Tabel info pemohon ────────────────────────────────────
  autoTable(doc, {
    startY: 58,
    head: [['INFORMASI PEMOHON', '']],
    body: [
      ['Pemohon', sub.pemohon?.name || sub.pemohon_name || '—'],
      ['Jabatan', sub.pemohon?.jabatan || '—'],
      ['Cabang / Project', sub.cabang || sub.pemohon_cabang || '—'],
      ['Kendaraan / Plat', sub.kendaraan || '—'],
      ['Vendor / Bengkel', sub.vendor_pilihan === 2 ? (sub.vendor2||'—') : (sub.vendor||'—')],
      ['Jenis Pembelian', sub.jenis_pembelian || '—'],
      ['Tanggal Pengajuan', fmtDateExport(sub.tanggal)],
      ['Batas Waktu Dana', sub.batas_waktu_dana || '—'],
      ['Batas Akhir Bayar', fmtDateExport(sub.batas_akhir_pembayaran)],
    ],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [245, 158, 11], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: [100, 116, 139] }, 1: { cellWidth: 120 } },
    theme: 'grid',
  });

  // ── Tabel keterangan ──────────────────────────────────────
  const lastY1 = (doc as any).lastAutoTable.finalY;
  autoTable(doc, {
    startY: lastY1 + 4,
    head: [['KETERANGAN', '']],
    body: [
      ['Alasan Pengajuan', sub.alasan || '—'],
      ['Riwayat Sebelumnya', sub.riwayat || '—'],
      ...(sub.alasan_tolak ? [['Alasan Penolakan', sub.alasan_tolak]] : []),
    ],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [245, 158, 11], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: [100, 116, 139] }, 1: { cellWidth: 120 } },
    theme: 'grid',
  });

  // ── Tabel item rincian ────────────────────────────────────
  const items = sub.items || [];
  if (items.length > 0) {
    const lastY2 = (doc as any).lastAutoTable.finalY;
    autoTable(doc, {
      startY: lastY2 + 4,
      head: [['No', 'Penjelasan Item', 'Vendor', 'Satuan', 'Harga (Rp)']],
      body: [
        ...items.map((item, i) => [
          i + 1,
          item.penjelasan || '',
          item.vendor_num === 2 ? 'Vendor 2' : 'Vendor 1',
          item.satuan || '',
          fmtCurrencyExport(item.total || item.harga),
        ]),
        ['', '', '', 'TOTAL', fmtCurrencyExport(sub.total_harga)],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [30, 41, 59], textColor: [245, 158, 11], fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 85 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 30 },
      },
      didParseCell(data) {
        if (data.row.index === items.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255, 251, 235];
          data.cell.styles.textColor = [245, 158, 11];
        }
      },
      theme: 'grid',
    });
  }

  // ── Pembayaran ────────────────────────────────────────────
  if (sub.tanggal_bayar || sub.jumlah_bayar) {
    const lastY3 = (doc as any).lastAutoTable.finalY;
    autoTable(doc, {
      startY: lastY3 + 4,
      head: [['PEMBAYARAN', '']],
      body: [
        ['Tanggal Bayar', fmtDateTimeExport(sub.tanggal_bayar)],
        ['Jumlah Dibayar', fmtCurrencyExport(sub.jumlah_bayar)],
        ['Catatan Bayar', sub.catatan_bayar || '—'],
        ['Nota Pembayaran', sub.nota_url ? 'Tersedia (lihat sistem)' : 'Belum ada'],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold', textColor: [100, 116, 139] }, 1: { cellWidth: 120 } },
      theme: 'grid',
    });
  }

  // ── Tanda tangan ──────────────────────────────────────────
  const lastY4 = (doc as any).lastAutoTable.finalY;
  const sigY   = lastY4 + 10;
  const sigW   = (pageW - 28) / 3;

  ['Dibuat Oleh', 'Diketahui (Verifikator)', 'Disetujui (Approval)'].forEach((label, i) => {
    const x = 14 + i * (sigW + 4);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(x, sigY, sigW, 28);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + sigW / 2, sigY + 5, { align: 'center' });

    const names = [
      sub.pemohon?.name || sub.pemohon_name,
      sub.verifikator?.name || sub.verifikator_name,
      sub.approver?.name || sub.approver_name,
    ];
    const jabatans = [
      sub.pemohon?.jabatan,
      sub.verifikator?.jabatan,
      sub.approver?.jabatan,
    ];

    if (names[i]) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(names[i] || '', x + sigW / 2, sigY + 22, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(jabatans[i] || '', x + sigW / 2, sigY + 27, { align: 'center' });
    }
  });

  // ── Footer ────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Dokumen ini digenerate secara otomatis oleh BAWDI Maintenance System', pageW / 2, 285, { align: 'center' });

  // Download
  const safeNomor = (sub.nomor_pengajuan || 'pengajuan').replace(/\//g, '-');
  doc.save(`PR_${safeNomor}.pdf`);
}
