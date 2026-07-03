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
  doc.text('PT. Bantu Kawal Distribusi', margin, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  doc.text('Jl. Rajawali Sakti, Ruko Komplek Royal Regency, Kota Pekanbaru', margin, 30);

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
  const rowH = 4;

  const metadata = [
    [
      { label: 'Pemohon', val: sub.pemohon?.name || sub.pemohon_name || '—', bold: true },
      { label: 'Vendor / Bengkel', val: sub.vendor_pilihan === 2 ? (sub.vendor2 || '—') : (sub.vendor || '—'), bold: true }
    ],
    [
      { label: 'Tanggal Pengajuan', val: fmtDateExport(sub.tanggal) },
      { label: 'Rekening Tujuan', val: sub.rekening_tujuan || '—' }
    ],
    [
      { label: 'Cabang/Project', val: sub.cabang_manual || sub.cabang || sub.pemohon_cabang || '—' },
      { label: 'Jenis Pembelian', val: sub.jenis_pembelian || '—' }
    ],
    [
      { label: 'Kendaraan / Plat', val: sub.kendaraan || '—', bold: true },
      { label: 'NPWP/KTP', val: sub.npwp || '—' }
    ]
  ];

  doc.setFontSize(8);
  // Lebar area nilai tiap kolom (agar teks panjang membungkus, tidak menembus kertas)
  const valW1 = col2X - col1ValX - 3;
  const valW2 = (pageW - margin) - col2ValX - 1;
  const metaLineH = 4;
  metadata.forEach(row => {
    // Kolom 1
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 100, 100);
    doc.text(row[0].label, col1X, currentY);
    doc.text(':', col1ValX - 2, currentY);
    doc.setFont('helvetica', row[0].bold ? 'bold' : 'normal');
    doc.setTextColor(0, 0, 0);
    const lines1 = doc.splitTextToSize(String(row[0].val ?? '—'), valW1);
    doc.text(lines1, col1ValX, currentY);

    // Kolom 2
    let lines2 = [];
    if (row[1]) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 100, 100);
      doc.text(row[1].label, col2X, currentY);
      doc.text(':', col2ValX - 2, currentY);
      doc.setFont('helvetica', row[1].bold ? 'bold' : 'normal');
      doc.setTextColor(0, 0, 0);
      lines2 = doc.splitTextToSize(String(row[1].val ?? '—'), valW2);
      doc.text(lines2, col2ValX, currentY);
    }
    currentY += Math.max(lines1.length, lines2.length, 1) * metaLineH;
  });

  currentY += 2;

  // ── Tabel Item ────────────────────────────────────────────────
  // Kolom: No | Penjelasan Item | Satuan | Harga (Rp) | Total Harga
  const items = sub.items || [];
  let sumGross = 0, sumDiskon = 0;
  const tableBody = items.map((item, i) => {
    const diskon = parseFloat(item.diskon) || 0;   // diskon nominal per item
    const harga  = parseFloat(item.harga)  || 0;
    const net    = parseFloat(item.total)  || Math.max(0, (parseFloat(item.satuan) || 1) * harga - diskon);
    const gross  = net + diskon;                    // Total Harga per baris = kotor (sebelum diskon)
    sumGross  += gross;
    sumDiskon += diskon;
    return [
      i + 1,
      item.penjelasan || '',
      item.satuan     || '1',           // Satuan
      fmtCurrencyExport(harga),         // Harga(Rp)
      fmtCurrencyExport(gross),         // Total Harga = qty × harga (kotor)
    ];
  });

  // ── Baris ringkasan: TOTAL → DISKON → Ppn → TOTAL HARGA ──
  const ppnVal     = Number(sub.ppn) || 0;
  const grandTotal = sumGross - sumDiskon + ppnVal;
  const LIGHT = [253, 243, 231], BRAND = [240, 138, 36], WHITE = [255, 255, 255];
  const sLabel = (txt, o = {}) => ({ content: txt, colSpan: 4, styles: { halign: 'right', fontStyle: o.bold ? 'bold' : 'normal', fillColor: o.fill, textColor: o.color } });
  const sVal   = (txt, o = {}) => ({ content: txt,             styles: { halign: 'right', fontStyle: o.bold ? 'bold' : 'normal', fillColor: o.fill, textColor: o.color } });

  if (sumDiskon > 0 || ppnVal > 0) {
    tableBody.push([sLabel('TOTAL', { bold: true, fill: LIGHT }), sVal(fmtCurrencyExport(sumGross), { bold: true, fill: LIGHT })]);
    if (sumDiskon > 0) tableBody.push([sLabel('DISKON', { fill: LIGHT }), sVal('- ' + fmtCurrencyExport(sumDiskon), { fill: LIGHT })]);
    if (ppnVal   > 0)  tableBody.push([sLabel('Ppn',    { fill: LIGHT }), sVal('+ ' + fmtCurrencyExport(ppnVal),    { fill: LIGHT })]);
    tableBody.push([sLabel('TOTAL HARGA', { bold: true, fill: BRAND, color: WHITE }), sVal(fmtCurrencyExport(grandTotal), { bold: true, fill: BRAND, color: WHITE })]);
  } else {
    tableBody.push([sLabel('TOTAL HARGA', { bold: true, fill: BRAND, color: WHITE }), sVal(fmtCurrencyExport(grandTotal), { bold: true, fill: BRAND, color: WHITE })]);
  }

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'Rincian Item', 'Satuan', 'Harga(Rp)', 'Total Harga']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      textColor: [0, 0, 0],
      lineColor: [150, 150, 150],
      lineWidth: 0.3,
      cellPadding: 1.5
    },
    headStyles: {
      fillColor: [240, 138, 36],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 10,   halign: 'center' },   // No
      1: { cellWidth: 'auto' },                    // Rincian Item
      2: { cellWidth: 20,   halign: 'center' },    // Satuan
      3: { cellWidth: 32,   halign: 'right'  },    // Harga(Rp)
      4: { cellWidth: 34,   halign: 'right'  },    // Total Harga
    },
    margin: { left: margin, right: margin }
  });

  currentY = doc.lastAutoTable.finalY + 12;

  // ── Box Keterangan ────────────────────────────────────────────
  // Page break BEFORE drawing the box
  if (currentY + 40 > pageH - 15) {
    doc.addPage();
    currentY = margin;
  }

  // ── Box Keterangan — 2 KOLOM: Alasan (kiri) | Riwayat (kanan) ──
  doc.setFontSize(8);
  const boxPadding = 3;
  const gap        = 6;
  const innerW     = pageW - margin * 2 - boxPadding * 2;
  const colW       = (innerW - gap) / 2;
  const lineH      = 3.2;
  const colHeaderH = 5;     // jarak sub-judul kolom ke isi
  const titleH     = 8;     // judul KETERANGAN
  const footerSafeY = pageH - 15;

  // Wrap teks ke lebar kolom (separuh halaman)
  const alasanLines = doc.splitTextToSize(sub.alasan || '—', colW);
  const riwayatAll  = doc.splitTextToSize(
    (sub.riwayat || '—').replace(/\n\s*\n/g, '\n'), colW);

  // Page-break sebelum mulai box bila ruang minim
  if (currentY + titleH + colHeaderH + lineH * 4 > footerSafeY) {
    doc.addPage();
    currentY = margin;
  }

  let boxY        = currentY;
  let innerY      = boxY + boxPadding + 3;

  // Judul KETERANGAN
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('KETERANGAN', margin + boxPadding, innerY);
  doc.setLineWidth(0.3);
  doc.line(margin + boxPadding, innerY + 1,
           margin + boxPadding + doc.getTextWidth('KETERANGAN'), innerY + 1);
  innerY += titleH - boxPadding;

  const leftX  = margin + boxPadding;
  const rightX = margin + boxPadding + colW + gap;
  let   contentTopY = innerY;

// ── Kolom kiri: Alasan Pengajuan (hanya di halaman pertama) ──
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text('Alasan Pengajuan', leftX, contentTopY);

  let alasanY = contentTopY + colHeaderH;
  // Type di atas teks alasan (bila diisi)
  if (sub.alasan_type && String(sub.alasan_type).trim()) {
    const typeLines = doc.splitTextToSize(`Type: ${sub.alasan_type}`, colW);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(typeLines, leftX, alasanY);
    alasanY += typeLines.length * lineH + 1.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(alasanLines, leftX, alasanY);
  let leftBottomY = alasanY + alasanLines.length * lineH;

  // ── Kolom kanan: Riwayat Sebelumnya (dgn page-break bila panjang) ──
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text('Riwayat Sebelumnya', rightX, contentTopY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);

  let rY        = contentTopY + colHeaderH;
  let remaining = [...riwayatAll];

  while (remaining.length > 0) {
    const availH = footerSafeY - rY;
    const fits   = Math.max(1, Math.floor(availH / lineH));
    const chunk  = remaining.slice(0, fits);
    remaining    = remaining.slice(fits);
    doc.text(chunk, rightX, rY);
    const rightBottomY = rY + chunk.length * lineH;

    // Tinggi box halaman ini = max(kiri, kanan)
    const boxBottom = Math.max(leftBottomY, rightBottomY) + boxPadding;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.rect(margin, boxY, pageW - margin * 2, boxBottom - boxY, 'S');
    // Garis pemisah dua kolom
    doc.setDrawColor(220, 220, 220);
    const divX = margin + boxPadding + colW + gap / 2;
    doc.line(divX, contentTopY - 2, divX, boxBottom - 1);

    currentY = boxBottom + 6;

    if (remaining.length > 0) {
      doc.addPage();
      boxY        = margin;
      const cont  = boxY + boxPadding + 3;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 80);
      doc.text('Riwayat (lanjutan)', margin + boxPadding, cont);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      contentTopY = cont;
      leftBottomY = cont;          // tak ada alasan di halaman lanjutan
      rY          = cont + colHeaderH;
    }
  }

  // ── Pph23 (teks bebas, di bawah keterangan) ───────────────────
  if (sub.pph23 && String(sub.pph23).trim()) {
    if (currentY + 14 > pageH - 15) { doc.addPage(); currentY = margin; }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Pph23', margin, currentY);
    currentY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const pphLines = doc.splitTextToSize(String(sub.pph23), pageW - margin * 2);
    doc.text(pphLines, margin, currentY);
    currentY += pphLines.length * 4 + 6;
  }

  // ── Info Pembayaran / Batas Waktu ─────────────────────────────
  if (currentY + 20 > pageH - 15) {
    doc.addPage();
    currentY = margin;
  }

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
  if (currentY + 28 > pageH - 15) {
    doc.addPage();
    currentY = margin;
  }

  const sigColW = (pageW - margin * 2) / 3;
  const sigData = [
  { 
    title: 'Dibuat Oleh', 
    date: fmtDateExport(sub.created_at),           // ← add this
    name: sub.pemohon?.name || sub.pemohon_name, 
    role: sub.pemohon?.jabatan || 'Staff Lapangan' 
  },
  { 
    title: 'Diketahui (Verifikator)', 
    date: sub.verifikasi_at ? fmtDateExport(sub.verifikasi_at) : null,   // ← add this
    name: sub.verifikator?.name || sub.verifikator_name, 
    role: sub.verifikator?.jabatan 
  },
  { 
    title: 'Disetujui (Approval)', 
    date: sub.approval_at ? fmtDateExport(sub.approval_at) : null,       // ← add this
    name: sub.approver?.name || sub.approver_name, 
    role: sub.approver?.jabatan 
  },
];

  sigData.forEach((sig, i) => {
  const xCenter = margin + (sigColW * i) + (sigColW / 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(sig.title, xCenter, currentY, { align: 'center' });

  // ── Date above name ──────────────────────────────
  if (sig.date) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(sig.date, xCenter, currentY + 9, { align: 'center' }); 
  }

  const signAreaY = currentY + 14;

  if (sig.name) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const upperName = sig.name.toUpperCase();
    doc.text(upperName, xCenter, signAreaY, { align: 'center' });

    const nameWidth = doc.getTextWidth(upperName);
    doc.setLineWidth(0.3);
    doc.line(xCenter - nameWidth/2, signAreaY + 1, xCenter + nameWidth/2, signAreaY + 1);

    if (sig.role) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(sig.role, xCenter, signAreaY + 4, { align: 'center' });
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
    doc.text('Dokumen digenerate otomatis BAWDI Maintenance System', margin, pageH - 8);
    doc.text(`Hal. ${pg}/${totalPages}`, pageW - margin, pageH - 8, { align: 'right' });
  }

  const safeNomor = (sub.nomor_pengajuan || 'pengajuan').replace(/\//g, '-');
  const suffix = sub._isRevision ? `_Rev${sub._revisionNumber}` : '';
  doc.save(`PR_${safeNomor}${suffix}.pdf`);
}
