// lib/pdf.js — Minimal, dependency-free PDF writer for VoiceInvoice.
// Produces an A4 single/multi-page invoice with Helvetica text.
// Reference: ISO 32000-1; PDF 1.4 spec.

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const ROW_H = 22;
const MAX_ROWS_FIRST_PAGE = 20;
const MAX_ROWS_OTHER_PAGES = 30;

// Escape a string for inclusion inside a PDF literal string ( ... )
function escapePdfText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]/g, " ");
}

// Format a number as "1,234.56" — used for currency display.
function fmtMoney(n) {
  const v = Number(n) || 0;
  const [intPart, decPart] = Math.abs(v).toFixed(2).split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = v < 0 ? "-" : "";
  return `${sign}${withCommas}.${decPart}`;
}

// Right-align a value at column x, using an approximate Helvetica width.
// Helvetica avg char width ≈ 0.5 × font size. Good enough for invoices.
function approxWidth(text, fontSize) {
  return String(text).length * fontSize * 0.5;
}

function text(x, y, str, { font = "F1", size = 11 } = {}) {
  return `BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(str)}) Tj ET`;
}

function rule(x1, y, x2, width = 0.75) {
  return `${width} w\n${x1} ${y} m ${x2} ${y} l S`;
}

// Build the content stream for one page of the invoice.
// `page` is { items: [...], subtotal, tax, total, currencySymbol, isFirst, isLast }
function buildPageStream(inv, page) {
  const cmds = [];
  let y = PAGE_H - MARGIN;

  if (page.isFirst) {
    cmds.push(text(MARGIN, y, "INVOICE", { font: "F2", size: 24 }));
    y -= 30;
    cmds.push(text(MARGIN, y, `Invoice #: ${inv.invoiceNo}`, { size: 11 }));
    y -= 16;
    cmds.push(text(MARGIN, y, `Date: ${inv.issueDate}`, { size: 11 }));
    y -= 30;

    cmds.push(text(MARGIN, y, "Bill To:", { size: 11 }));
    y -= 16;
    cmds.push(text(MARGIN, y, inv.party || "—", { font: "F2", size: 13 }));
    y -= 26;

    cmds.push(rule(MARGIN, y, PAGE_W - MARGIN));
    y -= 18;

    // Table header
    cmds.push(text(MARGIN + 0,   y, "#",          { font: "F2", size: 11 }));
    cmds.push(text(MARGIN + 25,  y, "Product",    { font: "F2", size: 11 }));
    cmds.push(text(MARGIN + 220, y, "Qty",        { font: "F2", size: 11 }));
    cmds.push(text(MARGIN + 290, y, "Unit Price", { font: "F2", size: 11 }));
    cmds.push(text(MARGIN + 400, y, "Total",      { font: "F2", size: 11 }));
    y -= 16;
    cmds.push(rule(MARGIN, y, PAGE_W - MARGIN));
    y -= 20;
  } else {
    cmds.push(text(MARGIN, y, `${inv.invoiceNo} (continued)`, { font: "F2", size: 14 }));
    y -= 26;
    cmds.push(rule(MARGIN, y, PAGE_W - MARGIN));
    y -= 20;
  }

  // Item rows
  for (const row of page.items) {
    const sym = inv.currencySymbol || "Rs.";
    cmds.push(text(MARGIN + 0,   y, String(row.index),      { size: 11 }));
    cmds.push(text(MARGIN + 25,  y, String(row.product),    { size: 11 }));
    const qty = row.unit ? `${row.quantity} ${row.unit}` : String(row.quantity);
    cmds.push(text(MARGIN + 220, y, qty,                    { size: 11 }));
    cmds.push(text(MARGIN + 290, y, `${sym} ${fmtMoney(row.unitPrice)}`, { size: 11 }));
    cmds.push(text(MARGIN + 400, y, `${sym} ${fmtMoney(row.lineTotal)}`, { size: 11 }));
    y -= ROW_H;
  }

  if (page.isLast) {
    y -= 6;
    cmds.push(rule(MARGIN, y, PAGE_W - MARGIN));
    y -= 20;

    const sym = inv.currencySymbol || "Rs.";
    const labelX = PAGE_W - MARGIN - 200;
    const valueX = PAGE_W - MARGIN - 60;

    cmds.push(text(labelX, y, "Subtotal", { size: 11 }));
    cmds.push(text(valueX - approxWidth(`${sym} ${fmtMoney(inv.subtotal)}`, 11) + 60, y, `${sym} ${fmtMoney(inv.subtotal)}`, { size: 11 }));
    y -= 16;

    const taxPct = inv.tax && inv.subtotal ? ((inv.tax / inv.subtotal) * 100).toFixed(0) : "0";
    cmds.push(text(labelX, y, `Tax (${taxPct}%)`, { size: 11 }));
    cmds.push(text(valueX - approxWidth(`${sym} ${fmtMoney(inv.tax)}`, 11) + 60, y, `${sym} ${fmtMoney(inv.tax)}`, { size: 11 }));
    y -= 18;

    cmds.push(rule(labelX, y, PAGE_W - MARGIN, 1.0));
    y -= 18;

    cmds.push(text(labelX, y, "Total", { font: "F2", size: 13 }));
    cmds.push(text(valueX - approxWidth(`${sym} ${fmtMoney(inv.total)}`, 13) + 60, y, `${sym} ${fmtMoney(inv.total)}`, { font: "F2", size: 13 }));
    y -= 40;

    cmds.push(text(MARGIN, y, "Generated locally by VoiceInvoice", { size: 10 }));
    y -= 14;
    cmds.push(text(MARGIN, y, "No data left this device.", { size: 10 }));
  }

  return cmds.join("\n");
}

// Paginate items into pages.
function paginate(items) {
  const pages = [];
  let i = 0;
  // First page
  pages.push(items.slice(0, MAX_ROWS_FIRST_PAGE));
  i = MAX_ROWS_FIRST_PAGE;
  while (i < items.length) {
    pages.push(items.slice(i, i + MAX_ROWS_OTHER_PAGES));
    i += MAX_ROWS_OTHER_PAGES;
  }
  return pages;
}

// Render an invoice object to a PDF Buffer.
export function renderInvoicePdf(inv) {
  if (!inv || typeof inv !== "object") throw new Error("Invalid invoice object");

  // Number items
  const itemsWithIdx = (inv.items || []).map((it, i) => ({ ...it, index: i + 1 }));
  const pages = paginate(itemsWithIdx);

  const pageStreams = pages.map((pageItems, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === pages.length - 1;
    return buildPageStream(inv, { items: pageItems, isFirst, isLast });
  });

  // ---- Build PDF objects ----
  // Object numbering:
  //  1: Catalog
  //  2: Pages
  //  3..(2+N): Page objects
  //  (3+N): Font F1 (Helvetica)
  //  (4+N): Font F2 (Helvetica-Bold)
  //  (5+N)..: Content streams
  const N = pages.length;
  const objCatalog = 1;
  const objPages = 2;
  const pageObjStart = 3;
  const fontF1 = pageObjStart + N;
  const fontF2 = fontF1 + 1;
  const contentStart = fontF2 + 1;
  const totalObjects = contentStart + N - 1;

  const objects = [];

  // 1: Catalog
  objects[objCatalog] = `<< /Type /Catalog /Pages ${objPages} 0 R >>`;

  // 2: Pages
  const pageRefs = [];
  for (let i = 0; i < N; i++) pageRefs.push(`${pageObjStart + i} 0 R`);
  objects[objPages] =
    `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${N} >>`;

  // 3..2+N: Page objects
  for (let i = 0; i < N; i++) {
    objects[pageObjStart + i] =
      `<< /Type /Page /Parent ${objPages} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${fontF1} 0 R /F2 ${fontF2} 0 R >> >> ` +
      `/Contents ${contentStart + i} 0 R >>`;
  }

  // Fonts
  objects[fontF1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objects[fontF2] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

  // Content streams
  for (let i = 0; i < N; i++) {
    const stream = pageStreams[i];
    const len = Buffer.byteLength(stream, "latin1");
    objects[contentStart + i] = `<< /Length ${len} >>\nstream\n${stream}\nendstream`;
  }

  // ---- Serialize ----
  const chunks = [];
  const offsets = [];
  let bytePos = 0;

  const header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
  chunks.push(Buffer.from(header, "latin1"));
  bytePos += Buffer.byteLength(header, "latin1");

  for (let i = 1; i <= totalObjects; i++) {
    const body = objects[i];
    if (body == null) throw new Error(`Missing PDF object ${i}`);
    const objStr = `${i} 0 obj\n${body}\nendobj\n`;
    offsets[i] = bytePos;
    const buf = Buffer.from(objStr, "latin1");
    chunks.push(buf);
    bytePos += buf.length;
  }

  // xref
  const xrefStart = bytePos;
  let xref = `xref\n0 ${totalObjects + 1}\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjects; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(Buffer.from(xref, "latin1"));

  const trailer =
    `trailer\n<< /Size ${totalObjects + 1} /Root ${objCatalog} 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(trailer, "latin1"));

  return Buffer.concat(chunks);
}