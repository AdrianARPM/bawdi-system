// src/utils/exportHelper.js
// Desain PDF disesuaikan dengan template Purchase Requisition BAWDI
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

  // Summary boxes
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

  // Tabel
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
      fillColor: [241, 245, 249], 
      textColor: [51, 65, 85],     
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

  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  doc.save(`Draft_Pengajuan_BAWDI_${dateStr}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT PDF SINGLE — 1 pengajuan (portrait A4)
   Sesuai desain mockup (A4 presisi)
═══════════════════════════════════════════════════════════════ */
export async function exportSinglePDF(sub) {
  const { default: jsPDF }     = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;

  // ── Header Perusahaan ─────────────────────────────────────────
try {                                                               // ✅ try added
  doc.addImage(LOGO_PATH, 'JPEG', pageW - margin - 40, 6, 40, 24);
} catch (e) {                                                      // ✅ closing } added
  console.warn("Logo tidak ditemukan");
}

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('PT. Bantu Kawal Distribusi', margin, 29);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  doc.text('Jl. Rajawali Sakti, Ruko Komplek Royal Regency, Kota Pekanbaru', margin, 34);

  // Garis Bawah Header
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.line(margin, 38, pageW - margin, 38);

  // ── Judul Dokumen & Status ────────────────────────────────────
  let currentY = 48;
  const typeLabel = sub.type === 'PAR' ? 'PURCHASE AUTHORIZATION REQUEST' : 'PURCHASE REQUISITION';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(typeLabel, margin, currentY);
  
  // Underline Judul
  const titleWidth = doc.getTextWidth(typeLabel);
  doc.setLineWidth(0.4);
  doc.line(margin, currentY + 1, margin + titleWidth, currentY + 1);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Nomor: ${sub.nomor_pengajuan || '—'}`, margin, currentY + 7);

  // Status Badge (Kanan Atas)
  const statusText = sub.status || 'Menunggu Verifikasi';
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const statusWidth = doc.getTextWidth(statusText) + 6;
  const statusX = pageW - margin - statusWidth;
  
  // Warna dinamis badge status
  let fillC = [254, 249, 195]; let borderC = [253, 224, 71]; let textC = [133, 77, 14]; // Kuning (Menunggu)
  if (statusText.toLowerCase().includes('selesai') || statusText.toLowerCase().includes('disetujui')) {
    fillC = [220, 252, 231]; borderC = [134, 239, 172]; textC = [22, 101, 52]; // Hijau
  } else if (statusText.toLowerCase().includes('tolak')) {
    fillC = [254, 226, 226]; borderC = [252, 165, 165]; textC = [153, 27, 27]; // Merah
  }

  doc.setFillColor(...fillC);
  doc.setDrawColor(...borderC);
  doc.roundedRect(statusX, currentY - 5, statusWidth, 6.5, 1, 1, 'FD');
  doc.setTextColor(...textC);
  doc.text(statusText, statusX + 3, currentY - 0.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Dicetak: ${fmtDateTimeExport(new Date().toISOString())}`, pageW - margin, currentY + 7, { align: 'right' });

  currentY += 18;

  // ── Grid Metadata (2 Kolom) ───────────────────────────────────
  const col1X = margin;
  const col1ValX = margin + 35;
  const col2X = margin + 95;
  const col2ValX = margin + 130;
  const rowH = 6;

  const metadata = [
    [
      { label: 'Pemohon', val: sub.pemohon?.name || sub.pemohon_name || '—', bold: true },
      { label: 'Vendor / Bengkel', val: sub.vendor_pilihan === 2 ? (sub.vendor2 || '—') : (sub.vendor || '—'), bold: true }
    ],
    [
      { label: 'Jabatan', val: sub.pemohon?.jabatan || '—' },
      { label: 'Rekening Tujuan', val: sub.rekening_tujuan || '—' }
    ],
    [
      { label: 'Cabang/Project', val: sub.cabang || sub.pemohon_cabang || '—' },
      { label: 'Jenis Pembelian', val: sub.jenis_pembelian || '—' }
    ],
    [
      { label: 'Kendaraan / Plat', val: sub.kendaraan || '—', bold: true },
      { label: 'Tanggal Pengajuan', val: fmtDateExport(sub.tanggal) }
    ]
  ];

  doc.setFontSize(9);
  metadata.forEach(row => {
    // Kolom 1
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(row[0].label, col1X, currentY);
    doc.text(':', col1ValX - 2, currentY);
    doc.setFont('helvetica', row[0].bold ? 'bold' : 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(row[0].val, col1ValX, currentY);

    // Kolom 2
    if (row[1]) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text(row[1].label, col2X, currentY);
      doc.text(':', col2ValX - 2, currentY);
      doc.setFont('helvetica', row[1].bold ? 'bold' : 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(row[1].val, col2ValX, currentY);
    }
    currentY += rowH;
  });

  currentY += 4;

  // ── Box Keterangan ────────────────────────────────────────────
  doc.setFontSize(9);
  const riwayatText = sub.riwayat || '—';
  const riwayatLines = doc.splitTextToSize(riwayatText, pageW - margin * 2 - 45);

  const boxY = currentY;
  const boxPadding = 5;
  let innerY = boxY + boxPadding + 3;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('KETERANGAN', margin + boxPadding, innerY);
  doc.setLineWidth(0.3);
  doc.line(margin + boxPadding, innerY + 1, margin + boxPadding + doc.getTextWidth('KETERANGAN'), innerY + 1);

  innerY += 7;

  // Alasan
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text('Alasan Pengajuan', margin + boxPadding, innerY);
  doc.text(':', margin + boxPadding + 32, innerY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(sub.alasan || '—', margin + boxPadding + 35, innerY);

  innerY += 6;

  // Riwayat
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text('Riwayat Sebelumnya', margin + boxPadding, innerY);
  doc.text(':', margin + boxPadding + 32, innerY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(riwayatLines, margin + boxPadding + 35, innerY);

  // Gambar outline Box
  const boxHeight = (innerY - boxY) + (riwayatLines.length * 4) + boxPadding;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.rect(margin, boxY, pageW - margin * 2, boxHeight, 'S');

  currentY = boxY + boxHeight + 8;

  // ── Tabel Item ────────────────────────────────────────────────
  const items = sub.items || [];
  const tableBody = items.map((item, i) => [
    i + 1,
    item.penjelasan || '',
    item.vendor_num === 2 ? 'Vendor 2' : 'Vendor 1',
    item.satuan || '1',
    fmtCurrencyExport(item.total || item.harga)
  ]);

  // Baris Total
  tableBody.push([
    { content: 'TOTAL', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
    { content: fmtCurrencyExport(sub.total_harga), styles: { fontStyle: 'bold' } }
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'Penjelasan Item', 'Vendor', 'Satuan', 'Harga (Rp)']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 9,
      textColor: [0, 0, 0],
      lineColor: [150, 150, 150],
      lineWidth: 0.3,
      cellPadding: 2.5
    },
    headStyles: {
      fillColor: [243, 244, 246], // abu-abu terang
      textColor: [50, 50, 50],
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 35, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: margin, right: margin }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // Handle Page Break sebelum Footer Info
  if (currentY + 50 > pageH) {
    doc.addPage();
    currentY = margin;
  }

  // ── Info Pembayaran / Batas Waktu ─────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);

  doc.text('Batas Waktu Dana', margin, currentY);
  doc.text(':', margin + 30, currentY);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(sub.batas_waktu_dana ? `${sub.batas_waktu_dana} Hari` : '—', margin + 33, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Batas Akhir Bayar', margin + 70, currentY);
  doc.text(':', margin + 100, currentY);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(fmtDateExport(sub.batas_akhir_pembayaran), margin + 103, currentY);

  currentY += 20;

  // ── Tanda Tangan ──────────────────────────────────────────────
  const sigColW = (pageW - margin * 2) / 3;
  const sigData = [
    { title: 'Dibuat Oleh', name: sub.pemohon?.name || sub.pemohon_name, role: sub.pemohon?.jabatan || 'Staff Lapangan' },
    { title: 'Diketahui (Verifikator)', name: sub.verifikator?.name || sub.verifikator_name, role: sub.verifikator?.jabatan },
    { title: 'Disetujui (Approval)', name: sub.approver?.name || sub.approver_name, role: sub.approver?.jabatan },
  ];

  sigData.forEach((sig, i) => {
    const xCenter = margin + (sigColW * i) + (sigColW / 2);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(sig.title, xCenter, currentY, { align: 'center' });

    // Jarak tanda tangan
    const signAreaY = currentY + 22; 

    if (sig.name) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      const upperName = sig.name.toUpperCase();
      doc.text(upperName, xCenter, signAreaY, { align: 'center' });
      
      const nameWidth = doc.getTextWidth(upperName);
      doc.setLineWidth(0.3);
      doc.line(xCenter - nameWidth/2, signAreaY + 1, xCenter + nameWidth/2, signAreaY + 1);

      if(sig.role) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(sig.role, xCenter, signAreaY + 5, { align: 'center' });
      }
    } else {
      // Garis kosong jika belum ada nama
      doc.setLineWidth(0.4);
      doc.setDrawColor(0,0,0);
      doc.line(xCenter - 20, signAreaY + 1, xCenter + 20, signAreaY + 1);
    }
  });

  // ── Footer Halaman ────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    
    // Garis Footer
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
    
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text('Dokumen digenerate otomatis BAWD Maintenance System', margin, pageH - 8);
    doc.text(`Hal. ${pg}/${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  const safeNomor = (sub.nomor_pengajuan || 'pengajuan').replace(/\//g, '-');
  const suffix = sub._isRevision ? `_Rev${sub._revisionNumber}` : '';
  doc.save(`PR_${safeNomor}${suffix}.pdf`);
}
