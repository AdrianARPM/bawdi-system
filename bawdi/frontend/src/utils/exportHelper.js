// src/utils/exportHelper.js  — v7
// Desain PDF baru: header putih (tanpa warna), header tabel abu-abu terang

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

  // Header — putih, border bawah tipis
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(0, 20, pageW, 20);

  doc.setTextColor(30, 41, 59); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('BAWDI', 14, 10);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text('PT. Bantu Kawal Distribusi — Pekanbaru', 14, 16);
  doc.setFontSize(8);
  doc.text(`Dicetak: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - 14, 13, { align: 'right' });

  // Judul
  doc.setTextColor(30, 41, 59); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN DRAFT / ARSIP PENGAJUAN', 14, 30);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  let ft = 'Filter: Semua pengajuan';
  if (filterInfo.kendaraan)  ft = `Plat: ${filterInfo.kendaraan}`;
  if (filterInfo.bulanLabel) ft += (filterInfo.kendaraan ? ' · ' : 'Filter: ') + `Bulan: ${filterInfo.bulanLabel}`;
  doc.text(ft, 14, 36);

  // Summary boxes — outline saja, tidak filled
  const totalBayar = drafts.reduce((s, d) => s + (Number(d.jumlah_bayar) || 0), 0);
  const totalNilai = drafts.reduce((s, d) => s + (Number(d.total_harga) || 0), 0);
  const boxW = (pageW - 28 - 8) / 3;
  const boxColors = [[59, 130, 246], [245, 158, 11], [16, 185, 129]];
  [
    { label: 'Total Arsip',   value: `${drafts.length} pengajuan` },
    { label: 'Total Nilai',   value: fmtCurrencyExport(totalNilai) },
    { label: 'Total Dibayar', value: fmtCurrencyExport(totalBayar) },
  ].forEach((box, i) => {
    const x = 14 + i * (boxW + 4);
    doc.setDrawColor(...boxColors[i]); doc.setLineWidth(0.5);
    doc.roundedRect(x, 40, boxW, 14, 2, 2, 'S');
    doc.setTextColor(...boxColors[i]); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(box.label.toUpperCase(), x + 3, 46);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(box.value, x + 3, 51);
  });

  // Tabel — header abu-abu terang
  autoTable(doc, {
    startY: 60,
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
    headStyles: {
      fillColor: [241, 245, 249],  // abu-abu terang
      textColor: [51, 65, 85],     // slate-700
      fontStyle: 'bold', fontSize: 7, halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0:{halign:'center',cellWidth:8},1:{cellWidth:38},2:{halign:'center',cellWidth:18},
      3:{cellWidth:25},4:{cellWidth:30},5:{cellWidth:28},
      6:{halign:'right',cellWidth:28},7:{halign:'right',cellWidth:28},
      8:{halign:'center',cellWidth:22},9:{halign:'center',cellWidth:8},
      10:{halign:'center',cellWidth:8},11:{halign:'center',cellWidth:22},
    },
    didParseCell(data) {
      if (data.column.index===10) {
        data.cell.styles.textColor = data.cell.raw==='✓'?[16,185,129]:[239,68,68];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage(data) {
      doc.setFontSize(7); doc.setTextColor(148,163,184);
      doc.text(`BAWDI — Hal. ${data.pageNumber}/${doc.internal.getNumberOfPages()}`, pageW/2, pageH-5, {align:'center'});
    },
  });

  // Halaman 2: Ringkasan per kendaraan
  doc.addPage();
  doc.setDrawColor(226,232,240); doc.setLineWidth(0.5); doc.line(0,20,pageW,20);
  doc.setTextColor(30,41,59); doc.setFontSize(14); doc.setFont('helvetica','bold');
  doc.text('RINGKASAN PER KENDARAAN', 14, 14);

  const byK = drafts.reduce((acc,d)=>{
    const k=d.kendaraan||'—';
    if(!acc[k]) acc[k]={count:0,totalNilai:0,totalBayar:0,revisi:0};
    acc[k].count++; acc[k].totalNilai+=Number(d.total_harga)||0;
    acc[k].totalBayar+=Number(d.jumlah_bayar)||0; acc[k].revisi+=Number(d.revisi_count)||0;
    return acc;
  },{});

  autoTable(doc, {
    startY: 26,
    head: [['Plat Kendaraan','Jml Pengajuan','Total Nilai','Total Dibayar','Selisih','Total Revisi']],
    body: Object.entries(byK).map(([plat,v])=>[plat,v.count,fmtCurrencyExport(v.totalNilai),fmtCurrencyExport(v.totalBayar),fmtCurrencyExport(v.totalNilai-v.totalBayar),v.revisi]),
    foot: [['TOTAL',drafts.length,fmtCurrencyExport(totalNilai),fmtCurrencyExport(totalBayar),fmtCurrencyExport(totalNilai-totalBayar),drafts.reduce((s,d)=>s+(Number(d.revisi_count)||0),0)]],
    styles: { fontSize: 9, cellPadding: 3, textColor: [51,65,85] },
    headStyles: { fillColor: [241,245,249], textColor: [51,65,85], fontStyle: 'bold' },
    footStyles: { fillColor: [248,250,252], textColor: [30,41,59], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248,250,252] },
    columnStyles: { 0:{cellWidth:40},1:{halign:'center',cellWidth:30},2:{halign:'right',cellWidth:50},3:{halign:'right',cellWidth:50},4:{halign:'right',cellWidth:50},5:{halign:'center',cellWidth:25} },
    didDrawPage(data) {
      doc.setFontSize(7); doc.setTextColor(148,163,184);
      doc.text(`BAWDI — Hal. ${data.pageNumber}/${doc.internal.getNumberOfPages()}`, pageW/2, pageH-5, {align:'center'});
    },
  });

  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  doc.save(`Draft_Pengajuan_BAWDI_${dateStr}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT PDF SINGLE — 1 pengajuan (portrait A4)
   Desain baru: header putih, tabel header abu-abu terang
═══════════════════════════════════════════════════════════════ */
export async function exportSinglePDF(sub) {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // ── Header — putih, border bawah ─────────────────────────────
  doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.5);
  doc.line(0, 22, pageW, 22);

  // Logo / nama perusahaan
  doc.setTextColor(30, 41, 59); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('BAWDI', 14, 12);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text('PT. Bantu Kawal Distribusi', 14, 18);
  doc.text('Jl. Rajawali Sakti, Ruko Komplek Royal Regency, Kota Pekanbaru', 14, 22.5);

  // Tanggal cetak (kanan atas)
  doc.setFontSize(8); doc.setTextColor(148, 163, 184);
  doc.text(`Dicetak: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - 14, 14, { align: 'right' });

  // Badge revisi (jika ada)
  if (sub._isRevision) {
    doc.setFillColor(237, 233, 254); doc.setTextColor(124, 58, 237);
    const lbl = `REVISI KE-${sub._revisionNumber}`;
    const lw  = doc.getTextWidth(lbl) + 8;
    doc.roundedRect(pageW - 14 - lw, 17, lw, 5.5, 1, 1, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(lbl, pageW - 10, 21, { align: 'right' });
  }

  // ── Judul dokumen ─────────────────────────────────────────────
  const typeLabel = sub.type === 'PAR' ? 'PURCHASE AUTHORIZATION REQUEST' : 'PURCHASE REQUISITION';
  doc.setTextColor(30, 41, 59); doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(typeLabel, pageW / 2, 34, { align: 'center' });

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text(`Nomor: ${sub.nomor_pengajuan}`, pageW / 2, 40, { align: 'center' });

  // Status badge (outline, tidak filled)
  const statusColors = {
    'Selesai': [16,185,129], 'Disetujui': [16,185,129],
    'Ditolak': [239,68,68], 'Perlu Revisi': [124,58,237],
    'Menunggu Verifikasi': [245,158,11], 'Terverifikasi': [59,130,246],
  };
  const sc  = statusColors[sub.status] || [100, 116, 139];
  const sl  = sub.status || 'Selesai';
  const sw  = doc.getTextWidth(sl) + 10;
  doc.setDrawColor(...sc); doc.setLineWidth(0.5);
  doc.roundedRect(pageW/2 - sw/2, 43, sw, 5.5, 1, 1, 'S');
  doc.setTextColor(...sc); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
  doc.text(sl, pageW/2, 47.2, { align: 'center' });

  // ── Tabel info pemohon ─────────────────────────────────────────
  const infoRows = [
    ['Pemohon',           sub.pemohon?.name    || sub.pemohon_name || '—'],
    ['Jabatan',           sub.pemohon?.jabatan || '—'],
    ['Cabang / Project',  sub.cabang           || sub.pemohon_cabang || '—'],
    ['Kendaraan / Plat',  sub.kendaraan        || '—'],
    ['Vendor / Bengkel',  sub.vendor_pilihan===2 ? (sub.vendor2||'—') : (sub.vendor||'—')],
    ...(sub.rekening_tujuan ? [['Rekening Tujuan', sub.rekening_tujuan]] : []),
    ['Jenis Pembelian',   sub.jenis_pembelian  || '—'],
    ['Tanggal Pengajuan', fmtDateExport(sub.tanggal)],
    ['Batas Waktu Dana',  sub.batas_waktu_dana ? `${sub.batas_waktu_dana} Hari` : '—'],
    ['Batas Akhir Bayar', fmtDateExport(sub.batas_akhir_pembayaran)],
  ];

  autoTable(doc, {
    startY: 52,
    body: infoRows,
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [51,65,85], lineColor: [226,232,240], lineWidth: 0.3 },
    columnStyles: {
      0: { cellWidth: 52, fontStyle: 'bold', textColor: [245, 158, 11] },
      1: { cellWidth: 120 },
    },
    theme: 'grid',
  });

  // ── Keterangan ────────────────────────────────────────────────
  const y1 = doc.lastAutoTable.finalY;
  autoTable(doc, {
    startY: y1 + 4,
    head: [['KETERANGAN', '']],
    body: [
      ['Alasan Pengajuan',   sub.alasan  || '—'],
      ['Riwayat Sebelumnya', sub.riwayat || '—'],
      ...(sub.alasan_tolak ? [['Alasan Penolakan', sub.alasan_tolak]] : []),
    ],
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [51,65,85], lineColor: [226,232,240], lineWidth: 0.3 },
    headStyles: {
      fillColor: [241, 245, 249],  // abu-abu terang
      textColor: [51, 65, 85],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 52, fontStyle: 'bold', textColor: [245, 158, 11] },
      1: { cellWidth: 120 },
    },
    theme: 'grid',
  });

  // ── Rincian Item ──────────────────────────────────────────────
  const items = sub.items || [];
  if (items.length > 0) {
    const y2 = doc.lastAutoTable.finalY;
    autoTable(doc, {
      startY: y2 + 4,
      head: [['No', 'Penjelasan Item', 'Vendor', 'Satuan', 'Harga (Rp)']],
      body: [
        ...items.map((item, i) => [
          i + 1, item.penjelasan||'',
          item.vendor_num===2?'Vendor 2':'Vendor 1',
          item.satuan||'', fmtCurrencyExport(item.total||item.harga),
        ]),
        ['', '', '', 'TOTAL', fmtCurrencyExport(sub.total_harga)],
      ],
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [51,65,85], lineColor: [226,232,240], lineWidth: 0.3 },
      headStyles: {
        fillColor: [241, 245, 249],  // abu-abu terang
        textColor: [51, 65, 85],
        fontStyle: 'bold',
      },
      columnStyles: {
        0:{halign:'center',cellWidth:10},
        1:{cellWidth:88},
        2:{halign:'center',cellWidth:20},
        3:{halign:'center',cellWidth:24},
        4:{halign:'right',cellWidth:28},
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

  // ── Pembayaran ────────────────────────────────────────────────
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
      styles: { fontSize: 9, cellPadding: 2.5, textColor: [51,65,85], lineColor: [226,232,240], lineWidth: 0.3 },
      headStyles: { fillColor: [236,253,245], textColor: [16,185,129], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 52, fontStyle: 'bold', textColor: [245,158,11] },
        1: { cellWidth: 120 },
      },
      theme: 'grid',
    });
  }

  // ── Tanda tangan ──────────────────────────────────────────────
  const y4     = doc.lastAutoTable.finalY;
  const sigY   = y4 + 10;
  const finalY = sigY + 30 > pageH - 10 ? (doc.addPage(), 20) : sigY;
  const sigW   = (pageW - 28) / 3;

  [
    { label: 'Dibuat Oleh',              name: sub.pemohon?.name    || sub.pemohon_name,    jabatan: sub.pemohon?.jabatan },
    { label: 'Diketahui (Verifikator)',  name: sub.verifikator?.name || sub.verifikator_name, jabatan: sub.verifikator?.jabatan },
    { label: 'Disetujui (Approval)',     name: sub.approver?.name   || sub.approver_name,   jabatan: sub.approver?.jabatan },
  ].forEach((sig, i) => {
    const x = 14 + i * (sigW + 4);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.3);
    doc.rect(x, finalY, sigW, 28);
    doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.setFont('helvetica', 'normal');
    doc.text(sig.label, x + sigW/2, finalY + 5, { align: 'center' });
    if (sig.name) {
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
      doc.text(sig.name, x + sigW/2, finalY + 22, { align: 'center' });
      if (sig.jabatan) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        doc.text(sig.jabatan, x + sigW/2, finalY + 27, { align: 'center' });
      }
    }
  });

  // ── Footer ────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setFontSize(7); doc.setTextColor(148, 163, 184);
    doc.text(
      `Dokumen digenerate otomatis BAWDI Maintenance System${sub._isRevision?` — Revisi ke-${sub._revisionNumber} (Final)`:''} — Hal. ${pg}/${totalPages}`,
      pageW/2, pageH - 5, { align: 'center' }
    );
  }

  const safeNomor = (sub.nomor_pengajuan||'pengajuan').replace(/\//g,'-');
  const suffix    = sub._isRevision ? `_Rev${sub._revisionNumber}` : '';
  doc.save(`PR_${safeNomor}${suffix}.pdf`);
}
