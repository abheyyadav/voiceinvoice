// app.js — CLI entry point.
// Usage: node app.js <audio-file>

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

import { transcribeAudio } from "./lib/speech.js";
import { extractInvoice } from "./lib/extract.js";
import { buildInvoice } from "./lib/invoice.js";
import { renderInvoicePdf } from "./lib/pdf.js";
import { appendInvoice, countToday, CSV_PATH } from "./lib/ledger.js";

function slugify(s) {
  return String(s || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node app.js <audio-file>");
    process.exit(1);
  }

  const audioPath = resolve(arg);
  if (!existsSync(audioPath)) {
    console.error(`File not found: ${audioPath}`);
    process.exit(1);
  }

  console.log(`Audio: ${audioPath}`);
  console.log("Loading Whisper model on-device...");
  const t0 = Date.now();
  const transcript = await transcribeAudio(audioPath);
  if (!transcript) {
    console.error("❌ Could not understand any speech in the audio.");
    process.exit(2);
  }
  console.log(`\nTranscript:\n"${transcript}"\n`);

  console.log("Extracting invoice data...");
  const extracted = extractInvoice(transcript);
  if (!extracted.party && extracted.items.length === 0) {
    console.error("❌ Could not find a party name or any items in the transcript.");
    process.exit(2);
  }

  const dateISO = todayISO();
  const seqToday = (await countToday(CSV_PATH, dateISO)) + 1;
  const invoice = buildInvoice(extracted, { seqToday, issueDate: dateISO });

  console.log("Extracted:");
  console.log(`  Party:    ${invoice.party}`);
  console.log(`  Items:`);
  for (const it of invoice.items) {
    const unit = it.unit ? ` ${it.unit}` : "";
    console.log(`    - ${it.product.padEnd(14)} ${it.quantity}${unit} × ${invoice.currencySymbol}${it.unitPrice} = ${invoice.currencySymbol}${it.lineTotal}`);
  }
  console.log(`  Subtotal: ${invoice.currencySymbol}${invoice.subtotal}`);
  console.log(`  Tax:      ${invoice.currencySymbol}${invoice.tax}`);
  console.log(`  Total:    ${invoice.currencySymbol}${invoice.total}\n`);

  console.log("Rendering PDF...");
  const pdf = renderInvoicePdf(invoice);
  const filename = `invoice-${slugify(invoice.party)}-${invoice.issueDate}.pdf`;
  await writeFile(filename, pdf);
  console.log(`✅ Wrote ${filename} (${(pdf.length / 1024).toFixed(1)} KB)`);

  await appendInvoice(CSV_PATH, invoice);
  const total = await countToday(CSV_PATH, dateISO);
  console.log(`Appended to ${CSV_PATH} (${total} rows today, +1)`);

  console.log(`\nElapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("\n❌", err.message);
  process.exit(1);
});