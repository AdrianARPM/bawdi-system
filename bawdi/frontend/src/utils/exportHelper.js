// src/utils/exportHelper.js  — v6
// Export PDF — selalu gunakan data revisi terakhir jika ada

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

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(245, 158, 11); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('BAWDI', 14, 10);
  doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('PT. Bantu Kawal Distribusi — Sistem Pengajuan Maintenance', 14, 16);
  doc.setTextColor(148, 163, 184); doc.setFontSize(8);
  doc.text(`Dicetak: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - 14, 16, { align: 'right' });

  // Judul
  doc.setTextColor(30, 41, 59); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN DRAFT / ARSIP PENGAJUAN', 14, 32);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  let ft = 'Filter: Semua pengajuan';
  if (filterInfo.kendaraan)  ft  = `Plat: ${filterInfo.kendaraan}`;
  if (filterInfo.bulanLabel) ft += (filterInfo.kendaraan ? ' · ' : 'Filter: ') + `Bulan: ${filterInfo.bulanLabel}`;
  doc.text(ft, 14, 38);

  // Summary boxes
  const totalBayar = drafts.reduce((s, d) => s + (Number(d.jumlah_bayar) || 0), 0);
  const totalNilai = drafts.reduce((s, d) => s + (Number(d.total_harga) || 0), 0);
  const boxW = (pageW - 28 - 8) / 3;
  [{ label: 'Total Arsip', value: `${drafts.length} pengajuan`, color: [59, 130, 246] },
   { label: 'Total Nilai',  value: fmtCurrencyExport(totalNilai), color: [245, 158, 11] },
   { label: 'Total Dibayar',value: fmtCurrencyExport(totalBayar), color: [16, 185, 129] }].forEach((box, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setFillColor(...box.color);
    doc.roundedRect(x, 42, boxW, 16, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(box.label.toUpperCase(), x + 4, 48);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text(box.value, x + 4, 54);
  });

  // Tabel utama
  autoTable(doc, {
    startY: 64,
    head: [['No', 'Nomor Pengajuan', 'Plat', 'Pemohon', 'Vendor', 'Jenis', 'Total', 'Dibayar', 'Tgl Bayar', 'Rev', 'Nota', 'Tgl Tutup']],
    body: drafts.map((d, i) => [
      i + 1, d.nomor_pengajuan || '', d.kendaraan || '', d.pemohon_name || '',
      d.vendor_pilihan === 2 ? (d.vendor2 || '') : (d.vendor || ''),
      d.jenis_pembelian || '',
      fmtCurrencyExport(d.total_harga), fmtCurrencyExport(d.jumlah_bayar),
      d.tanggal_bayar ? fmtDateExport(d.tanggal_bayar) : '—',
      d.revisi_count || 0, d.nota_url ? '✓' : '✗',
      d.ditutup_at ? fmtDateExport(d.ditutup_at) : '—',
    ]),
    styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [241, 245, 249], lineWidth: 0.3 },
    headStyles: { fillColor: [15, 23, 42], textColor: [245, 158, 11], fontStyle: 'bold', fontSize: 7, halign: 'center' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0:{ halign:'center',cellWidth:8 }, 1:{ cellWidth:38 }, 2:{ halign:'center',cellWidth:18 },
      3:{ cellWidth:25 }, 4:{ cellWidth:30 }, 5:{ cellWidth:28 },
      6:{ halign:'right',cellWidth:28 }, 7:{ halign:'right',cellWidth:28 },
      8:{ halign:'center',cellWidth:22 }, 9:{ halign:'center',cellWidth:8 },
      10:{ halign:'center',cellWidth:8 }, 11:{ halign:'center',cellWidth:22 },
    },
    didParseCell(data) {
      if (data.column.index === 10) {
        data.cell.styles.textColor = data.cell.raw === '✓' ? [16,185,129] : [239,68,68];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage(data) {
      doc.setFontSize(7); doc.setTextColor(148,163,184);
      doc.text(`BAWDI — Hal. ${data.pageNumber} dari ${doc.internal.getNumberOfPages()}`, pageW/2, pageH-5, {align:'center'});
    },
  });

  // Halaman 2: Ringkasan per kendaraan
  doc.addPage();
  doc.setFillColor(15,23,42); doc.rect(0,0,pageW,22,'F');
  doc.setTextColor(245,158,11); doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('RINGKASAN PER KENDARAAN', 14, 14);

  const byKendaraan = drafts.reduce((acc, d) => {
    const k = d.kendaraan || '—';
    if (!acc[k]) acc[k] = { count:0, totalNilai:0, totalBayar:0, revisi:0 };
    acc[k].count++; acc[k].totalNilai += Number(d.total_harga)||0;
    acc[k].totalBayar += Number(d.jumlah_bayar)||0; acc[k].revisi += Number(d.revisi_count)||0;
    return acc;
  }, {});

  autoTable(doc, {
    startY: 28,
    head: [['Plat Kendaraan','Jml Pengajuan','Total Nilai','Total Dibayar','Selisih','Total Revisi']],
    body: Object.entries(byKendaraan).map(([plat, v]) => [
      plat, v.count, fmtCurrencyExport(v.totalNilai), fmtCurrencyExport(v.totalBayar),
      fmtCurrencyExport(v.totalNilai - v.totalBayar), v.revisi,
    ]),
    foot: [['TOTAL', drafts.length, fmtCurrencyExport(totalNilai), fmtCurrencyExport(totalBayar),
      fmtCurrencyExport(totalNilai-totalBayar), drafts.reduce((s,d)=>s+(Number(d.revisi_count)||0),0)]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15,23,42], textColor: [245,158,11], fontStyle: 'bold' },
    footStyles: { fillColor: [245,158,11], textColor: [255,255,255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248,250,252] },
    columnStyles: { 0:{cellWidth:40}, 1:{halign:'center',cellWidth:30}, 2:{halign:'right',cellWidth:50}, 3:{halign:'right',cellWidth:50}, 4:{halign:'right',cellWidth:50}, 5:{halign:'center',cellWidth:25} },
    didDrawPage(data) {
      doc.setFontSize(7); doc.setTextColor(148,163,184);
      doc.text(`BAWDI — Hal. ${data.pageNumber} dari ${doc.internal.getNumberOfPages()}`, pageW/2, pageH-5, {align:'center'});
    },
  });

  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  doc.save(`${fileName}_${dateStr}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT PDF SINGLE — 1 pengajuan detail (portrait A4)
   SELALU gunakan data revisi terakhir yang disetujui (jika ada)
═══════════════════════════════════════════════════════════════ */
export async function exportSinglePDF(sub) {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Kop surat
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(245, 158, 11); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('BAWDI', 14, 12);
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('PT. Bantu Kawal Distribusi', 14, 18);
  doc.text('Jl. Rajawali Sakti, Ruko Komplek Royal Regency, Kota Pekanbaru', 14, 23);
  doc.setTextColor(148, 163, 184); doc.setFontSize(8);
  doc.text(`Dicetak: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - 14, 23, { align: 'right' });

  // Badge revisi jika ada
  if (sub._isRevision) {
    doc.setFillColor(124, 58, 237);
    const lbl = `REVISI KE-${sub._revisionNumber}`;
    const lw  = doc.getTextWidth(lbl) + 10;
    doc.roundedRect(pageW - 14 - lw, 6, lw, 6, 1, 1, 'F');
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica','bold');
    doc.text(lbl, pageW - 9, 10.5, {align:'right'});
  }

  // Judul dokumen
  const typeLabel = sub.type==='PAR' ? 'PURCHASE AUTHORIZATION REQUEST' : 'PURCHASE REQUISITION';
  doc.setTextColor(30,41,59); doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text(typeLabel, pageW/2, 38, {align:'center'});
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100,116,139);
  doc.text(`Nomor: ${sub.nomor_pengajuan}`, pageW/2, 44, {align:'center'});

  // Status badge
  const statusColors = { 'Selesai':[16,185,129],'Disetujui':[16,185,129],'Ditolak':[239,68,68],'Perlu Revisi':[124,58,237] };
  const sc = statusColors[sub.status] || [100,116,139];
  const sl = sub.status || 'Selesai';
  const sw = doc.getTextWidth(sl) + 10;
  doc.setFillColor(...sc);
  doc.roundedRect(pageW/2 - sw/2, 46, sw, 6, 1, 1, 'F');
  doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica','bold');
  doc.text(sl, pageW/2, 50.5, {align:'center'});

  // Info pemohon
  autoTable(doc, {
    startY: 58,
    head: [['INFORMASI PEMOHON', '']],
    body: [
      ['Pemohon',           sub.pemohon?.name    || sub.pemohon_name || '—'],
      ['Jabatan',           sub.pemohon?.jabatan || '—'],
      ['Cabang / Project',  sub.cabang           || sub.pemohon_cabang || '—'],
      ['Kendaraan / Plat',  sub.kendaraan        || '—'],
      ['Vendor / Bengkel',  sub.vendor_pilihan===2 ? (sub.vendor2||'—') : (sub.vendor||'—')],
      ...(sub.rekening_tujuan ? [['Rekening Tujuan', sub.rekening_tujuan]] : []),
      ['Jenis Pembelian',   sub.jenis_pembelian  || '—'],
      ['Tanggal Pengajuan', fmtDateExport(sub.tanggal)],
      ['Batas Waktu Dana',  sub.batas_waktu_dana || '—'],
      ['Batas Akhir Bayar', fmtDateExport(sub.batas_akhir_pembayaran)],
    ],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30,41,59], textColor: [245,158,11], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: [100,116,139] }, 1: { cellWidth: 118 } },
    theme: 'grid',
  });

  // Keterangan
  const y1 = doc.lastAutoTable.finalY;
  autoTable(doc, {
    startY: y1 + 4,
    head: [['KETERANGAN', '']],
    body: [
      ['Alasan Pengajuan',   sub.alasan  || '—'],
      ['Riwayat Sebelumnya', sub.riwayat || '—'],
      ...(sub.alasan_tolak ? [['Alasan Penolakan', sub.alasan_tolak]] : []),
    ],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30,41,59], textColor: [245,158,11], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold', textColor: [100,116,139] }, 1: { cellWidth: 118 } },
    theme: 'grid',
  });

  // Item rincian
  const items = sub.items || [];
  if (items.length > 0) {
    const y2 = doc.lastAutoTable.finalY;
    autoTable(doc, {
      startY: y2 + 4,
      head: [['No', 'Penjelasan Item', 'Vendor', 'Satuan', 'Harga (Rp)']],
      body: [
        ...items.map((item, i) => [
          i + 1, item.penjelasan || '',
          item.vendor_num === 2 ? 'Vendor 2' : 'Vendor 1',
          item.satuan || '', fmtCurrencyExport(item.total || item.harga),
        ]),
        ['', '', '', 'TOTAL', fmtCurrencyExport(sub.total_harga)],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      headStyles: { fillColor: [30,41,59], textColor: [245,158,11], fontStyle: 'bold' },
      columnStyles: { 0:{halign:'center',cellWidth:10}, 1:{cellWidth:88}, 2:{halign:'center',cellWidth:20}, 3:{halign:'center',cellWidth:24}, 4:{halign:'right',cellWidth:28} },
      didParseCell(data) {
        if (data.row.index === items.length) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [255,251,235];
          data.cell.styles.textColor = [245,158,11];
        }
      },
      theme: 'grid',
    });
  }

  // Pembayaran
  if (sub.tanggal_bayar || sub.jumlah_bayar) {
    const y3 = doc.lastAutoTable.finalY;
    autoTable(doc, {
      startY: y3 + 4,
      head: [['PEMBAYARAN', '']],
      body: [
        ['Tanggal & Jam Bayar', fmtDateTimeExport(sub.tanggal_bayar)],
        ['Jumlah Dibayar',      fmtCurrencyExport(sub.jumlah_bayar)],
        ['Catatan',             sub.catatan_bayar || '—'],
        ['Nota Pembayaran',     sub.nota_url ? 'Tersedia (lihat sistem)' : 'Belum ada'],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [16,185,129], textColor: [255,255,255], fontStyle: 'bold' },
      columnStyles: { 0:{cellWidth:52,fontStyle:'bold',textColor:[100,116,139]}, 1:{cellWidth:118} },
      theme: 'grid',
    });
  }

  // Tanda tangan
  const y4   = doc.lastAutoTable.finalY;
  const sigY = y4 + 10;
  const finalSigY = sigY + 30 > pageH - 10 ? (doc.addPage(), 20) : sigY;
  const sigW = (pageW - 28) / 3;

  [
    { label: 'Dibuat Oleh',             name: sub.pemohon?.name    || sub.pemohon_name,    jabatan: sub.pemohon?.jabatan },
    { label: 'Diketahui (Verifikator)', name: sub.verifikator?.name || sub.verifikator_name, jabatan: sub.verifikator?.jabatan },
    { label: 'Disetujui (Approval)',    name: sub.approver?.name   || sub.approver_name,   jabatan: sub.approver?.jabatan },
  ].forEach((sig, i) => {
    const x = 14 + i * (sigW + 4);
    doc.setDrawColor(226,232,240); doc.setLineWidth(0.3);
    doc.rect(x, finalSigY, sigW, 28);
    doc.setFontSize(8); doc.setTextColor(100,116,139); doc.setFont('helvetica','normal');
    doc.text(sig.label, x + sigW/2, finalSigY + 5, {align:'center'});
    if (sig.name) {
      doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
      doc.text(sig.name, x + sigW/2, finalSigY + 22, {align:'center'});
      if (sig.jabatan) {
        doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(100,116,139);
        doc.text(sig.jabatan, x + sigW/2, finalSigY + 27, {align:'center'});
      }
    }
  });

  // Footer semua halaman
  const totalPages = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFontSize(7); doc.setTextColor(148,163,184);
    doc.text(`Dokumen digenerate otomatis BAWDI Maintenance System${sub._isRevision?` — Revisi ke-${sub._revisionNumber} (Final)`:''} — Hal. ${pg}/${totalPages}`,
      pageW/2, pageH-5, {align:'center'});
  }

  const safeNomor = (sub.nomor_pengajuan||'pengajuan').replace(/\//g,'-');
  const suffix    = sub._isRevision ? `_Rev${sub._revisionNumber}` : '';
  doc.save(`PR_${safeNomor}${suffix}.pdf`);
}
